# Code Review: feature/dist-050-structure-unavailable-no-key

**Scope**: diff of `feature/dist-050-structure-unavailable-no-key` against `main` (all changes are uncommitted working-tree edits — no commits yet on the branch)
**Files**: `lib/analyze.ts`, `app/api/analyze/route.ts`
**Recommendation**: APPROVE

## Summary

Fixes DIST-050: `analyzeImages` previously conjoined `wantsStructure` with `aiLaneAvailable()`, so a keyless image request for `mode: "structure"`/`"both"` silently resolved `structureUnavailableReason: undefined` instead of explaining the gap — contradicting both the doc comment at `lib/analyze.ts:189-191` and the frontend's generic rendering of that field. The fix splits `wantsStructure` (mode-only) from a nested `aiLaneAvailable()` check that, when false, resolves immediately with an explicit reason naming both provider env vars, without ever calling `structureFromImages`. `app/api/analyze/route.ts`'s image-branch caching gate is updated in parallel to distinguish this new persistent (no-key, safe-to-cache) reason from a genuine transient vision-call failure (still skipped from cache), re-deriving the distinction via the same `aiLaneAvailable()` predicate. The implementation matches the committed plan (`.agents/plans/completed/dist-050-structure-unavailable-no-key-plan.md`) exactly, is correctly scoped (URL-path structure extraction doesn't require a key and is untouched, `mode: "tokens"` still never touches the structure branch), and all three validation gates pass clean.

## Issues Found

### Critical
None.

### High Priority
None.

### Medium Priority
None.

### Suggestions

- `lib/analyze.ts:268-271` — the `as string | undefined` cast on the new no-key reason string literal is redundant. Verified by removing it and re-running `npm run typecheck`: passes clean either way (TS already widens the literal to `string` from the sibling branches' `string | undefined` return shape in the `Promise.all` union). Harmless, but adds noise without doing any type-safety work; could be dropped for consistency with the plain-string literal used at `lib/analyze.ts:259` (`"Vision structure inference failed for this image."`, no cast).

## Validation Results

| Check | Status |
|-------|--------|
| Type Check (`npm run typecheck`) | PASS |
| Lint (`npm run lint`) | PASS |
| Eval (`npm run eval`) | PASS — clean-light/dark-mode 100% combined, aggregate 100%, unchanged from baseline |

## What's Good

- Correctly narrows the fix to the image-input structure lane only; the URL-path structure lane (`extractStructureFromCapture`) genuinely doesn't require an AI key (Stage 7 AI naming degrades to heuristic names), so its caching gate is deliberately left untouched — verified by reading `lib/extract/structure/index.ts`'s Stage 7 contract and confirming `structureFromImage.ts` is the only key-gated structure path.
- `structureFromImages` already internally early-returns `null` when `!aiLaneAvailable()` (`lib/extract/structureFromImage.ts:150`); the new outer check in `analyzeImages` means that function is no longer even called in the no-key path, which is slightly more efficient and self-documenting than relying on the inner guard alone.
- The route-level caching gate reuses the exact same `aiLaneAvailable()` predicate `analyzeImages` used to choose the wording, rather than widening the response schema with a new boolean just to carry this bit — matches the codebase's stated preference (CLAUDE.md) for minimal-footprint fixes and keeps `aiLane.ts` the single source of truth for the availability check.
- Comments at both edit sites clearly explain *why* a reason is or isn't cacheable, distinguishing "persistent config gap" from "transient flake" — consistent with the precedent comment style already in the file for the URL-branch caching gate.
- `mode: "tokens"` is unaffected (`wantsStructure` stays `false` for it, so `structureUnavailableReason` stays `undefined` as before) — confirmed by reading the full ternary chain.
- No scratch/verification artifacts left behind (`git status --porcelain` clean of anything but the two intended source files plus pre-existing/unrelated `.agents/` docs).
- Diff is minimal and precisely scoped — no schema (`lib/schema.ts`) or frontend (`app/page.tsx`) changes needed, since the frontend already renders `structureUnavailableReason` generically.

## Recommendation

Ready to commit/merge as-is. The one suggestion (redundant type cast) is a pure style nit with zero functional impact — safe to leave as-is or clean up in the same commit at the author's discretion.
