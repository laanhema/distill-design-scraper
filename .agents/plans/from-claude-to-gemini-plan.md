# Migrate the AI lane from Anthropic Claude to Google Gemini (free tier)

Status: **planned, not started.**

## Context

The three AI lanes (`interpret`, structure Stage 7, vision structure-from-image) all call Claude via `@anthropic-ai/sdk`, gated on `ANTHROPIC_API_KEY`. That key has never been set in this project, so **the AI lane has never actually run** — every lane silently falls back (measured-only report / heuristic naming / `structureUnavailableReason`).

Getting an Anthropic key requires a prepaid credit purchase. Google AI Studio issues a **free-tier key with no credit card**, covering vision-capable Flash models. Switching unblocks the AI lane at zero cost, at roughly 1/50th the per-analysis cost if it later goes paid.

There is also a **latent bug** that must be fixed as part of this: `temperature: 0.1` at `structureAI.ts:129` and `structureFromImage.ts:101` is rejected with a 400 by Claude Opus 4.7+. `retryOnce` swallows it twice and returns `null`. So even with a valid Anthropic key, those two lanes would never have worked. The rewrite deletes both lines.

**Decisions made:** Gemini-only replacement (remove `@anthropic-ai/sdk` entirely); `AI_MODEL = "gemini-3.5-flash"`.

**Outcome:** a working AI lane, one provider, one code path, three call sites simplified — and the fragile `text.match(/\{[\s\S]*\}/)` JSON extraction replaced by Gemini's native JSON mode.

## Verified SDK facts

Checked against `@google/genai@2.13.0` type definitions (current on npm, published 2026-07-21) — not from memory:

- `client.models.generateContent` is **still fully supported**. The newer `interactions.create` API exists but is less documented; stay on `models.generateContent`.
- `new GoogleGenAI({})` auto-reads `GEMINI_API_KEY` from env. Pass `{ apiKey }` explicitly anyway so the gate and the client can't disagree.
- Image parts: `{ inlineData: { mimeType, data } }` where `data` is raw base64.
- Response text: `response.text` (a getter, `string | undefined`) — no content-block filtering.
- **`config.responseJsonSchema` accepts real JSON Schema**, including `properties`, `required`, `enum`, `additionalProperties`, `$defs`, `$ref`, `anyOf`. This matters: `interpret.ts`'s existing `OUTPUT_SCHEMA` passes through essentially verbatim — no translation to the restricted OpenAPI dialect needed. (Use `responseJsonSchema`, *not* `responseSchema`; setting both is an error.)
- `responseMimeType: "application/json"` is **required** whenever a schema is set.
- Supported image MIME types: png, jpeg, webp, heic, heif — a superset of what `imageMediaType.ts` already emits, so that file needs no logic change.
- Gemini 3.x thinks by default and thinking tokens count against `maxOutputTokens`. Set `thinkingConfig.thinkingLevel` explicitly or short budgets will truncate before any answer is produced.

## Implementation

### 1. `lib/aiLane.ts` — the provider seam (the only file that imports the SDK)

Keep `retryOnce` exactly as-is. Replace the model id + availability check, and add a fourth primitive so no call site touches the SDK:

```ts
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import type { ImageMediaType } from "@/lib/extract/imageMediaType";

export const AI_MODEL = "gemini-3.5-flash";

export function aiLaneAvailable(): boolean {
  return Boolean(process.env.GEMINI_API_KEY);
}

export interface ModelCall {
  /** Base64 payloads + sniffed media type; omit for text-only lanes. */
  images?: { data: string; mediaType: ImageMediaType }[];
  system?: string;
  user: string;
  /** When set, turns on native JSON mode — kills the brace-match regex. */
  jsonSchema?: object;
  maxOutputTokens: number;
  thinkingLevel?: ThinkingLevel;
}

export async function callModel(opts: ModelCall): Promise<string | null>
```

Body: lazily construct one module-level `GoogleGenAI` (cheap, but avoids re-instantiating per retry), build `contents: [{ role: "user", parts: [...imageParts, { text: opts.user }] }]`, and pass `config: { systemInstruction?, maxOutputTokens, thinkingConfig: { thinkingLevel }, ...(jsonSchema ? { responseMimeType: "application/json", responseJsonSchema: jsonSchema } : {}) }`. Return `response.text ?? null`.

Also add one small shared helper here, replacing the two inline copies:

```ts
/** JSON mode should return clean JSON; a fence/preamble is still possible. */
export function parseJsonLoose(text: string | null): unknown | null
```

`JSON.parse` first, then fall back to the `/\{[\s\S]*\}/` brace match, then `null`. Same rationale as `roleMatch.ts` / `styleMatch.ts` — one shared matcher, not a third inline copy.

Update the file docstring: it currently says "every Claude-backed lane".

### 2. `lib/interpret.ts`

- Drop `import Anthropic`; import `callModel` from `@/lib/aiLane`.
- Keep `SYSTEM_PROMPT`, `OUTPUT_SCHEMA`, `groundingSummary`, `applyRoleRefinements`, `MAX_INTERPRET_IMAGES` **unchanged** — `OUTPUT_SCHEMA` is already valid `responseJsonSchema` input.
- `requestOnce` loses its `client: Anthropic` parameter and collapses to: sniff media types → `callModel({ images, system: SYSTEM_PROMPT, user, jsonSchema: OUTPUT_SCHEMA, maxOutputTokens, thinkingLevel: MINIMAL })` → `parseJsonLoose` → `aiResponseSchema.safeParse`.
- **Raise `MAX_TOKENS` from 1024**, e.g. to 2048. The existing comment ("No temperature knob on 4.8") is about Claude and should be rewritten; 1024 was sized for a non-thinking budget. Pair with `thinkingLevel: MINIMAL` — this lane's job is explicitly *not* to reason hard, it's grounded on measured tokens.
- Keep the prompt-injection comment block (still accurate, still load-bearing).
- Keep `export { aiLaneAvailable };` — `eval/stability.ts` and `lib/analyze.ts` import it from here.

### 3. `lib/extract/structure/structureAI.ts` (Stage 7, text-only)

- Drop `import Anthropic`; `requestOnce` loses its `client` param.
- **Delete `temperature: 0.1`** (the latent bug).
- Replace `messages.create` with `callModel({ user: prompt, maxOutputTokens: 3000, jsonSchema: STRUCTURE_SCHEMA, thinkingLevel: LOW })` — no `system`, matching the current single-user-message shape.
- Add a `STRUCTURE_SCHEMA` const mirroring `aiStructureResponseSchema`. Note `componentDefinitions` and `sectionDescriptions` are `z.record` (open key sets) — express as `{ type: "object", additionalProperties: { ... } }`, which `responseJsonSchema` supports.
- Replace `message.content[0]` + regex with `parseJsonLoose`. (Reading only block `[0]` was a bug waiting to happen anyway.)
- Consider raising `maxOutputTokens` above 3000 — this lane emits one entry per tree node plus section descriptions, and thinking tokens now share the budget.
- Update the `forceHeuristicNaming` comment: it names the `Anthropic` client and `ANTHROPIC_API_KEY`. **The short-circuit itself must stay exactly where it is** — before `aiLaneAvailable()` — so `npm run eval` stays offline with a Gemini key set.

### 4. `lib/extract/structureFromImage.ts` (vision structure)

- Drop `import Anthropic`; `requestOnce` loses its `client` param **and its hand-written Anthropic media-type union** (the second place MIME types were encoded — now only `imageMediaType.ts` owns them).
- **Delete `temperature: 0.1`**.
- `callModel({ images, system: SYSTEM_PROMPT, user: "Infer the layout skeleton…", maxOutputTokens: MAX_TOKENS, thinkingLevel: MEDIUM })` → `parseJsonLoose` → `aiVisionStructureResponseSchema.safeParse`.
- **Schema decision:** `aiVisionNodeSchema` is recursive via `z.lazy`. `responseJsonSchema` supports `$defs`/`$ref` but cyclic refs "may only be used within non-required properties" — `children` is optional, so a recursive `$ref` is legal. Worth doing, but if it errors at runtime, fall back to `responseMimeType: "application/json"` with **no** schema; the prompt already specifies the shape and Zod is the real gate. Do not block on this.
- This is the lane most at risk in the move off Opus 4.8's high-res vision — hence `thinkingLevel: MEDIUM` and the manual verification below.
- Update the docstring: "gated entirely on `ANTHROPIC_API_KEY`" → `GEMINI_API_KEY`.

### 5. `lib/extract/imageMediaType.ts`

Comment-only change: "the four Claude's vision API accepts" → Gemini. The four values it returns are all valid Gemini MIME types; **no logic change**.

### 6. Dependencies & docs

- `package.json`: remove `@anthropic-ai/sdk`, add `@google/genai` (^2.13.0). Run `npm install`.
- `README.md`: lines ~46, ~62, ~122 — `ANTHROPIC_API_KEY=sk-ant-...` → `GEMINI_API_KEY=...`, "Anthropic API Key" → "Google Gemini API Key", and note it's free from https://aistudio.google.com/apikey with no credit card.
- `CLAUDE.md`: line 61 ("Every Claude-backed lane…") and line 80 ("gated entirely on `ANTHROPIC_API_KEY`"). Add `callModel` to the list of `lib/aiLane.ts` primitives the rule covers.
- `eval/stability.ts`: lines 16, 93 — the skip message names `ANTHROPIC_API_KEY`.
- `eval/run.ts`: lines 61-62 comment names the Anthropic client.
- **No `app/` changes** — the route and UI never reference a provider, model id, or key.

### 7. Local key setup (user action)

Create `.env.local` in the project root (already covered by `.gitignore:21-22`) with `GEMINI_API_KEY=...`, then **restart `next dev`** — Next reads `.env.local` only at startup.

## Verification

1. `npm run lint && npm run typecheck` — must be clean.
2. **`npm run eval` must pass with the baseline untouched.** This is the critical regression check: the measured lane is provider-independent, so *any* score movement means something leaked across the measured/AI split. Do **not** run `UPDATE_BASELINE=1`.
3. Confirm `npm run eval` stays offline with `GEMINI_API_KEY` set — the `forceHeuristicNaming` short-circuit should mean zero network calls.
4. `npm run eval:ai` — should now actually run instead of printing the skip message. Its Jaccard stability floors (0.5 adjectives / 0.3 archetype) are a real quality signal on the new model.
5. **Live end-to-end, all three lanes** — this is the only way to exercise Stage 7 and the vision lane, neither of which has ever successfully run:
   - `npm run dev`, analyze a URL in `both` mode → check the report has `identity` + `imageMood` with `provenance: ai`, and that the structure report shows `naming: "ai"` (not `"heuristic"`) with `sectionDescriptions` present.
   - Upload an image in `structure` mode → a `fidelity: "inferred"` skeleton, not a `structureUnavailableReason`.
   - Watch the server console for `AI Structure Labeller failed` / `Vision structure inference failed` warnings — a silent heuristic fallback is exactly the failure mode this migration exists to end.
6. Spot-check output quality: identity/imageMood should transfer cleanly; the fine-grained layout skeleton is the thing most likely to degrade off Opus 4.8's high-res vision.

## Caveats to hold onto

- **Free-tier rate limits will bite before cost does.** Roughly 10 RPM / 250–1500 RPD on Flash models. A `both`-mode URL analysis fires two AI calls and sends up to four images. Bursty manual testing will hit 429s. The response cache absorbs repeats; first runs won't be smooth. `retryOnce` will treat a 429 as a failure and fall back — so a rate-limited run looks identical to a quality regression. Check the console before concluding the model is bad.
- **Google uses free-tier prompts for product improvement** (the paid tier does not). This tool's inputs are screenshots of third-party sites. Worth a deliberate decision before pointing it at anything sensitive; the fix is upgrading to a paid tier, not a code change.
- **`aiLaneAvailable()` stays a strict env-var check.** Simpler than Anthropic's multi-step credential chain, so the gap the old notes flagged (gate stricter than the SDK) disappears rather than needing a fix.
- Delete `.agents/temp/AI-LANE-NOTES.md` once this lands, or mark its TODOs done — it's gitignored scratch, and leaving stale advisory notes around invites re-litigating settled decisions.
