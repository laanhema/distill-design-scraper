# Code Review: feature/fix-multi-file-selection-race (issue #23)

**Scope**: Diff of branch `feature/fix-multi-file-selection-race` against `main`, including uncommitted changes — one file, `app/page.tsx` (+54/-27)
**Recommendation**: APPROVE (with nits)

## Summary

The change fixes the multi-file selection race by replacing the two parallel state arrays with a single `SelectedImage[]` (`{ file, preview }`), populated via `Promise.allSettled` over promisified `FileReader` reads so entries land paired and in selection order, and fixes the stale structure tab by resetting `tab` away from `"structure"` when a new result carries no structure report. The fix is correct, minimal, and matches the issue's acceptance criteria exactly (single state entry, no parallel-index pairing, tab reset). It stays within existing file conventions (local interfaces at top, functional state updates, Tailwind JSX).

## Issues Found

### Critical
None

### High Priority
None

### Medium Priority
None

### Suggestions (Low)

1. `app/page.tsx:74-77` — `room` is computed from the `images.length` closure before an `await`, so two rapid drops can both see the same stale length and each accept up to `room` files. The final `slice(0, MAX_IMAGES)` in the functional update correctly enforces the cap, so this is only a transient over-accept of file reads (wasted `FileReader` work), never an over-cap state. Acceptable as-is; computing `accepted` inside the functional update would remove even that.
2. `app/page.tsx:279` — preview tiles still use the array index as the React `key` (pre-existing pattern, not introduced by this diff). Content is fully prop-derived so no bug results, but a stable key (e.g. the preview data URL) would avoid DOM reuse across removals.
3. `app/page.tsx:71` — the floating promise at the two `handleFilesSelect` call sites is safe today only because `Promise.allSettled` never rejects; if a future edit adds a throwing step after the `await`, the rejection would be unhandled. A `void` marker or `.catch` would make the invariant explicit.

## Correctness Walkthrough

- Callers materialize `FileList` via `Array.from` synchronously before `e.target.value = ""`, and `File` objects stay readable after the input resets — the async read cannot lose its sources.
- `Promise.allSettled` preserves input order, so pairs append in selection order regardless of read-completion order; pairing is structural (`{file, preview}` in one entry), satisfying AC1/AC2. No references to `selectedFiles`/`imagePreviews` remain.
- Failed reads are skipped (omitted, not fabricated) — consistent with the project's "measured, never faked" principle.
- The structure `Tab` only renders when `structureReport` exists, and `tab` can no longer remain `"structure"` when a new result lacks one, so `copyActiveMarkdown`'s `structureReport?.markdown ?? ""` branch is unreachable with an empty string (AC3). Error-path analyses clear `report`, so the results section (and tab strip) unmounts entirely — no stale pane there either.
- The `alt` fallback changed from `??` to `||`, which now also covers empty-string filenames — a small improvement.

## Validation Results

| Check | Status |
|-------|--------|
| Type Check (`npm run typecheck`) | PASS |
| Lint (`npm run lint`) | PASS |
| Tests (`npm run eval` — project's stated gate) | PASS (all gates, clean-light/dark-mode 100%) |

## What's Good

- Root cause fixed structurally (one state entry) rather than patched (e.g. sorting previews) — the class of bug is eliminated, not just the symptom.
- `slice(0, MAX_IMAGES)` inside the functional update makes the cap race-proof.
- Comments cite the issue number and explain *why*, matching the codebase's documentation style.

## Recommendation

Approve. The three low-severity suggestions are optional polish and do not block; proceed to commit/PR.
