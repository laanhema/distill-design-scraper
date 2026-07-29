# Plan: Honor the full `ModelCall` contract on the OpenRouter path (DIST-056)

## Summary

`lib/aiLane.ts`'s `callOpenRouterModel` currently ignores two `ModelCall` fields that `callGeminiModel` honors: `thinkingLevel` is dropped entirely, and `jsonSchema` is downgraded to a bare `response_format: { type: "json_object" }` instead of a real schema. The two paths also default to different model generations (`gemini-3.5-flash` vs `google/gemini-2.5-flash`). This plan closes the `jsonSchema` gap for real (send a genuine `json_schema` response format, non-strict — `STRUCTURE_SCHEMA`'s dictionary-shaped `additionalProperties` fields aren't representable under strict-mode, so strict enforcement would break the structure lane rather than help it), declares the `thinkingLevel` gap as a documented, loudly-logged degradation rather than a silent no-op (translating "thinking effort" per-model is disproportionate for this MVP, per the issue's own decision comment), aligns both providers' default model generation, restores the previously-dropped `GEMINI_MODEL` override, and brings `CLAUDE.md` / `README.md` / the PRD back into agreement with shipped behavior. `lib/aiLane.ts` remains the only file that imports a provider SDK or branches on provider — no call site changes its request-building logic, only its comments.

## User Story

As a maintainer
I want both provider paths behind `callModel` to honor the same call contract (or have any gap loudly documented)
So that identical lane code doesn't silently produce lower-quality or truncated output depending on which API key happens to be set.

## Metadata

| Field | Value |
|-------|-------|
| Type | BUG_FIX / ENHANCEMENT |
| Complexity | MEDIUM |
| Systems Affected | `lib/aiLane.ts`, `lib/interpret.ts`, `lib/extract/structure/structureAI.ts`, `lib/extract/structureFromImage.ts`, `eval/stability.ts`, `README.md`, `CLAUDE.md`, `.agents/PRDs/PRD.md` |
| GitHub Issue | #104 (DIST-056) |

---

## Decision (from issue #104's technical-notes comment)

Two legitimate resolutions were offered; this plan implements the recommended split:

1. **`jsonSchema` — close the gap.** Send `response_format: { type: "json_schema", json_schema: { name, schema } }` on the OpenRouter path instead of the current bare `json_object`. **Not** `strict: true`: `interpret.ts`'s `OUTPUT_SCHEMA` would satisfy strict mode (every property required, `additionalProperties: false` throughout), but `structureAI.ts`'s `STRUCTURE_SCHEMA` uses `additionalProperties: { type: "string" }` on `componentDefinitions`/`sectionDescriptions` to type an open-ended dictionary keyed by node id — a shape strict JSON-schema mode cannot express (it requires every property enumerated and `additionalProperties` exactly `false`). Forcing `strict: true` would make the structure lane's schema *rejected or truncated* by strict-mode providers, actively regressing what already works today. Non-strict `json_schema` still upgrades the request from a shapeless `json_object` to schema-guided output on providers that honor it, degrades no worse than today's `json_object` on providers that don't, and Zod remains the real validation gate either way — matching `lib/aiLane.ts`'s existing comment ("this only gets *some* object out of the text; it never validates shape").
2. **`thinkingLevel` — declare it degraded, loudly.** A per-routed-model capability probe for reasoning-effort translation is out of proportion to this MVP (per the issue comment). Keep the OpenRouter path ignoring `thinkingLevel`, but: (a) log a one-time process-lifetime warning the first time a call carries a `thinkingLevel` over OpenRouter, naming the lane; (b) add a comment at each of the three call sites (`interpret.ts`, `structureAI.ts`, `structureFromImage.ts`) stating the pin is Gemini-only; (c) document the gap in `README.md`, `CLAUDE.md`, and PRD §4/§8/§9.
3. **Model-generation asymmetry — settle it.** Restore the `GEMINI_MODEL` env override that was specced in Phase 5 but never built (`process.env.GEMINI_MODEL || AI_MODEL`, `AI_MODEL` stays the literal default `"gemini-3.5-flash"`), **and** bump the OpenRouter default from `google/gemini-2.5-flash` to `google/gemini-3.5-flash` so the two paths default to the same model generation while remaining independently overridable (`GEMINI_MODEL` / `OPENROUTER_MODEL`). This directly answers the issue's "pick one and record it."

No provider branching leaves `lib/aiLane.ts` — call sites only gain comments, never new logic.

---

## Patterns to Follow

### Provider dispatch (single seam, one branch point)
```typescript
// SOURCE: lib/aiLane.ts:171-176
export async function callModel(opts: ModelCall): Promise<string | null> {
  if (process.env.OPENROUTER_API_KEY) {
    return callOpenRouterModel(opts);
  }
  return callGeminiModel(opts);
}
```

### Conditional request-shape assembly (mirror this style for the schema/thinking additions)
```typescript
// SOURCE: lib/aiLane.ts:146-157 (Gemini path — the shape to bring OpenRouter closer to)
    config: {
      maxOutputTokens: opts.maxOutputTokens,
      ...(opts.system ? { systemInstruction: opts.system } : {}),
      ...(opts.thinkingLevel ? { thinkingConfig: { thinkingLevel: opts.thinkingLevel } } : {}),
      ...(opts.jsonSchema
        ? { responseMimeType: "application/json", responseJsonSchema: opts.jsonSchema }
        : {}),
    },
```

### One-time warning pattern to mirror (module-level flag, not a new shared primitive — this is local to `callOpenRouterModel`, not a second `warnAiFailure`)
```typescript
// SOURCE: lib/aiLane.ts:33 (existing "construct once" precedent)
let client: GoogleGenAI | null = null;
```

### Call-site comment style to mirror (existing inline rationale comments at `thinkingLevel` pins)
```typescript
// SOURCE: lib/interpret.ts:31-36
// This lane is grounded on tokens that were already measured, so its job is to
// read the feel — not to reason hard — hence `ThinkingLevel.MINIMAL`. The old
// 1024 was sized for a budget the answer had to itself; thinking tokens now
// share `maxOutputTokens`, so it doubles to keep a thinking prelude from
// truncating the JSON.
const MAX_TOKENS = 2048;
```

### Env var docs pattern (README config block to extend)
```env
# SOURCE: README.md:85-91
# .env.local — option A: Google Gemini (free tier, no credit card)
GEMINI_API_KEY=...

# option B: OpenRouter (takes precedence if both are set)
OPENROUTER_API_KEY=...
OPENROUTER_MODEL=google/gemini-2.5-flash   # optional; this is the default
```

### PRD checklist item resolution pattern (how prior Phase-7 items were closed)
```markdown
// SOURCE: .agents/PRDs/PRD.md:374
- [x] ~~**Redundant, version-mismatched type dependency:** ...~~ — **done 2026-07-29.** `@types/js-yaml` dropped from `devDependencies`; `--traceResolution` now resolves only the bundled v5 `.d.ts`.
```

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/aiLane.ts` | UPDATE | Real `json_schema` response format on OpenRouter; one-time `thinkingLevel`-ignored warning; `GEMINI_MODEL` override; aligned OpenRouter default model |
| `lib/interpret.ts` | UPDATE | Comment at `thinkingLevel: ThinkingLevel.MINIMAL` noting the Gemini-only pin |
| `lib/extract/structure/structureAI.ts` | UPDATE | Comment at `thinkingLevel: ThinkingLevel.LOW` noting the Gemini-only pin |
| `lib/extract/structureFromImage.ts` | UPDATE | Comment at `thinkingLevel: ThinkingLevel.MEDIUM` noting the Gemini-only pin |
| `eval/stability.ts` | UPDATE | Skip-message wording currently only names `GEMINI_API_KEY`; it's provider-agnostic via `aiLaneAvailable()`, so say so |
| `README.md` | UPDATE | Document `GEMINI_MODEL`; align OpenRouter default in prose + `.env.local` sample; replace the blanket "silently don't apply" caveat with the real jsonSchema/thinkingLevel split |
| `CLAUDE.md` | UPDATE | "Two providers, one seam" paragraph — describe the shipped, no-longer-fully-degraded reality |
| `.agents/PRDs/PRD.md` | UPDATE | §4 regression line + Out-of-Scope line, §8 stack row, §9 config table, §12 Phase 7 P2-1 item, §14 risk row — close the loop this issue tracks (P2-1), and incidentally correct the now-stale P2-2 "undocumented" claim since README already covers `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` |

---

## Tasks

### Task 1: Restore `GEMINI_MODEL` override and align default model generation

- **File**: `lib/aiLane.ts`
- **Action**: UPDATE
- **Implement**:
  1. Keep `export const AI_MODEL = "gemini-3.5-flash";` as the documented default literal (don't rename — it's referenced by other files/docs as the pinned constant name).
  2. In `callGeminiModel`, change the `model:` field from `AI_MODEL` to `process.env.GEMINI_MODEL || AI_MODEL`. Add a one-line comment: `// Restores the Phase-5-specced override that was never built; AI_MODEL stays the default.`
  3. In `callOpenRouterModel`, change the default fallback from `"google/gemini-2.5-flash"` to `"google/gemini-3.5-flash"` so both providers default to the same model generation. Keep the `process.env.OPENROUTER_MODEL ||` override as-is.
- **Mirror**: the existing `process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash"` line at `lib/aiLane.ts:74` — same shape, new default string, plus the new `GEMINI_MODEL` line for symmetry.
- **Validate**: `npm run typecheck`

### Task 2: Send a real (non-strict) `json_schema` response format on the OpenRouter path

- **File**: `lib/aiLane.ts`
- **Action**: UPDATE
- **Implement**: In `callOpenRouterModel`, replace:
  ```typescript
  ...(opts.jsonSchema ? { response_format: { type: "json_object" } } : {}),
  ```
  with a real schema-guided response format:
  ```typescript
  ...(opts.jsonSchema
    ? {
        response_format: {
          type: "json_schema",
          // Not `strict: true`: structureAI's STRUCTURE_SCHEMA types open-ended
          // dictionaries via `additionalProperties: { type: "string" }`
          // (componentDefinitions/sectionDescriptions keyed by node id) — a
          // shape strict JSON-schema mode can't express (every property must
          // be enumerated, additionalProperties must be exactly false).
          // Non-strict still upgrades the request from a shapeless
          // json_object to schema-guided output on providers that honor it,
          // and Zod remains the real gate either way (parseJsonLoose never
          // validates shape — see its doc comment below).
          json_schema: { name: "distill_ai_response", schema: opts.jsonSchema },
        },
      }
    : {}),
  ```
  Note in the same comment block (or immediately above `callOpenRouterModel`) that support for `response_format: json_schema` varies by the routed model — a custom `OPENROUTER_MODEL` override that doesn't support it will surface as a call failure through the existing `retryOnce`/`warnAiFailure` path, not a silent quality regression, which is the accepted trade-off named in issue #104's technical-notes comment.
- **Mirror**: the Gemini path's `jsonSchema` handling at `lib/aiLane.ts:154-156` for the parallel comment style.
- **Validate**: `npm run typecheck`

### Task 3: Declare `thinkingLevel` degraded, loudly, on the OpenRouter path

- **File**: `lib/aiLane.ts`
- **Action**: UPDATE
- **Implement**:
  1. Add a module-level flag near the top of the file (alongside the existing `let client: GoogleGenAI | null = null;` precedent): `let warnedThinkingLevelIgnored = false;`.
  2. At the top of `callOpenRouterModel`, add:
     ```typescript
     if (opts.thinkingLevel && !warnedThinkingLevelIgnored) {
       warnedThinkingLevelIgnored = true;
       console.warn(
         "aiLane: thinkingLevel is a Gemini-only knob and has no effect over OpenRouter — " +
           "token budgets sized for a capped thinking prelude may behave differently on this path.",
       );
     }
     ```
     One-time (not per-call) so a hot path (e.g. repeated structure-AI calls) doesn't spam the log — mirrors the "one client for the whole process" reasoning already used for `getClient()`.
  3. Do **not** pass `opts.thinkingLevel` into the OpenRouter request body — this is the accepted, now-documented gap, not a translation.
- **Mirror**: `lib/aiLane.ts:33-49` (`getClient()`'s "construct/warn once" shape).
- **Validate**: `npm run typecheck`

### Task 4: Comment the three `thinkingLevel` call sites as Gemini-only pins

- **Files**: `lib/interpret.ts`, `lib/extract/structure/structureAI.ts`, `lib/extract/structureFromImage.ts`
- **Action**: UPDATE
- **Implement**: Immediately above (or appended to the existing rationale comment near) each `thinkingLevel: ThinkingLevel.X` line, add one sentence noting the pin only applies on the Gemini path and is silently-but-loudly ignored on OpenRouter (logged once by `aiLane.ts`), so a reader sizing a token budget around a capped thinking prelude knows that assumption doesn't hold under OpenRouter.
  - `lib/interpret.ts:168` (`thinkingLevel: ThinkingLevel.MINIMAL`) — extend the existing `MAX_TOKENS` doubling comment at `lib/interpret.ts:31-36`, since that comment's whole premise (thinking tokens capped so they don't truncate the 2048 budget) is exactly what breaks on OpenRouter.
  - `lib/extract/structure/structureAI.ts:167` (`thinkingLevel: ThinkingLevel.LOW`) — add a short comment at the `callModel` call.
  - `lib/extract/structureFromImage.ts:98` (`thinkingLevel: ThinkingLevel.MEDIUM`) — add a short comment at the `callModel` call.
- **Mirror**: `lib/interpret.ts:31-36` for tone/placement.
- **Validate**: `npm run typecheck && npm run lint`

### Task 5: Fix `eval/stability.ts`'s provider-specific skip message

- **File**: `eval/stability.ts`
- **Action**: UPDATE
- **Implement**: The skip message at `eval/stability.ts:92-94` reads `"AI-lane stability eval skipped: set GEMINI_API_KEY to run it."` but the actual gate (`aiLaneAvailable()`) is `Boolean(process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY)` — the message is misleading for an OpenRouter-only setup (the eval already runs fine with only `OPENROUTER_API_KEY` set; only the log line is wrong). Reword to `"AI-lane stability eval skipped: set GEMINI_API_KEY or OPENROUTER_API_KEY to run it."` No logic change — `interpret()` already dispatches through `callModel`, which is provider-agnostic.
- **Validate**: `npm run typecheck`

### Task 6: Update `README.md`

- **File**: `README.md`
- **Action**: UPDATE
- **Implement**:
  1. Lines 67-71 (Requirements → AI provider key): add a `GEMINI_MODEL` mention to the Gemini bullet (line 68) — `**Google Gemini** — GEMINI_API_KEY, model defaults to gemini-3.5-flash, overridable via GEMINI_MODEL.` Update the OpenRouter bullet's default (line 69) to `google/gemini-3.5-flash`. Replace the blanket closing sentence (line 71 — "Gemini-only knobs ... silently don't apply ... JSON mode degrades to response_format: json_object") with the accurate split: structured output *is* requested via `response_format: json_schema` on OpenRouter now (non-strict — provider support varies), Zod is still the real shape gate on both paths either way; `thinkingLevel` remains Gemini-only and is logged once per process if a lane sends it over OpenRouter.
  2. Lines 84-92 (`.env.local` sample): add `GEMINI_MODEL=gemini-3.5-flash   # optional; this is the default` under option A, and update the `OPENROUTER_MODEL` sample default to `google/gemini-3.5-flash` under option B.
- **Validate**: manual read-through; no build step touches README.

### Task 7: Update `CLAUDE.md`

- **File**: `CLAUDE.md`
- **Action**: UPDATE
- **Implement**: Rewrite the "Two providers, one seam" paragraph (currently `CLAUDE.md:65`) to match shipped behavior:
  - `callModel` dispatch and precedence rule stays as-is (OpenRouter wins when both keys set).
  - Replace "`jsonSchema` degrades to `response_format: json_object`" with: OpenRouter now sends a real (non-strict) `response_format: json_schema`; Zod remains the actual validation gate on every path regardless, since `parseJsonLoose` never validates shape.
  - Keep noting `thinkingLevel` is Gemini-only — but change "silently don't apply" to "don't apply, and `aiLane.ts` logs a one-time warning the first time a lane sends one over OpenRouter" since it's no longer silent.
  - Note both providers now default to the same model generation (`gemini-3.5-flash` / `google/gemini-3.5-flash`), each independently overridable via `GEMINI_MODEL` / `OPENROUTER_MODEL`.
  - Leave the earlier sentence at `CLAUDE.md:63` ("It owns the pinned `AI_MODEL`...") — still accurate; `AI_MODEL` is still the pinned default, just now overridable, which the rewritten paragraph two lines down already covers in more detail.
- **Validate**: manual read-through for internal consistency with the code changes.

### Task 8: Update PRD (`.agents/PRDs/PRD.md`)

- **File**: `.agents/PRDs/PRD.md`
- **Action**: UPDATE
- **Implement**:
  1. **§4 In Scope — Technical, line 66** (the unchecked "Regression: that seam is no longer single-provider..." line): change `- [ ]` to `- [x]`, strike through the regression framing, and append a resolution note in the existing style (see `PRD.md:374` pattern) — e.g. "**closed 2026-07-29 (DIST-056).** `jsonSchema` now sends a real (non-strict) `response_format: json_schema` on OpenRouter; `thinkingLevel` remains a documented, one-time-logged Gemini-only gap; both providers default to the same model generation (`gemini-3.5-flash`), each independently overridable (`GEMINI_MODEL`/`OPENROUTER_MODEL`)."
  2. **§4 Out of Scope, line 103**: this line is already marked `[x]` with a "superseded" note contradicting itself ("Multi-provider AI abstraction... one provider, one code path" struck through, then "superseded — the two paths are not feature-equivalent... Either close the gap or restate this line as an accepted two-provider scope"). Per issue AC #5, restate it as settled, accepted two-provider scope now that the gap is closed/documented rather than leaving the "either/or" open — e.g. replace the trailing sentence with: "**Settled 2026-07-29 (DIST-056):** two providers behind one seam is accepted scope, not a regression — `lib/aiLane.ts` is still the only file importing a provider SDK, and the `ModelCall` contract's one intentionally-accepted gap (`thinkingLevel` on OpenRouter) is documented at the call sites and logged once at runtime."
  3. **§8 Technology Stack, AI lane row (line 202)**: update the trailing note. Remove "**The two provider paths are not feature-equivalent** (§12 Phase 7 / P2-1)" and replace with something like: "Both paths default to the same model generation (`gemini-3.5-flash` / `google/gemini-3.5-flash`), each overridable (`GEMINI_MODEL` / `OPENROUTER_MODEL`); OpenRouter sends a real non-strict `response_format: json_schema`, but `thinkingLevel` capping remains Gemini-only (logged once when ignored) — see §12 Phase 7 / P2-1 (closed)."
  4. **§9 Security & Configuration config table (lines 214-216)**: add a `GEMINI_MODEL` row ("Model override for the Gemini path (default `gemini-3.5-flash`) — restores the Phase-5-specced override"). Update the `OPENROUTER_API_KEY` row to drop the now-stale "Undocumented in `README.md`" clause (README already documents it as of this change). Update the `OPENROUTER_MODEL` row's default to `google/gemini-3.5-flash` and drop "No equivalent override exists for the Gemini path" (no longer true after Task 1).
  5. **§12 Phase 7, P2 item at line 378**: change `- [ ]` to `- [x]`, strike the description, and append: "**closed 2026-07-29 (DIST-056).** OpenRouter now sends a real non-strict `response_format: json_schema` (not `strict: true` — `STRUCTURE_SCHEMA`'s dictionary-shaped `additionalProperties` fields aren't representable under strict mode); `thinkingLevel` stays Gemini-only but is now asserted (one-time runtime warning) and documented at every call site; both providers default to `gemini-3.5-flash`-generation models, independently overridable via `GEMINI_MODEL`/`OPENROUTER_MODEL`."
  6. **Incidental, same section**: line 379 ("`OPENROUTER_API_KEY` and `OPENROUTER_MODEL` are undocumented — absent from `README.md`...") is already false — `README.md:67-71` documents both. Mark it `- [x]` with a short "already shipped; audit line was stale" note rather than leaving a live checklist item pointing at something already done. (Leave line 380 — the `app/page.tsx` setup-hint naming-only-`GEMINI_API_KEY` item — untouched; it's a real, separate gap outside this issue's scope.)
  7. **§14 Risks & Mitigations, row at line 420** ("Provider-specific capability gaps in a 'single seam' that no longer behaves as one"): update the Mitigation column from "Honor the full `ModelCall` contract on every provider path, or document the fallback as explicitly degraded and assert it in `eval:ai`" to reflect what shipped — e.g. "Shipped 2026-07-29 (DIST-056): `jsonSchema` honored via non-strict `response_format: json_schema`; `thinkingLevel` is the one accepted gap, now asserted via a one-time runtime warning and documented at every call site rather than silently dropped."
- **Validate**: manual read-through; grep for "P2-1" and "not feature-equivalent" afterward to confirm no dangling contradictory references remain.

### Task 9: Live verification (not a code change)

- **Action**: Manual, using the local `.env.local` (already has `GEMINI_API_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` set — confirmed present, values not inspected).
- **Implement**:
  1. Run `npm run eval:ai` twice: once with only `GEMINI_API_KEY` active (temporarily unset/comment out `OPENROUTER_API_KEY` in the environment used for the run) and once with `OPENROUTER_API_KEY` active, confirming both stay within the documented Jaccard floors (adjectives ≥ 0.5, archetype ≥ 0.3) per issue AC #6. Do this via a scoped env override on the command (e.g. `OPENROUTER_API_KEY= npm run eval:ai` for the Gemini-only run) rather than editing `.env.local`, so the file's contents are undisturbed.
  2. Specifically for issue AC #3 (interpret.ts's 2048-token budget parses without truncation over OpenRouter): this is what the `eval:ai` OpenRouter run already exercises end-to-end (`interpret()` → `callModel` → Zod-validated `AiResponse`) — if `scoreSite` doesn't return `null` for a corpus entry under an OpenRouter-only run, the JSON parsed and validated, i.e. did not truncate. No separate script is needed unless the eval run surfaces a `null`/failure, in which case inspect the `warnAiFailure` log line it produces.
- **Validate**: both runs report "✓ AI lane stable"; no `null`/skip entries caused by a truncated or unparseable OpenRouter response.

---

## Validation

```bash
npm run typecheck
npm run lint
npm run eval          # must pass unchanged; eval/baseline.json untouched — no extraction code is touched by this plan
npm run eval:ai        # live, opt-in — see Task 9 for the two-provider run instructions
```

## End-to-End Verification

1. `npm run typecheck && npm run lint && npm run eval` all green, `eval/baseline.json` untouched (confirms nothing in `lib/extract/**` was touched — this plan only edits `lib/aiLane.ts`, three call-site comments, `eval/stability.ts`'s log string, and docs).
2. With `OPENROUTER_API_KEY` set (and `GEMINI_API_KEY` unset for isolation), run a scratch `npx tsx` script from the project root that calls `interpret()` (mirroring `eval/stability.ts`'s usage) against a committed capture's `viewportShot`/`palette`/`typography`, and confirm the returned `Interpretation` is non-null with populated `identity.adjectives`/`imageMood` — proving the real `json_schema` response format round-trips through OpenRouter and Zod-validates. Delete the scratch script afterward per `CLAUDE.md`'s "Manually verifying extraction changes" convention.
3. Run `npm run eval:ai` per Task 9 with each provider active in isolation; both must print "✓ AI lane stable" within the documented Jaccard floors.
4. Grep the repo for leftover contradictions: `grep -rn "not feature-equivalent\|silently don't apply\|silently ignores" CLAUDE.md README.md .agents/PRDs/PRD.md` should return nothing that still describes the closed `jsonSchema` gap as silent (the `thinkingLevel` gap is expected to still appear, but described as *logged*, not *silent*).

---

## Risks

| Risk | Mitigation |
|------|------------|
| A custom `OPENROUTER_MODEL` override doesn't support `response_format: json_schema` and 400s where `json_object` previously succeeded | Accepted, in-scope trade-off named explicitly in issue #104's own decision comment ("OpenRouter's support varies per routed model, so it can't be unconditional"). The failure surfaces through the existing `retryOnce`/`warnAiFailure` path (visible 400 in logs), not a silent quality regression — consistent with how every other AI-lane failure already degrades. Documented in README/CLAUDE.md so an operator picking a non-default `OPENROUTER_MODEL` knows to check logs if the AI lane stops producing output. Out of scope to add per-model capability probing (explicitly called disproportionate for this MVP in the issue comment). |
| `strict: true` would silently truncate/reject `STRUCTURE_SCHEMA`'s dictionary-shaped fields if someone "improves" this later | Documented in-code at the `callOpenRouterModel` json_schema block (Task 2) explaining exactly why `strict` is omitted, so a future editor doesn't add it without re-reading `STRUCTURE_SCHEMA`'s shape. |
| Bumping the OpenRouter default model string (`google/gemini-2.5-flash` → `google/gemini-3.5-flash`) could 404/error if that slug isn't (yet) routable on OpenRouter | Verify live during Task 9's `eval:ai` OpenRouter run before considering this task done — if the model isn't yet available on OpenRouter, fall back to keeping the OpenRouter default at `google/gemini-2.5-flash` and instead document the (still-present but now *deliberate*) generation gap in README/CLAUDE.md/PRD rather than blocking the whole issue on OpenRouter's model catalog. This is a judgment call to make live, not blind — the plan's Task 1 mirror shows the change, but §12/§8/README wording should be adjusted to match whichever default actually ends up shipping. |
| One-time `console.warn` for `thinkingLevel` could fire mid-request-handling in a way that's easy to miss in server logs | Matches the existing `warnAiFailure` convention (structured, prefixed `console.warn`/`console.error` lines) already used elsewhere in this file — no new logging channel introduced. |
| Live verification (Task 9) requires real API calls and could hit rate limits or incur cost | Both keys are already present in the local `.env.local`; scope the live run to the existing 2-site eval corpus (`clean-light`, `dark-mode`) as `eval:ai` already does — no new corpus entries needed. If rate-limited, the response cache and existing 429-vs-quality-regression guidance in PRD §14 already cover how to tell the difference. |

---

## Acceptance Criteria

(Mirrors issue #104's acceptance criteria directly.)

- [ ] Given a lane that passes `thinkingLevel`, when dispatched over OpenRouter, the gap is asserted (one-time runtime warning) and documented at each call site — not silently dropped.
- [ ] Given a lane that passes `jsonSchema`, when dispatched over OpenRouter, a real (non-strict) `response_format: json_schema` is sent; Zod remains the shape gate, noted in-code.
- [ ] Given `interpret.ts`'s 2048-token budget, running over OpenRouter with a real key parses without truncation (verified live per Task 9).
- [ ] `CLAUDE.md` and PRD §4/§8/§9 describe the shipped two-provider reality, including the one accepted gap (`thinkingLevel`).
- [ ] PRD §4's Out-of-Scope line is restated as accepted two-provider scope, not left contradicting the code.
- [ ] `npm run eval:ai` stays within the documented Jaccard floors (0.5 adjectives / 0.3 archetype) against each provider (Task 9).
- [ ] `npm run typecheck`, `npm run lint`, and `npm run eval` all pass with `eval/baseline.json` untouched.
- [ ] All tasks completed; changes follow existing patterns (single seam in `lib/aiLane.ts`, no provider branching leaks into call sites, optional-field/comment-only changes at call sites).
