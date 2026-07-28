# Plan: DIST-035 — Migrate `lib/interpret.ts` to `callModel` + native JSON mode

## Summary

Move the interpretation lane (identity / imageMood / Stage-E color-role refinements) off the Anthropic
SDK and onto the shared `callModel` seam built by DIST-034, using Gemini's native JSON mode. This is a
**call-site swap only**: `SYSTEM_PROMPT`, `OUTPUT_SCHEMA`, `groundingSummary`, `applyRoleRefinements`,
`MAX_INTERPRET_IMAGES`, the prompt-injection comment block, and `export { aiLaneAvailable }` are all
carried over untouched, and `OUTPUT_SCHEMA` passes straight through to `config.responseJsonSchema`
verbatim (no translation to the restricted OpenAPI dialect). `requestOnce` loses its `client: Anthropic`
parameter and collapses to *sniff media types → `callModel` → `parseJsonLoose` → `aiResponseSchema.safeParse`*
— Zod stays the hard gate. The one behavioural knob that moves is the token budget: `MAX_TOKENS` goes
1024 → 2048 paired with `thinkingLevel: MINIMAL`, because Gemini 3.x thinks by default and thinking
tokens are charged against `maxOutputTokens`. `lib/interpret.ts` is the only source file this story
touches; `@anthropic-ai/sdk` stays installed (DIST-038 removes it once all three call sites have moved).

## User Story

As a maintainer
I want the interpretation lane to call the shared `callModel` seam with native JSON mode
So that identity/mood/color-role refinement no longer depends on the Anthropic SDK or a brace-match regex

## Metadata

| Field | Value |
|-------|-------|
| Type | REFACTOR (provider call-site swap) |
| Complexity | LOW–MEDIUM |
| Systems Affected | `lib/interpret.ts` (only) |
| GitHub Issue | [#69](https://github.com/laanhema/distill-design-scraper/issues/69) (DIST-035) |
| PRD trace | `.agents/PRDs/PRD.md` §4 Planned bullet 3, §12 Phase 5 scope bullet 2 |
| Parent plan | `.agents/plans/from-claude-to-gemini-plan.md` §2 |
| Blocked by | DIST-034 (#68 — **landed**, `1dc22b1`) |
| Blocks | DIST-038 (#72) |

---

## Verified facts (read from the working tree / installed SDK, not from memory)

Do **not** re-derive these during implementation:

| Fact | Evidence |
|---|---|
| `callModel(opts: ModelCall): Promise<string \| null>` is exported and is the only place the SDK is imported | `lib/aiLane.ts:75-100`, file docstring `:1-8` |
| `ModelCall = { images?: { data: string; mediaType: ImageMediaType }[]; system?: string; user: string; jsonSchema?: object; maxOutputTokens: number; thinkingLevel?: ThinkingLevel }` | `lib/aiLane.ts:52-66` |
| Supplying `jsonSchema` sets **both** `responseMimeType: "application/json"` and `responseJsonSchema` — call sites never build `config`, so the pairing can't be got wrong | `lib/aiLane.ts:88-94` |
| `ThinkingLevel` is re-exported from `lib/aiLane.ts` (it is a runtime `declare enum`, not a type alias) with members `MINIMAL` / `LOW` / `MEDIUM` / … | `lib/aiLane.ts:18`; `node_modules/@google/genai/dist/genai.d.ts:12897-12920` |
| `parseJsonLoose(text: string \| null): unknown \| null` — `JSON.parse` first, brace-match fallback, then `null`; it never validates shape | `lib/aiLane.ts:111-125` |
| `callModel` **throws** on SDK/network/auth errors and returns `null` only for "succeeded but produced no usable text" | `lib/aiLane.ts:68-74`, `:98-99` |
| `retryOnce` is unchanged from `main` — one repair retry, then graceful `null` | `lib/aiLane.ts:132-147` |
| `OUTPUT_SCHEMA` is already valid `responseJsonSchema` input (`properties` / `required` / `enum` / `additionalProperties`) | `lib/interpret.ts:47-88`; parent plan line 25 |
| `interpret()` is called by `lib/analyze.ts:141` (`enrichWithAI`) and `eval/stability.ts:68` only | grep |
| `npm run eval` never calls `interpret()` — the eval path only touches the measured lane plus `forceHeuristicNaming` structure | `eval/run.ts:57-67` |
| `aiResponseSchema` requires `identity` + `imageMood` and gives `roleRefinements` a `.default([])` | `lib/schema.ts:270-289` |

---

## Patterns to Follow

### The call-site shape this story is converging on (the seam's own contract)

```ts
// SOURCE: lib/aiLane.ts:75-99 — call sites pass intent, never SDK config
export async function callModel(opts: ModelCall): Promise<string | null> { … }
```

```ts
// SOURCE: lib/aiLane.ts:111-125 — the one shared JSON extractor
export function parseJsonLoose(text: string | null): unknown | null { … }
```

### Graceful-`null` at the lane boundary, never a throw

```ts
// SOURCE: lib/interpret.ts:214-223 — the existing shape, preserved by this story
if (!aiLaneAvailable()) return null;
if (input.screenshotsPngBase64.length === 0) return null;
…
const ai = await retryOnce(() => requestOnce(screenshots, summary));
if (!ai) return null;
```

### Zod is the gate, not the model's word

```ts
// SOURCE: lib/interpret.ts:203-204 — kept verbatim; only what feeds `raw` changes
const parsed = aiResponseSchema.safeParse(raw);
return parsed.success ? parsed.data : null;
```

### Media-type sniffing stays the caller's job (`imageMediaType.ts` is the sole MIME owner)

```ts
// SOURCE: lib/interpret.ts:146
const mediaTypes = await Promise.all(screenshotsPngBase64.map(detectImageMediaType));
```

### Comments explain decisions, not mechanics

```ts
// SOURCE: lib/interpret.ts:32-34 — the block Task 2 rewrites (its second
// sentence is now stale: it describes a Claude-only knob)
// Low effort keeps this cheap and its read anchored on the measured tokens
// rather than free-associating. No temperature knob on 4.8.
const MAX_TOKENS = 1024;
```

### Tests

There is **no unit test framework** in this repo (no jest/vitest — `package.json`, CLAUDE.md). The gates
are `npm run eval` (offline capture replay), `npm run typecheck`, and `npm run lint`. Behavioural
verification of an AI lane is done with a throwaway `npx tsx` scratch script run from the project root,
then deleted (CLAUDE.md, "Manually verifying extraction changes"); DIST-034 used exactly this pattern.

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/interpret.ts` | UPDATE | Swap the Anthropic round-trip for `callModel` + `parseJsonLoose`; raise `MAX_TOKENS` and pin `thinkingLevel: MINIMAL`; rewrite the stale budget comment |

**Explicitly out of scope — do not touch:**
`lib/aiLane.ts` (DIST-034 is landed and reviewed; the empty-`null` observability gap belongs to DIST-040),
`lib/extract/structure/structureAI.ts` (DIST-036), `lib/extract/structureFromImage.ts` (DIST-037),
`lib/extract/imageMediaType.ts` / `README.md` / `CLAUDE.md` / `eval/**` / `package.json` (DIST-038's
provider sweep — including `eval/stability.ts`'s skip message, which still names `ANTHROPIC_API_KEY`),
`lib/analyze.ts` (`enrichWithAI`'s merge semantics are load-bearing: AI output is merged *onto*, never
*into*, measured fields), and `app/**` (the route and UI reference no provider, model id, or key).

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Swap the imports

- **File**: `lib/interpret.ts`
- **Action**: UPDATE
- **Implement**:
  - Delete `import Anthropic from "@anthropic-ai/sdk";` (line 1).
  - Change the aiLane import (line 14) to `import { aiLaneAvailable, callModel, parseJsonLoose, retryOnce, ThinkingLevel } from "@/lib/aiLane";`.
  - **Drop `AI_MODEL` from that import** — `callModel` pins the model internally, so a retained import becomes an unused symbol and trips `@typescript-eslint/no-unused-vars` under `eslint-config-next`.
  - Keep `detectImageMediaType` (line 13) — sniffing stays here; `ModelCall.images[].mediaType` expects the sniffed value.
  - Leave the module docstring (`:16-30`) alone: "output is strict JSON constrained by structured outputs, then re-validated with Zod" is still exactly what happens under native JSON mode.
- **Mirror**: `lib/aiLane.ts:10-18` (what the seam exports and why `ThinkingLevel` is re-exported)
- **Validate**: `npm run typecheck` will still fail at this point (`client` is now untyped in `requestOnce`) — that is expected until Task 3. Do not "fix" it by re-adding the import.

### Task 2: Retune the token budget and rewrite the stale comment

- **File**: `lib/interpret.ts:32-34`
- **Action**: UPDATE
- **Implement**:
  - `const MAX_TOKENS = 2048;`
  - Replace the two-line comment above it. The stale half is `No temperature knob on 4.8.` (a Claude-only fact) and "Low effort" (an Anthropic `output_config.effort` value that no longer exists here). The replacement must record the *decision*, in the register of the surrounding comments: this lane is grounded on already-measured tokens, so its job is explicitly **not** to reason hard — hence `ThinkingLevel.MINIMAL` — and 1024 was sized for a non-thinking budget, whereas Gemini 3.x thinking tokens are now charged against the same `maxOutputTokens`, so the budget doubles to keep the answer from being truncated by the thinking prelude.
- **Mirror**: `lib/aiLane.ts:60-65` (the existing prose on thinking tokens sharing the output budget)
- **Validate**: comment names no Claude-era concept (`temperature`, `effort`, `4.8`).

### Task 3: Collapse `requestOnce` onto `callModel` + `parseJsonLoose`

- **File**: `lib/interpret.ts:140-205`
- **Action**: UPDATE
- **Implement**: New signature — `async function requestOnce(screenshotsPngBase64: string[], summary: string): Promise<AiResponse | null>` (the `client: Anthropic` parameter is gone; the return type and the `/** One model round-trip → parsed, Zod-validated JSON (or null on failure). */` docstring stay).

  Body, in order:
  1. `const mediaTypes = await Promise.all(screenshotsPngBase64.map(detectImageMediaType));` — unchanged (`:146`).
  2. **Preserve the prompt-injection comment block (`:147-154`) verbatim** — it is still accurate and load-bearing, and it must stay attached to the image-building code it describes. Only the block that *builds* the images changes.
  3. Replace `imageBlocks` (`:155-158`) with the `ModelCall` shape:
     ```ts
     const images = screenshotsPngBase64.map((data, i) => ({ data, mediaType: mediaTypes[i] }));
     ```
     Raw base64, no data-URL prefix, no hand-written MIME union.
  4. `promptNote` (`:159-162`) — unchanged.
  5. Replace `client.messages.create({ … })` (`:164-187`) with one `callModel` call:
     ```ts
     const text = await callModel({
       images,
       system: SYSTEM_PROMPT,
       user: `${promptNote}\n\n${summary}\n\nInterpret its identity and imageMood, and refine any mislabelled color roles.`,
       jsonSchema: OUTPUT_SCHEMA,
       maxOutputTokens: MAX_TOKENS,
       thinkingLevel: ThinkingLevel.MINIMAL,
     });
     ```
     The user text must be byte-identical to the current `text:` field (`:182`). `OUTPUT_SCHEMA` is passed **as-is** — no translation, no cloning, no `structuredClone` to strip `as const` readonly-ness (`jsonSchema?: object` accepts a deeply-readonly object literal).
  6. Delete the content-block filtering (`:191-195`) — `callModel` already returns `string | null`.
  7. Replace the bare `JSON.parse` + try/catch (`:197-202`) with `const raw = parseJsonLoose(text);` followed by `if (raw === null) return null;` (or let `safeParse` reject it — but the explicit early return keeps the two failure modes readable). Keep a one-line comment noting *why* a loose parse is still needed under native JSON mode: JSON mode should return clean JSON, but a fence or a refusal preamble is still possible, and Zod — not the model's word — is the gate.
  8. `const parsed = aiResponseSchema.safeParse(raw); return parsed.success ? parsed.data : null;` — unchanged (`:203-204`).
- **Mirror**: `lib/aiLane.ts:75-99` (`callModel`'s contract), `lib/interpret.ts:191-204` (the existing parse-then-gate ordering)
- **Validate**: `npm run typecheck`

### Task 4: Drop the client construction in `interpret()`

- **File**: `lib/interpret.ts:211-230`
- **Action**: UPDATE
- **Implement**:
  - Delete `const client = new Anthropic();` (`:217`). `callModel` owns the one lazily-constructed module-level client (`lib/aiLane.ts:33-49`) — do not construct or cache anything here.
  - Update the call to `retryOnce(() => requestOnce(screenshots, summary))` (`:222`).
  - Everything else in this function is unchanged: the `aiLaneAvailable()` / empty-screenshots guards, `groundingSummary`, the `MAX_INTERPRET_IMAGES` slice, the `// One repair retry (§6), then graceful fallback.` comment, and the `provenance: "ai"` stamping of `identity` / `imageMood`.
  - **Do not add an `onError` callback** to `retryOnce` here. Interpretation failures being silent is a real gap, but it is DIST-040's (#74) — adding it now would put this story's diff outside its acceptance criteria. See Risks.
- **Mirror**: `lib/extract/structure/structureAI.ts:172-176` (the `retryOnce` + `onError` shape DIST-040 will generalise — reference only, not to be copied here)
- **Validate**: `npm run typecheck && npm run lint` — both must now be clean.

### Task 5: Diff-check the must-not-change surface

- **File**: `lib/interpret.ts`
- **Action**: UPDATE (verify-only)
- **Implement**: `git diff lib/interpret.ts` and confirm **no hunk touches**:
  - `SYSTEM_PROMPT` (`:36-44`)
  - `OUTPUT_SCHEMA` (`:47-88`) — must reach `responseJsonSchema` verbatim
  - `MAX_INTERPRET_IMAGES` (`:91`)
  - `InterpretInput` / `Interpretation` (`:93-106`)
  - `groundingSummary` (`:112-136`)
  - `export { aiLaneAvailable };` (`:138`) — `eval/stability.ts:4` and `lib/analyze.ts:12` import it *from this module*; removing the re-export breaks both
  - the prompt-injection comment block (`:147-154`)
  - `RefinementChange` / `applyRoleRefinements` (`:232-282`)
  - Also confirm `git status` shows **only** `lib/interpret.ts` modified (plus this plan / the report doc).
- **Validate**: `git diff --stat` lists exactly one source file.

### Task 6: Full gate

- **Action**: verify
- **Validate**: `npm run lint && npm run typecheck && npm run eval`.
  `eval` must pass against the **unmodified** `eval/baseline.json`. Do **not** run `UPDATE_BASELINE=1`.
  `eval/run.ts` never invokes `interpret()`, so any score movement means something leaked across the
  measured/AI split and must be investigated, not baselined away.

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Regression gate (no unit test framework in this repo)
npm run eval          # must pass unchanged; NEVER UPDATE_BASELINE=1 for this story

# The offline invariant, with a key present (adversarial case)
GEMINI_API_KEY=dummy npm run eval
```

## End-to-End Verification

**1. Nothing broke (required).**

```bash
npm run lint && npm run typecheck && npm run eval
```

Expected: all clean, `eval` at the committed baseline with zero score deltas and `eval/baseline.json`
untouched in `git status`.

**2. `npm run eval` stays offline with a key set (required).**

```bash
GEMINI_API_KEY=dummy npm run eval
```

Expected: identical result, zero network calls. `tsx` does not auto-load `.env.local` (only
`next dev` / `next start` do), so the key must be forced onto the command to exercise the real case.
`eval/run.ts` forces `forceHeuristicNaming` and never calls `interpret()`.

**3. The migrated lane actually reaches Gemini (required — this is the first time this lane has ever run).**

Write a throwaway scratch script at the **project root** (`tsx`/esbuild resolves `node_modules` relative
to the script's own location, so a script in `/tmp` fails to resolve `@/lib/*`), delete it afterwards:

- read `eval/corpus/clean-light/capture.json`, run `extractFromCapture` to get a measured `report`
- call `interpret({ screenshotsPngBase64: [capture.viewportShot], palette: report.palette, typography: report.typography })`
- print the result

```bash
node --env-file=.env.local --import tsx ./scratch-interpret.ts
```

Expected: a non-`null` `Interpretation` with `identity.provenance === "ai"`, 3–6 adjectives, a non-empty
`archetype` + `description`, `imageMood.hero` / `.texture` populated with concrete photographable
queries, and `roleRefinements` either empty or referencing **only hexes present in the palette**
(`applyRoleRefinements` ignores unknown hexes, but a model inventing them is a prompt-quality signal
worth seeing). Also assert the two things this migration is *for*: no markdown fence in the raw text
(native JSON mode is on) and no `@anthropic-ai/sdk` import anywhere in the call path.

**4. Multi-image path (recommended).** Re-run step 3 passing `[capture.viewportShot, capture.panoramaShot]`
(or the same shot twice) and confirm the `promptNote` plural branch is exercised and the call still
returns a valid response — this is the `MAX_INTERPRET_IMAGES` path that `analyzeImages` uses.

**5. `npm run eval:ai` (recommended).** With `GEMINI_API_KEY` exported it now actually runs instead of
printing the skip message (whose text still names `ANTHROPIC_API_KEY` — that is DIST-038's file, leave
it). Its Jaccard floors (0.5 adjectives / 0.3 archetype) are the first real quality signal on the new
model. Note it fires `3 runs × 2 sites = 6` calls, so free-tier throttling is likely; a `429`/`503` is
not a quality result.

**6. Live app path (optional, overlaps DIST-039).** `npm run dev` → analyze a URL in `both` mode → the
report carries `identity` + `imageMood` at `provenance: ai`. Restart `next dev` after any `.env.local`
change; it reads the file only at startup.

---

## Risks

| Risk | Mitigation | In scope? |
|------|------------|-----------|
| **`MAX_TOKENS` truncation now looks like a quality failure.** Thinking tokens share `maxOutputTokens`, and `callModel` collapses `finishReason: "MAX_TOKENS"` into a bare `null` with no log (`lib/aiLane.ts:98-99`, review finding M2) — so a truncated response is indistinguishable from "the model had nothing to say". | 2048 + `ThinkingLevel.MINIMAL` is deliberately generous for a payload of ~3-6 adjectives + two short query lists (the actual JSON is a few hundred tokens). If E2E step 3 returns `null`, **check truncation first** before touching the prompt: temporarily log `finishReason` in a scratch copy rather than editing `lib/aiLane.ts`. | **In scope** (the budget); the `finishReason` logging is **out of scope** — DIST-040 (#74) |
| **Interpretation failures are entirely silent**: `retryOnce` is called here with no `onError` (`lib/interpret.ts:222`), unlike `structureAI.ts:172-176`. Two silent attempts, then a measured-only report. | Flag, don't fix. DIST-040 (#74) owns "a lane that fails *with* a key configured must log differently from one that was never enabled". Adding it here would exceed issue #69's ACs. | **Out of scope — flag only** |
| **`image/gif` reaches this lane and Gemini rejects it.** `ImageMediaType` includes `"image/gif"` (`lib/extract/imageMediaType.ts:3`) and the upload path is `accept="image/*"`, so a GIF upload gets sniffed as `image/gif` and will `400` the *interpretation* call, not just the vision structure lane. The DIST-034 report/review carried this to DIST-036/037, which under-scopes it — `interpret.ts` is an image-carrying lane too. | Flag, don't fix (same call the DIST-034 plan made). Record it in the implementation report and re-raise on DIST-036/037/038; the cheap fixes are transcoding GIF via `sharp` in `imageMediaType.ts` or narrowing `ModelCall.mediaType` to the Gemini-supported subset so it fails at compile time. URL analysis is unaffected (screenshots are always PNG). | **Out of scope — flag only** |
| **`gemini-3.5-flash` returned `503 UNAVAILABLE` throughout DIST-034's live probe**, and free-tier limits are ~10 RPM / 250–1500 RPD. `retryOnce` fires two attempts back-to-back with no backoff, so a capacity error reads exactly like a quality regression. | Before concluding the prompt or model is bad, check the console/scratch output for `429`/`503`. Do **not** change `AI_MODEL` in this story — the constant was validated against the models-list endpoint; a persistent capacity problem is a DIST-039/040 decision. | **Out of scope — flag only** |
| **Leftover `AI_MODEL` import breaks lint.** After the swap it is unused; `eslint-config-next` flags unused vars. | Task 1 removes it explicitly. `npm run lint` in Task 4 catches it. | **In scope** |
| **Dropping `export { aiLaneAvailable };` silently breaks two importers** (`eval/stability.ts:4`, `lib/analyze.ts:12` import it *from `@/lib/interpret`*, not from `@/lib/aiLane`). | Task 5 diff-checks it; `npm run typecheck` catches removal. Do not "tidy" these importers onto `@/lib/aiLane` — that is DIST-038's sweep. | **In scope** |
| **`OUTPUT_SCHEMA` drift.** Any hand-edit (e.g. relaxing `additionalProperties`, reordering `required`) silently changes what the model is constrained to emit while Zod still passes. | Task 5 diff-checks the whole block. It is `as const` and derives its `role` enum from `REFINABLE_COLOR_ROLES`, so it cannot drift from `aiResponseSchema` unless edited. | **In scope** |
| **Merge ordering (review finding M1).** With `GEMINI_API_KEY` set, `main` currently opens `aiLaneAvailable()` on three Anthropic call sites; after this story two of them (`structureAI.ts`, `structureFromImage.ts`) still construct `new Anthropic()` and fail inside its missing-key constructor — producing `AI Structure Labeller failed` / `Vision structure inference failed` warnings and an uncached `structureUnavailableReason`. | Not a code change. Sequence DIST-036/037 close behind this one (or squash the chain) rather than leaving the intermediate state on `main`. Note it in the implementation report so the warnings aren't misread as a regression this story caused. | **Out of scope — flag only** |
| **Scratch script left in the repo.** | CLAUDE.md is explicit: delete scratch scripts after use. Task 5's `git status` check catches it. | **In scope** |

---

## Acceptance Criteria

Mapped 1:1 to issue [#69](https://github.com/laanhema/distill-design-scraper/issues/69).

- [ ] `lib/interpret.ts` imports no SDK, and `requestOnce` no longer takes a `client` parameter
- [ ] `OUTPUT_SCHEMA`, `SYSTEM_PROMPT`, `groundingSummary`, `applyRoleRefinements`, and `MAX_INTERPRET_IMAGES` are unchanged — `OUTPUT_SCHEMA` passes through to `responseJsonSchema` verbatim
- [ ] `MAX_TOKENS` is 2048 with `thinkingLevel: ThinkingLevel.MINIMAL`, and the stale `// No temperature knob on 4.8.` comment is rewritten
- [ ] The model response goes `parseJsonLoose` → `aiResponseSchema.safeParse` — Zod remains the hard gate
- [ ] `export { aiLaneAvailable };` is still present (`eval/stability.ts` and `lib/analyze.ts` import it from here)
- [ ] The prompt-injection comment block is preserved verbatim
- [ ] `npm run lint && npm run typecheck && npm run eval` all pass and `eval/baseline.json` is untouched
- [ ] No changes to `lib/aiLane.ts`, `lib/analyze.ts`, `lib/extract/**`, `eval/**`, `package.json`, `README.md`, `CLAUDE.md`, or `app/**`
- [ ] A live scratch run returns a Zod-valid `Interpretation` with `provenance: "ai"`, and the scratch script is deleted afterwards
