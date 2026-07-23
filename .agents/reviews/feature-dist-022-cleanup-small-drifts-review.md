# Code Review: feature/dist-022-cleanup-small-drifts

**Scope**: Uncommitted changes on `feature/dist-022-cleanup-small-drifts` vs `main` (7 files, +124/-77) — issue #28 (DIST-022) cleanup sweep
**Recommendation**: APPROVE (with nits)

## Summary

Reviewed the six-drift cleanup sweep against the issue's acceptance criteria and the project's CLAUDE.md invariants (measured-lane offline replayability, shared aiLane primitives, omit-don't-fake). Every AC is addressed, the changes are tightly scoped, behavior changes are limited to the intended ones (stricter `isNearMatch`, retry-on-parse-failure in structure Stage 7, harvester node cap), and all gates pass with unchanged eval scores. No correctness, security, or pattern violations found; three low-severity observations below.

## Issues Found

### Critical
None.

### High Priority
None.

### Medium Priority
None.

### Suggestions (Low)

1. `lib/extract/structure/harvester.ts:83-85` — when the cap prunes subtrees, the harvest is silently truncated; `styleDump.ts` surfaces a `truncated: boolean` for the same situation. `RawHarvestNode` has no such flag, so downstream stages can't distinguish "small page" from "capped pathological page". Out of this AC's scope (would touch `structureSchema.ts` and committed capture shapes), but worth a follow-up if truncation ever needs to be reported.
2. `lib/extract/structure/harvester.ts:117` — ids are assigned post-order, so nodes already on the recursion stack when the cap trips still complete: the total can exceed `NODE_CAP` by roughly the tree depth (observed 5003 for cap 5000 on a synthetic ~6000-node DOM). Bounded and harmless for the payload-bounding goal; fine as is.
3. `lib/extract/structure/repetition.ts:88-96` — the child-tag comparison is positional, so a single inserted leading child shifts every position and defeats the 80% threshold even for otherwise-identical lists. The doc comment states the positional rule honestly, so comment and behavior agree (the AC's requirement); a multiset-overlap comparison would be more forgiving if variance tagging ever under-fires in practice.

## Verified Details

- `stripDataUrlPrefix` (`app/api/analyze/route.ts:48-52`): `[a-zA-Z0-9.+-]+` correctly matches `svg+xml` (trailing `-` is literal in the class); non-data-URL strings pass through unchanged.
- Enum unification: `REFINABLE_COLOR_ROLES` is the single source — `COLOR_ROLES` builds on it, `refinableColorRoleSchema` gates `aiResponseSchema.roleRefinements[].role`, and `OUTPUT_SCHEMA`/`applyRoleRefinements` in `lib/interpret.ts` derive from it. Narrowing the Zod side is lossless: structured outputs already constrained the model to the same 7 values, and `lib/analyze.ts:146` consumes the (now narrower) type compatibly. `swatchSchema.role` and the states-lane `target` field correctly stay on the full `colorRoleSchema`.
- `structureAI.ts`: `requestOnce` + `retryOnce` mirrors `interpret.ts`/`structureFromImage.ts`; an empty `message.content` array throws inside `requestOnce` and is caught/logged/retried by `retryOnce`'s `.catch`, same as before the refactor. The inline `process.env.ANTHROPIC_API_KEY` check was replaced with `aiLaneAvailable()` per CLAUDE.md. Behavior change (parse failures now get one repair retry) is exactly the shared policy the AC demands. The prompt-injection annotation from issue #27 was preserved verbatim.
- `structureFromImage.ts`: counter is threaded through recursion and created fresh per invocation — concurrent-request id collisions and unbounded growth both fixed; ids remain deterministic per report.
- `repetition.ts` variance tagging: the near-match child is pushed (tag, don't collapse) with the intent now documented — matches the review-C7 note that `matchedVariance` never affected control flow by design.
- svg handling in the harvester is behavior-neutral dead-code removal (svg was exempted by the old `&& tag !== "svg"` clause and is still harvested).

## Validation Results

| Check | Status |
|-------|--------|
| Type Check (`npm run typecheck`) | PASS |
| Lint (`npm run lint`) | PASS |
| Eval (`npm run eval`) | PASS — clean-light 100%, dark-mode 100%, aggregate 100%, no baseline refresh |

(No unit test framework exists in this project; `npm run eval` is the stated correctness gate. Live-only harvester behavior was verified via a synthetic-fixture Playwright scratch script, since deleted, per the CLAUDE.md "manually verifying extraction changes" pattern.)

## What's Good

- Each fix resolves comment/behavior drift in the direction the codebase's own docs demand (shared aiLane primitives, styleDump-mirrored cap, single-source enums).
- The one security-weighted item (unbounded harvest payload) is closed with the exact bound the reviewer asked for.
- Eval-sensitive change was verified score-neutral instead of reflexively refreshing the baseline.

## Recommendation

Approve. The three suggestions are optional follow-ups, none blocking. Next step: commit on the feature branch and open the PR via the follow-up command, then `/issue-done 28` after merge.
