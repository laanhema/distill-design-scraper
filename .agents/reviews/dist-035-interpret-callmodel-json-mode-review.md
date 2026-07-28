# Code Review: DIST-035 — Migrate `lib/interpret.ts` to `callModel` + native JSON mode

**Scope**: branch `feature/dist-035-interpret-callmodel-json-mode` (diff vs `main`, incl. uncommitted) — `lib/interpret.ts` (+20 / −47), plus two untracked `.agents/` docs
**GitHub Issue**: [#69](https://github.com/laanhema/distill-design-scraper/issues/69)
**Recommendation**: APPROVE (with nits)

## Summary

A clean, tightly-scoped call-site swap: the interpretation lane drops the Anthropic SDK and routes through the shared
`callModel` seam with Gemini native JSON mode, `parseJsonLoose`, and the unchanged Zod gate. Every "must not change"
surface named in the plan (`SYSTEM_PROMPT`, `OUTPUT_SCHEMA`, `groundingSummary`, `MAX_INTERPRET_IMAGES`,
`InterpretInput`/`Interpretation`, `applyRoleRefinements`, the prompt-injection comment block, `export { aiLaneAvailable }`)
is byte-identical in the diff. All seven issue ACs are satisfied and all three gates are green with `eval/baseline.json`
untouched.

I independently verified the SDK claims against the **installed** `@google/genai` rather than the plan text (per the
external-API rule) and they hold — see "SDK verification" below. The findings that remain are provider-migration
consequences and verification gaps, not defects in the diff's construction.

## Issues Found

### Critical

None.

### High Priority

None.

### Medium Priority

**M1 — `image/gif` uploads silently lose the AI lane (`lib/interpret.ts:147`, `:156`)**

`detectImageMediaType` can return `"image/gif"` (`lib/extract/imageMediaType.ts:3`) and the upload path is
`accept="image/*"` (`app/page.tsx:254`), so a GIF upload reaches this lane. Anthropic's vision API accepted
`image/gif`; Gemini's `inlineData` image support does not. Post-migration a GIF upload makes the interpretation call
`400` → `callModel` throws → `retryOnce` swallows both attempts → `interpret()` returns `null` → the report silently
drops `identity` / `imageMood`.

This is a **behaviour change introduced by this diff** on the image path (URL analysis is unaffected — screenshots are
always PNG). It is honestly flagged in the implementation report as out-of-scope, and that scoping call is defensible,
but I checked the downstream issues and **no AC currently covers it**: #71 (DIST-037) only retires the *duplicate*
media-type union in `structureFromImage.ts` and makes `imageMediaType.ts` the sole owner — it neither transcodes GIF
nor narrows the union.

*Recommendation*: do not fix here, but file the follow-up before this chain merges, rather than leaving it only in a
report doc. Cheapest fixes: transcode GIF → PNG via `sharp` inside `imageMediaType.ts`, or narrow `ImageMediaType` to
the Gemini-supported subset so the mismatch fails at compile time. Also note the `imageMediaType.ts` docstring still
says "the four Claude's vision API accepts" (stale — DIST-038's sweep).

### Suggestions

**L1 — The pinned model was never exercised with this exact config (`lib/interpret.ts:162-169`)**

The implementation report is commendably transparent that E2E step 3 ran against `gemini-3.1-flash-lite`, not the
pinned `gemini-3.5-flash`, because the latter was 503-saturated and free-tier quota was exhausted. So the two knobs
this story actually moves — `ThinkingLevel.MINIMAL` acceptance and `OUTPUT_SCHEMA` → `responseJsonSchema` on the
*pinned* model — remain unverified live. A rejection of either surfaces as an indistinguishable silent `null` (see L2).
Re-run the scratch probe or `npm run eval:ai` against `gemini-3.5-flash` once quota resets, before DIST-039 closes.
Correctly out of scope to change `AI_MODEL` here.

**L2 — Silent failure at `lib/interpret.ts:195` (deferred, but this story is evidence for it)**

`retryOnce(() => requestOnce(...))` is called with no `onError`, unlike `structureAI.ts:172-176`. Two silent attempts,
then a measured-only report. Explicitly deferred to DIST-040 (#74), and correctly so — adding it would exceed #69's
ACs. Worth noting that this story's own E2E needed a separate probe just to diagnose a `null`, which is a strong
argument for prioritising #74 ahead of the rest of the chain.

**L3 — `MAX_TOKENS` is now a shared budget, and the name/comment don't quite say so (`lib/interpret.ts:31-36`)**

The constant now feeds `maxOutputTokens`, which under Gemini 3.x covers thinking *and* answer tokens. `MAX_OUTPUT_TOKENS`
would name it correctly, and "sized for a budget the answer had to itself" reads slightly tangled. Pure nit — the
comment's *substance* is accurate and it fully discharges the AC (no `temperature` / `effort` / `4.8` residue).

**L4 — Merge ordering (informational, not this diff's fault)**

`lib/extract/structure/structureAI.ts` and `lib/extract/structureFromImage.ts` still `import Anthropic from
"@anthropic-ai/sdk"` while `aiLaneAvailable()` gates on `GEMINI_API_KEY`. Landing this story alone leaves `main` in a
state where a Gemini-only key opens all three lanes but two of them throw inside the Anthropic constructor. Pre-existing
from DIST-034, not caused here — but sequence #70/#71 immediately behind this, or squash the chain.

## SDK verification (checked against `node_modules/@google/genai`, not the plan)

| Claim | Verdict | Evidence |
|---|---|---|
| `ThinkingLevel.MINIMAL` exists as a runtime enum member | ✅ | `genai.d.ts:12897-12918` — `MINIMAL = "MINIMAL"` |
| `MINIMAL` is truthy, so `callModel`'s `...(opts.thinkingLevel ? … : {})` guard doesn't silently drop it | ✅ | string-valued enum, not `0`; `lib/aiLane.ts:87` |
| `ThinkingConfig.thinkingLevel` is the right field | ✅ | `genai.d.ts:12883-12892` |
| `responseJsonSchema` supports every keyword `OUTPUT_SCHEMA` uses (`type`, `properties`, `required`, `enum` for strings, `items`, `additionalProperties`) | ✅ | `genai.d.ts:5054-5069` — full supported-keyword list; no translation needed, so passing `OUTPUT_SCHEMA` verbatim is correct |
| `responseSchema` must be omitted when `responseJsonSchema` is set | ✅ | `genai.d.ts:5055-5058`; `lib/aiLane.ts:88-94` never sets it |
| `response.text` excludes thinking parts (so a thinking prelude can't corrupt the JSON) | ✅ | `dist/index.mjs:2599-2605` — skips parts with `thought === true`. Confirms the `MAX_TOKENS` comment's framing: the thinking risk is *truncation*, not contamination |
| `OUTPUT_SCHEMA` (`as const`, deeply readonly) is assignable to `jsonSchema?: object` | ✅ | `npm run typecheck` clean |

## Validation Results

| Check | Command | Status |
|-------|---------|--------|
| Type Check | `npm run typecheck` | PASS (zero errors) |
| Lint | `npm run lint` | PASS (zero warnings) |
| Tests / regression gate | `npm run eval` | PASS — `clean-light` 100%, `dark-mode` 100%, aggregate 100%, all gates passed |
| Baseline untouched | `git diff --stat main -- eval/` | PASS (empty) |
| Diff scope | `git status --porcelain` | PASS — only `lib/interpret.ts` modified |

(No unit test framework in this repo by design — `npm run eval` is the stated correctness gate, and it never invokes
`interpret()`, so the 100%/zero-delta result correctly confirms nothing leaked across the measured/AI split.)

## Acceptance Criteria (issue #69)

| AC | Status |
|---|---|
| No SDK import; `requestOnce` drops the `client` param | ✅ `lib/interpret.ts:1-13`, `:143-146` |
| `OUTPUT_SCHEMA` / `SYSTEM_PROMPT` / `groundingSummary` / `applyRoleRefinements` / `MAX_INTERPRET_IMAGES` unchanged; schema passes through verbatim | ✅ no diff hunk touches any of them |
| `MAX_TOKENS` 1024 → 2048 with `thinkingLevel: MINIMAL`; stale comment rewritten | ✅ `:31-36`, `:167-168` |
| `parseJsonLoose` → `aiResponseSchema.safeParse`; Zod remains the gate | ✅ `:174-178` |
| `export { aiLaneAvailable };` still present | ✅ `:140` |
| Prompt-injection comment block preserved verbatim | ✅ `:148-155`, still attached to the image-building code |
| `lint && typecheck && eval` pass, baseline untouched | ✅ re-verified independently |

## What's Good

- **Genuinely minimal diff.** 47 lines of SDK plumbing collapse into 8 lines of intent. `requestOnce` now reads as
  *sniff → call → loose-parse → Zod* with no provider vocabulary anywhere in the file.
- **The seam held.** `lib/interpret.ts` names no model id, builds no `config` object, and constructs no client — exactly
  the invariant `lib/aiLane.ts`'s docstring asserts. The `AI_MODEL` import was correctly dropped rather than left to rot.
- **Zod stayed the hard gate.** The loose parse is additive; nothing about the validation contract moved, and the
  `parsed.success ? parsed.data : null` line is untouched.
- **The comment rewrite records a decision, not a mechanic** — why `MINIMAL`, and why 1024 no longer suffices — matching
  the surrounding register. Exactly what the codebase's comment culture asks for.
- **The measured/AI split is intact.** `extractFromCapture` still reaches for nothing; `GEMINI_API_KEY=dummy npm run eval`
  was verified byte-identical.
- **Honest reporting.** The implementation report does not claim a green run against the pinned model it could not get,
  and separates "payload verified" from "pinned model verified". That is the same *measured, never faked* discipline the
  codebase applies to extraction, applied to its own status reporting.

## Recommendation

**APPROVE.** Merge as-is — nothing in the diff needs to change. Two things to do *around* it:

1. File the `image/gif` follow-up (M1) before this chain lands; it is not covered by #70/#71/#72 as currently written.
2. Land #70 and #71 close behind (or squash the chain) so `main` never sits in the mixed-provider state (L4), and re-run
   `npm run eval:ai` against the pinned `gemini-3.5-flash` once quota resets (L1).
