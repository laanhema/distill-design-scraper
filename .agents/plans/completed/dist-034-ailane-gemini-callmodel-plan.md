# Plan: DIST-034 — Rebuild `lib/aiLane.ts` on `@google/genai` with a `callModel` primitive

## Summary

Rebuild the single AI provider seam (`lib/aiLane.ts`) on the Google Gemini SDK, adding two new shared primitives — `callModel` (one model round-trip, images + system + user + optional native JSON mode) and `parseJsonLoose` (JSON.parse → brace-match → null) — so the three AI call sites can migrate in DIST-035/036/037 without any of them importing an SDK or re-inlining JSON extraction. `retryOnce` is carried over byte-for-byte: this story changes the *provider*, not the fallback policy. `@anthropic-ai/sdk` stays installed and every call site stays on Claude for now, so this story lands with `npm run lint`, `npm run typecheck`, and `npm run eval` all green and **zero behavioural change** — the seam is built ahead of its consumers.

## User Story

As a maintainer
I want the single AI provider seam rebuilt on the Gemini SDK with a `callModel` primitive
So that all three AI lanes can migrate without any of them importing an SDK or re-inlining JSON extraction

## Metadata

| Field | Value |
|-------|-------|
| Type | REFACTOR (provider swap + new shared primitive) |
| Complexity | MEDIUM |
| Systems Affected | `lib/aiLane.ts`, `package.json` / `package-lock.json` |
| GitHub Issue | #68 (DIST-034) |
| PRD trace | `.agents/PRDs/PRD.md` §4 "Planned — AI lane migration" bullets 1–2, §12 Phase 5 scope bullet 1 |
| Parent plan | `.agents/plans/from-claude-to-gemini-plan.md` §1 |
| Blocks | DIST-035, DIST-036, DIST-037, DIST-040 |

---

## Verified SDK facts (checked against the real `@google/genai@2.13.0` tarball, not from memory)

Confirmed by extracting `@google/genai@2.13.0` and reading `dist/genai.d.ts` — do **not** re-derive these from memory during implementation:

| Fact | Evidence |
|---|---|
| `2.13.0` is `dist-tags.latest` on npm | `npm view @google/genai version` |
| `GoogleGenAI` exposes `readonly models: Models` | `genai.d.ts:5973-5979` |
| `models.generateContent: (params: GenerateContentParameters) => Promise<GenerateContentResponse>` | `genai.d.ts:9863` |
| `GenerateContentParameters = { model: string; contents: ContentListUnion; config?: GenerateContentConfig }` | `genai.d.ts:5129-5139` |
| `ContentListUnion = Content \| Content[] \| PartUnion \| PartUnion[]` | `genai.d.ts:2006` |
| `Part.inlineData?: Blob` where `Blob = { data?: string; mimeType?: string; displayName?: string }` | `genai.d.ts:10552`, `1229-1238` |
| `GenerateContentConfig.systemInstruction?: ContentUnion` (accepts a plain `string`, since `PartUnion = Part \| string`) | `genai.d.ts:4983`, `2024`, `10632` |
| `GenerateContentConfig.responseMimeType?: string` | `genai.d.ts:5042` |
| `GenerateContentConfig.responseJsonSchema?: unknown` — **distinct from** `responseSchema?: SchemaUnion` (`genai.d.ts:5053`); setting both is an error | `genai.d.ts:5069` |
| `GenerateContentConfig.thinkingConfig?: ThinkingConfig`, and `ThinkingConfig.thinkingLevel?: ThinkingLevel` | `genai.d.ts:5112`, `12883-12892` |
| `ThinkingLevel` is an exported **`declare enum`** (a runtime value, not a type alias) with `THINKING_LEVEL_UNSPECIFIED` / `MINIMAL` / `LOW` / … | `genai.d.ts:12897-12909` |
| `GenerateContentResponse.text` is a **getter** returning `string \| undefined` | `genai.d.ts:5186` |
| `GoogleGenAIOptions.apiKey?: string` | `genai.d.ts:6061` |
| Package requires `node >= 20`; runtime deps `google-auth-library`, `p-retry`, `protobufjs`, `ws` | `package.json` of the tarball |

Local Node is v22.22.2 and the Docker base is `mcr.microsoft.com/playwright:v1.61.1-jammy` (Node 20+), so the engine floor is satisfied.

---

## Patterns to Follow

### Docstring-first module header (every `lib/` file opens with a `/** … */` explaining the seam, not the syntax)

```ts
// SOURCE: lib/aiLane.ts:1-6 (the block this story rewrites)
/**
 * Shared primitives for every Claude-backed lane (interpretation, DOM-based
 * structure labelling, vision-based structure inference) — one model id, one
 * availability check, and one retry policy so the three lanes can't drift out
 * of sync with each other.
 */
```

### Graceful-`null` fallback, never throw at the lane boundary

```ts
// SOURCE: lib/aiLane.ts:16-36 — carried over UNCHANGED by this story
export async function retryOnce<T>(
  fn: () => Promise<T | null>,
  onError?: (err: unknown, attempt: 1 | 2) => void,
): Promise<T | null> { … }
```

```ts
// SOURCE: lib/extract/structure/structureAI.ts:172-176 — the observability contract
const response = await retryOnce(
  () => requestOnce(client, compactTree, digestList),
  (err, attempt) => console.warn(`AI Structure Labeller failed (attempt ${attempt}):`, err),
);
```

**Design consequence:** `callModel` must let SDK/network errors **propagate** rather than swallowing them into `null`. `retryOnce`'s `onError` is the only place an AI failure becomes visible in the console; a `callModel` that returned `null` on a thrown 401/429 would make DIST-040's observability story impossible and make a rate-limited run indistinguishable from a quality regression. `callModel` returns `null` only for the "call succeeded but produced no usable text" case.

### One shared matcher, never a third inline copy (CLAUDE.md; PRD §2 principle 6)

```ts
// SOURCE: lib/extract/roleMatch.ts — the precedent parseJsonLoose follows
// (both recipes.ts and structure/tokenLink.ts import this rather than inlining ΔE matching)
```

The two inline copies `parseJsonLoose` replaces (left in place by this story, removed by DIST-035/036/037):

```ts
// SOURCE: lib/extract/structureFromImage.ts:118-126
const jsonMatch = text.match(/\{[\s\S]*\}/);
if (!jsonMatch) return null;
let raw: unknown;
try { raw = JSON.parse(jsonMatch[0]); } catch { return null; }
```

```ts
// SOURCE: lib/interpret.ts:197-202 (JSON.parse only, no brace fallback)
let raw: unknown;
try { raw = JSON.parse(text); } catch { return null; }
```

### JSON Schema constant shape (already `responseJsonSchema`-compatible)

```ts
// SOURCE: lib/interpret.ts:47-88 — passes through to responseJsonSchema verbatim in DIST-035
const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: { … , role: { type: "string", enum: [...REFINABLE_COLOR_ROLES] } },
  required: ["identity", "imageMood", "roleRefinements"],
} as const;
```

### Tests

There is **no unit test framework** in this repo (no jest/vitest — confirmed in `package.json` and CLAUDE.md). The correctness gate is `npm run eval` (offline capture replay) plus `npm run typecheck` / `npm run lint`. Behavioural verification of a new primitive is done with a throwaway `npx tsx` scratch script run from the project root, then deleted — see "End-to-End Verification".

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `package.json` | UPDATE | Add `@google/genai` `^2.13.0`; **keep** `@anthropic-ai/sdk` (removing it now breaks typecheck — all three call sites still `import Anthropic`; DIST-038 removes it last) |
| `package-lock.json` | UPDATE | Regenerated by `npm install` |
| `lib/aiLane.ts` | UPDATE | Rewrite the provider seam: new docstring, `AI_MODEL`, `aiLaneAvailable`, `ModelCall`, `callModel`, `parseJsonLoose`, re-exported `ThinkingLevel`; `retryOnce` untouched |

**Explicitly out of scope** (later stories — do not touch): `lib/interpret.ts`, `lib/extract/structure/structureAI.ts`, `lib/extract/structureFromImage.ts` (DIST-035/036/037); `lib/extract/imageMediaType.ts`, `README.md`, `CLAUDE.md`, `eval/run.ts`, `eval/stability.ts` (DIST-038/039); `app/**` (never — the route and UI reference no provider, model id, or key).

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Add the Gemini SDK dependency

- **File**: `package.json` (+ `package-lock.json`)
- **Action**: UPDATE
- **Implement**: Add `"@google/genai": "^2.13.0"` to `dependencies`, alphabetically before `@anthropic-ai/sdk`… — actually `@anthropic-ai/sdk` sorts first, so place `@google/genai` immediately after it, matching the existing alphabetical ordering of the block. **Leave `@anthropic-ai/sdk": "^0.112.4"` in place.** Then run `npm install`.
- **Note**: `postinstall` runs `playwright install chromium`; the install will take a minute and may re-verify the browser download. That is expected, not a failure.
- **Validate**: `npm run typecheck` — must pass with **no source changes yet** (AC #1). This is a meaningful check: it proves the new dep's type surface doesn't collide with anything (`skipLibCheck: true` is on, so the SDK's own `.d.ts` won't be deep-checked).

### Task 2: Rewrite the module docstring and the provider constants

- **File**: `lib/aiLane.ts`
- **Action**: UPDATE
- **Implement**:
  - Replace the header docstring (currently lines 1-6). It must no longer say "every Claude-backed lane" (AC #7). Keep the same explanatory register as the original — name the three lanes (interpretation, DOM-based structure labelling, vision-based structure inference) and state what the seam guarantees: one model id, one availability check, one retry policy, **and now one request primitive + one JSON parser**, so the three lanes can't drift.
  - `export const AI_MODEL = "gemini-3.5-flash";` with a comment noting it is vision-capable and pinned everywhere an AI lane calls the model (AC #2).
  - `export function aiLaneAvailable(): boolean { return Boolean(process.env.GEMINI_API_KEY); }` (AC #2). Keep it a strict env-var check — Gemini has no multi-step credential chain, so the old "gate stricter than the SDK" gap disappears rather than needing a fix.
- **Mirror**: `lib/aiLane.ts:1-14` (structure and comment density of what it replaces)
- **Validate**: `npm run typecheck` — `lib/analyze.ts:12`, `lib/interpret.ts:14`, `lib/extract/structure/structureAI.ts:5`, `lib/extract/structureFromImage.ts:8` all import these two symbols and must keep compiling unchanged (signatures are identical).

### Task 3: Add the lazy module-level client + `ModelCall` + `callModel`

- **File**: `lib/aiLane.ts`
- **Action**: UPDATE
- **Implement**:

  ```ts
  import { GoogleGenAI, ThinkingLevel } from "@google/genai";
  import type { ImageMediaType } from "@/lib/extract/imageMediaType";

  /** Re-exported so no call site has to import the SDK just to name a thinking level. */
  export { ThinkingLevel };

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

  Body requirements:
  1. **One module-level client, constructed lazily** (AC #3) — `let client: GoogleGenAI | null = null;` plus a `getClient()` that constructs on first use and caches. Not one per retry, not one per call. Read `process.env.GEMINI_API_KEY` inside `getClient()` and **throw a clear `Error` when it is missing** (rather than constructing a keyless client) so a mis-gated caller surfaces through `retryOnce`'s `onError` instead of failing opaquely inside the SDK. Only assign the module-level cache **after** a successful construction, so a missing-key throw doesn't poison a later call.
  2. Pass `{ apiKey }` explicitly to `new GoogleGenAI(...)` even though it auto-reads the env var, so the gate and the client can't disagree.
  3. Build parts as `[...imageParts, { text: opts.user }]` where each image part is `{ inlineData: { mimeType: img.mediaType, data: img.data } }` — raw base64, **no** data-URL prefix. Do **not** re-declare a MIME union here; `ImageMediaType` from `lib/extract/imageMediaType.ts` is the only owner (this is the union DIST-037 deletes from `structureFromImage.ts:95`).
  4. `contents: [{ role: "user", parts }]`.
  5. `config`: always `maxOutputTokens`; spread `systemInstruction: opts.system` only when present; spread `thinkingConfig: { thinkingLevel: opts.thinkingLevel }` only when `thinkingLevel` is provided (don't send `{ thinkingLevel: undefined }`); and spread **both** `responseMimeType: "application/json"` **and** `responseJsonSchema: opts.jsonSchema` together when `jsonSchema` is set — never `responseSchema`, never both schema fields (AC #4).
  6. Stay on `client.models.generateContent`. The newer `interactions.create` API exists on `GoogleGenAI` but is less documented; do not use it.
  7. `const text = response.text; return text && text.trim() ? text : null;` — `response.text` is a `string | undefined` getter (AC #3 return type). No content-block filtering, no `content[0]` indexing.
  8. **Do not wrap the call in try/catch.** Errors propagate to `retryOnce`'s `onError` — see "Patterns to Follow / Graceful-null fallback".
  9. Add a comment recording *why* `thinkingLevel` is part of the interface at all: Gemini 3.x thinks by default and **thinking tokens count against `maxOutputTokens`**, so a lane that doesn't set it explicitly can burn a short budget before an answer exists.
- **Validate**: `npm run typecheck && npm run lint`

### Task 4: Add `parseJsonLoose`

- **File**: `lib/aiLane.ts`
- **Action**: UPDATE
- **Implement**:

  ```ts
  /** JSON mode should return clean JSON; a fence/preamble is still possible. */
  export function parseJsonLoose(text: string | null): unknown | null
  ```

  Order (AC #5): `null`/blank in → `null` out; `JSON.parse(text)` first; on throw, fall back to the `/\{[\s\S]*\}/` brace match and `JSON.parse` that; on throw again → `null`. Same rationale as `roleMatch.ts` / `styleMatch.ts` — one shared matcher, not a third inline copy. Document that Zod remains the real gate: this function only gets *some* object out of the text, it never validates shape.
- **Note**: TypeScript normalises the declared `unknown | null` to `unknown`; keep the annotation as written (it documents intent and matches the story's AC text) — every consumer passes the result straight into a Zod `safeParse`, which accepts `unknown`.
- **Validate**: `npm run typecheck && npm run lint`

### Task 5: Confirm `retryOnce` is byte-identical

- **File**: `lib/aiLane.ts`
- **Action**: UPDATE (verify-only)
- **Implement**: Nothing. Explicitly diff-check that the `retryOnce` docstring and body are unchanged from `lib/aiLane.ts:16-36` (AC #6). Run `git diff lib/aiLane.ts` and confirm no hunk touches the `retryOnce` block. This story changes the provider, not the fallback policy.
- **Validate**: `git diff lib/aiLane.ts` shows `retryOnce` outside every changed hunk.

### Task 6: Full gate

- **Action**: verify
- **Validate**: `npm run lint && npm run typecheck && npm run eval` — `eval` must pass **with the baseline untouched**. Do **not** run `UPDATE_BASELINE=1`. Any score movement means something leaked across the measured/AI split, which this story cannot legitimately cause (no call site changed).

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Regression gate (no unit test framework in this repo)
npm run eval          # must pass unchanged; NEVER UPDATE_BASELINE=1 for this story
```

## End-to-End Verification

This story changes no call site, so the two gates that matter are "nothing broke" and "the new primitive actually reaches Gemini".

**1. Nothing broke (required).**

```bash
npm run lint && npm run typecheck && npm run eval
```

Expected: lint clean, typecheck clean, `npm run eval` passes at the committed `eval/baseline.json` with **no** score deltas. Because every AI call site is still on Claude and `ANTHROPIC_API_KEY` is unset, behaviour is byte-identical to `main`.

**2. `npm run eval` stays offline with a Gemini key present (required).**

`.env.local` already carries a `GEMINI_API_KEY` entry, but `tsx` does not auto-load `.env.local` (only `next dev`/`next start` do), so eval sees no key by default. Force the adversarial case explicitly:

```bash
GEMINI_API_KEY=dummy npm run eval
```

Expected: identical result and zero network calls — `runStructureAILabeller`'s `forceHeuristicNaming` short-circuit (`lib/extract/structure/structureAI.ts:152-156`) fires *before* `aiLaneAvailable()`, and the interpretation lane isn't invoked by `eval/run.ts` at all. This check matters now because `aiLaneAvailable()` starts reading a variable that *is* populated on this machine.

**3. The new primitive actually works against live Gemini (strongly recommended — this de-risks DIST-035/036/037).**

The AI lane has never executed in this project, so `AI_MODEL = "gemini-3.5-flash"` and the `responseJsonSchema` wiring are unverified against the live API — a wrong model id or an unsupported schema dialect fails at call time, not at typecheck. Write a throwaway scratch script (project root, deleted afterwards) that imports `callModel` + `parseJsonLoose` from `@/lib/aiLane` and makes three calls:

- **text-only, no schema** → returns a non-empty string
- **text-only + a small `jsonSchema`** (reuse the shape of `interpret.ts`'s `OUTPUT_SCHEMA`, or a 2-field toy object) with `thinkingLevel: ThinkingLevel.MINIMAL` → `parseJsonLoose` yields an object matching the schema, with **no** markdown fence in the raw text (proving native JSON mode is on)
- **one image** (base64 a PNG straight out of `eval/corpus/clean-light/capture.json`) + a system prompt → returns a plausible description, proving `inlineData` + `systemInstruction` are wired correctly

`.env.local` is not auto-loaded by `tsx`, so run it as:

```bash
node --env-file=.env.local --import tsx ./scratch-ailane.ts
```

(Node 22 is installed locally; `--env-file` is supported.) Run from the **project root** — `tsx`/esbuild resolves `node_modules` relative to the script's own location, so a script in `/tmp` fails to resolve imports (CLAUDE.md, "Manually verifying extraction changes"). Delete the script when done; don't leave it in the repo.

Expected failure modes and how to read them:
- `404` / "model not found" → `AI_MODEL` is wrong. Fix the constant (and flag it back into the parent plan), don't work around it.
- `429` → free-tier rate limit (~10 RPM), not a code bug. Wait and retry.
- `400` mentioning `response_json_schema` → the schema dialect was rejected; capture the exact message, since DIST-037's recursive-`$ref` fallback decision depends on it.

---

## Risks

| Risk | Mitigation |
|------|------------|
| **`AI_MODEL = "gemini-3.5-flash"` is unverified against the live model list.** A wrong id typechecks fine and fails only at call time — and `retryOnce` swallows it twice into a silent fallback, exactly the failure mode this migration exists to end. | End-to-End step 3 makes a real call. If it 404s, correct the constant here rather than letting DIST-035/036/037 inherit a dead id. |
| **`imageMediaType.ts` can emit `image/gif`, which Gemini does not accept.** The parent plan (`from-claude-to-gemini-plan.md` line 27) asserts Gemini's supported set (png/jpeg/webp/heic/heif) is "a superset of what `imageMediaType.ts` already emits" — it is not: `lib/extract/imageMediaType.ts:3` includes `"image/gif"`, and it is also the *fallback-adjacent* mapping for sharp-detected GIFs. A GIF upload would 400 the vision lane. | **Out of scope for DIST-034** — flag it, don't fix it. `ModelCall.images[].mediaType` correctly reuses `ImageMediaType` as the single owner of MIME types, which is what this story owes. Raise the gif→png/jpeg question on DIST-036/037 (the image-carrying lanes); the cheap fix is transcoding GIF via `sharp` or narrowing the union. |
| **Lazy singleton caches the API key from first use.** If `GEMINI_API_KEY` changed mid-process the client would go stale. | Not a real scenario (env is read at process start; `next dev` requires a restart to pick up `.env.local` changes anyway). Guard only against the poisoning case: assign the cache after successful construction, never before. |
| **Swallowing errors inside `callModel` would silently break observability.** A `catch { return null }` in `callModel` makes a 401/429/400 indistinguishable from "model returned nothing", and DIST-040 (AI failure observability) depends on the distinction. | Explicit design rule in Task 3.8: `callModel` throws; only `retryOnce`'s `onError` converts failure into a logged fallback. |
| **`responseJsonSchema` is typed `unknown`** (`genai.d.ts:5069`) — no compile-time protection against passing a malformed schema, or against accidentally setting `responseSchema` too. | Encode the invariant in `callModel` itself: a single conditional spread that emits `responseMimeType` + `responseJsonSchema` together and never mentions `responseSchema`. Call sites can't get it wrong because they never build `config`. |
| **`ThinkingLevel` is an enum (a runtime value), not a type alias.** If `lib/aiLane.ts` doesn't re-export it, DIST-035/036/037 must `import { ThinkingLevel } from "@google/genai"` — breaking the "`lib/aiLane.ts` is the only file that imports the SDK" invariant the whole story exists to establish. | Re-export it (Task 3). `isolatedModules: true` is fine with `export { ThinkingLevel }` because an enum is a value export, not a type-only one. |
| **Free-tier rate limits (≈10 RPM / 250–1500 RPD) will bite before cost does.** A rate-limited run looks identical to a quality regression. | Only relevant to the live scratch check here; check the console for 429 before concluding the model is bad. Carry the caveat forward to DIST-035/036/037, which fire two AI calls and up to four images per `both`-mode analysis. |
| **Google uses free-tier prompts for product improvement** (paid tier does not); this tool's inputs are screenshots of third-party sites. | Policy decision, not a code change — noted in the parent plan (`from-claude-to-gemini-plan.md` line 133). No action in this story. |
| Adding a dep triggers `postinstall` → `playwright install chromium`. | Expected; not a failure. Let it finish before running `npm run eval`. |

---

## Acceptance Criteria

Mapped 1:1 to issue #68.

- [ ] `@google/genai` ^2.13.0 added to `dependencies`; `@anthropic-ai/sdk` still present; `npm run typecheck` passes with no call-site changes
- [ ] `lib/aiLane.ts` exports `AI_MODEL === "gemini-3.5-flash"` and `aiLaneAvailable()` returning `Boolean(process.env.GEMINI_API_KEY)`
- [ ] `callModel(opts)` exported, accepting `{ images?, system?, user, jsonSchema?, maxOutputTokens, thinkingLevel? }` → `Promise<string | null>`, with exactly one lazily-constructed module-level `GoogleGenAI` client (not one per retry)
- [ ] When `jsonSchema` is supplied, `config` carries both `responseMimeType: "application/json"` and `responseJsonSchema` — never `responseSchema`, never both
- [ ] `parseJsonLoose(text)` exported; clean JSON → parsed object, fenced/preambled JSON → parsed object, `null` → `null`
- [ ] `retryOnce`'s signature and behaviour are byte-identical to before (`git diff` shows no hunk in that block)
- [ ] The `lib/aiLane.ts` docstring no longer says "every Claude-backed lane"
- [ ] `ThinkingLevel` re-exported from `lib/aiLane.ts` so DIST-035/036/037 need no SDK import
- [ ] `npm run lint` and `npm run typecheck` clean
- [ ] `npm run eval` passes against the **unmodified** `eval/baseline.json`
- [ ] `GEMINI_API_KEY=dummy npm run eval` still passes offline (the `forceHeuristicNaming` short-circuit holds)
- [ ] No changes to `lib/interpret.ts`, `lib/extract/structure/structureAI.ts`, `lib/extract/structureFromImage.ts`, `lib/extract/imageMediaType.ts`, `README.md`, `CLAUDE.md`, `eval/**`, or `app/**`
