# Code Review: DIST-034 — Rebuild `lib/aiLane.ts` on `@google/genai` with a `callModel` primitive

**Scope**: branch `feature/dist-034-ailane-gemini-callmodel` (uncommitted working tree vs `main`) — `lib/aiLane.ts`, `package.json`, `package-lock.json`, plus untracked plan/report docs
**Issue**: [#68](https://github.com/laanhema/distill-design-scraper/issues/68)
**Recommendation**: APPROVE WITH NITS

## Summary

The provider seam is rebuilt cleanly on `@google/genai@2.13.0`. `callModel`, `parseJsonLoose`, the lazily-constructed module-level client, and the `ThinkingLevel` re-export all match the story's acceptance criteria, and `retryOnce` is genuinely byte-identical to `main`. I verified the SDK surface against the installed type definitions rather than the plan's prose: `config.responseJsonSchema` exists (line 5069), `responseMimeType` exists (line 5042), `response.text` is a `string | undefined` getter that correctly skips `thought` parts, and every `ThinkingLevel` member is a non-empty string — so the wiring in `callModel` is correct on all counts.

All three gates are green and `eval/baseline.json` is untouched. Every finding below is a residual-risk or observability concern, not a defect in what the story set out to build. No blocking issues.

## Issues Found

### Critical

None.

### High Priority

None.

### Medium Priority

**M1 — `aiLaneAvailable()` now gates three Anthropic call sites on `GEMINI_API_KEY` (`lib/aiLane.ts:24-26`)**

The seam flipped to `GEMINI_API_KEY`, but `lib/interpret.ts:214`, `lib/extract/structure/structureAI.ts:162`, and `lib/extract/structureFromImage.ts:173` still construct `new Anthropic()` behind that same gate. `.env.local` in this working tree already carries a `GEMINI_API_KEY`, so under `next dev` on this branch the gate now opens on all three lanes and each one fails inside the Anthropic client's missing-key constructor.

The report's "zero behavioural change" claim (`.agents/reports/dist-034-...-report.md:17`) holds only when `GEMINI_API_KEY` is unset. With it set, the observable deltas are:

- two `AI Structure Labeller failed` / `Vision structure inference failed` warnings per analysis where `main` logged none;
- image + `structure`/`both` mode now returns `structureUnavailableReason: "Vision structure inference failed for this image."` where `main` returned `undefined` (`lib/analyze.ts:234`, `249-261`);
- as a direct consequence, `app/api/analyze/route.ts:180` and `:227` stop caching those responses — every repeat request re-renders;
- wasted work before the failure: `detectImageMediaType` runs `sharp` metadata over up to four uploads (`structureFromImage.ts:177`) before the client throws.

This is an accepted consequence of the DIST-034/035/036/037 story split, not a coding error, and it resolves the moment DIST-035–037 land. Flagging it so the intermediate state is not merged to `main` and left there, and so the report's "zero behavioural change" line is read with that caveat.

**Recommendation**: land DIST-035/036/037 before this reaches `main`, or squash-merge the four together. No code change needed in this story.

**M2 — `callModel` collapses truncation, safety blocks, and empty candidates into a silent `null` (`lib/aiLane.ts:98-99`)**

`return text && text.trim() ? text : null` discards `finishReason` and `promptFeedback`. `retryOnce`'s `onError` fires only on a *throw* (`lib/aiLane.ts:136-144`), so a `null` return produces **zero diagnostic output** — one silent retry, then a silent fallback.

The three cases that land here are exactly the ones worth seeing: `finishReason: "MAX_TOKENS"` (the plan's own note at `ModelCall.thinkingLevel` says thinking tokens share `maxOutputTokens`, making truncation the single most likely new failure mode — and `interpret.ts` still sits at `MAX_TOKENS = 1024`), `finishReason: "SAFETY"`, and empty `candidates`. All three read identically to "the model had nothing to say".

This directly undercuts the migration's stated purpose — the plan's verification step 5 says *"a silent heuristic fallback is exactly the failure mode this migration exists to end"* — and it is the seam's own responsibility, since call sites never see the raw response.

**Recommendation**: when `text` is empty, `console.warn` (or throw, so `onError` catches it) with `response.candidates?.[0]?.finishReason` and `response.promptFeedback?.blockReason`. Cheap, and it makes the difference between "model declined" and "budget truncated" visible during the DIST-035–037 rollout.

**M3 — `ModelCall.images[].mediaType: ImageMediaType` advertises a type Gemini rejects (`lib/aiLane.ts:54`)**

`ImageMediaType` (`lib/extract/imageMediaType.ts:3`) includes `"image/gif"`, which is not in Gemini's inline-image MIME set (png / jpeg / webp / heic / heif). The upload path is `accept="image/*"` (`app/page.tsx:254`), so a GIF upload reaches `detectImageMediaType`, gets tagged `image/gif`, and will `400` the vision lane at call time.

The plan's "Verified SDK facts" asserts the Gemini set is "a superset of what `imageMediaType.ts` already emits, so that file needs no logic change" — that premise is wrong. Credit where due: the implementation report already caught this and carried it forward (`report.md:104`) to DIST-036/037.

**Recommendation**: as flagged, fix in DIST-036/037 — either transcode GIF to PNG via `sharp` or narrow the union. Since the seam is the one place that knows the provider, narrowing `ModelCall`'s own `mediaType` to the Gemini-supported subset (and making the transcode the caller's problem) would push the failure to compile time rather than call time.

### Suggestions

**S1 — `parseJsonLoose`'s `unknown | null` return type is a no-op (`lib/aiLane.ts:111`)**. `unknown` already subsumes `null`, so the union collapses and call sites get no narrowing from it. `Promise<unknown>` says the same thing; if the `null` is meant to be load-bearing documentation, the JSDoc already carries it.

**S2 — the "one shared JSON extractor" docstring is aspirational (`lib/aiLane.ts:104-106`)**. Both inline copies are still live at `lib/extract/structureFromImage.ts:118` and `lib/extract/structure/structureAI.ts:134`. Accurate once DIST-035–037 land; today the file claims a consolidation that hasn't happened. Consider a "(consumers migrate in DIST-035–037)" clause, matching how the file already scopes its "only file that imports a provider SDK" claim.

**S3 — truthiness guards on optional config (`lib/aiLane.ts:86-87`)**. `opts.thinkingLevel ? …` and `opts.system ? …` are correct today (all `ThinkingLevel` members are non-empty strings, verified at `genai.d.ts:12897-12920`), but `!== undefined` states the actual intent and survives an SDK adding a falsy member.

**S4 — `jsonSchema?: object` (`lib/aiLane.ts:58`)** admits arrays and functions. `Record<string, unknown>` is closer to what `responseJsonSchema` wants. Very minor — the SDK types it `unknown` anyway.

**S5 — no backoff between `retryOnce` attempts**. Out of scope by design (`retryOnce` is deliberately untouched), but worth restating: the report observed persistent `503 UNAVAILABLE` on `gemini-3.5-flash`, and free-tier limits are ~10 RPM. Two back-to-back attempts with no delay is the wrong shape for a capacity error, and a 429/503 fallback is indistinguishable from a quality regression. Already on the carried-forward list (`report.md:105`); worth a decision before DIST-040.

**S6 — dependency footprint (`package-lock.json`)**. `@google/genai` pulls 37 transitive packages (`google-auth-library`, `protobufjs`, `ws`, `node-fetch`, `gaxios`, …) and sits alongside `@anthropic-ai/sdk` until DIST-038. `npm audit --omit=dev` reports 4 high-severity advisories, but all resolve to `next/node_modules/postcss` and `next/node_modules/sharp` — **pre-existing, not introduced by this change**. No action here; just don't let DIST-038 slip.

## Validation Results

| Check | Command | Status |
|-------|---------|--------|
| Type Check | `npm run typecheck` | PASS (clean, exit 0) |
| Lint | `npm run lint` | PASS (clean, exit 0) |
| Tests / regression gate | `npm run eval` | PASS — `clean-light` 100%, `dark-mode` 100%, aggregate 100%, "all gates passed" |
| Baseline integrity | `git status` | PASS — `eval/baseline.json` not modified; only `lib/aiLane.ts`, `package.json`, `package-lock.json` touched |
| Install tree | `npm ls @google/genai` | PASS — `@google/genai@2.13.0` resolved |

Independently re-verified against the installed `node_modules/@google/genai/dist/genai.d.ts` (not the plan's prose):

- `responseJsonSchema` present (`:5069`), `responseMimeType` present (`:5042`), `responseSchema` correctly not used
- `get text(): string | undefined` (`:5186`); implementation skips `part.thought === true` parts (`node/index.mjs:2637-2643`) — so thinking output can't leak into the parsed payload
- `ThinkingLevel` is a string enum (`:12897`) — no falsy member, so the truthiness guard at `aiLane.ts:87` is safe

## What's Good

- **`retryOnce` really is untouched.** Verified against `git show main:lib/aiLane.ts` — identical. The story changed the provider without touching the fallback policy, exactly as AC #6 demands.
- **The client-caching comment is not decorative.** Assigning `client` only after a successful `new GoogleGenAI` (`:46-48`) genuinely prevents a missing-key throw from poisoning later calls, and the explicit `{ apiKey }` pass-through means the gate and the client can't disagree about which key — a real class of bug closed rather than a comment about one.
- **`getClient()` throws rather than constructing a keyless client** (`:38-43`), routing a mis-gated caller through `retryOnce`'s `onError` instead of an opaque SDK failure. Good instinct, and precisely the pattern M2 should extend to the empty-text case.
- **The JSON-mode pairing is structurally unfailable** (`:92-94`) — one conditional spread sets `responseMimeType` and `responseJsonSchema` together, and call sites never build `config`, so the "both set is an error" trap can't be hit.
- **Comments explain decisions, not mechanics.** The `ModelCall.thinkingLevel` note about thinking tokens sharing `maxOutputTokens` is the kind of thing the next migrator would otherwise learn from a truncated response.
- **Honest reporting.** The implementation report volunteers that the live probe was served by `gemini-3.5-flash-lite`, not the pinned model, and self-flags the `image/gif` gap — both material caveats that would have been easy to omit. That matches the codebase's "measured, never faked" principle applied to its own process.

## Recommendation

**Approve with nits.** No blocking defects; the story delivers exactly its stated scope and all gates are green.

Before merging to `main`:

1. **M1** — sequence DIST-035/036/037 with this one so `main` never carries a Gemini-gated Anthropic call path. This is a merge-ordering decision, not a code change.
2. **M2** — worth folding into DIST-035 (or here, ~5 lines): surface `finishReason` / `blockReason` when `callModel` returns `null`. This is the story's own goal, and it is the one gap that will make the DIST-035–037 rollout harder to debug than it needs to be.
3. **M3** — already carried forward correctly; no action in this story.

S1–S6 are optional polish.
