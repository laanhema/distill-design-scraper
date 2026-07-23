# Code Review: feature/dist-030-ai-section-descriptions

**Scope**: Branch `feature/dist-030-ai-section-descriptions` — diff vs `main` (4 lib files, +107/-15), uncommitted changes included
**Recommendation**: APPROVE (with one nit)

## Summary

The change extends the Stage 7 AI labelling pass to also return one-line section intent descriptions in the same single API call, joining them onto Stage 9 digests by stable node id. The implementation is additive end-to-end: the schema field, response field, input field, and rendered line are all optional, and the no-key/model-failure path provably renders byte-identical output to `main`. The `findDigestBands` extraction correctly makes the prompt's digest list and Stage 9's digest share one band-identity source, matching the repo's "no inline copies" convention (cf. `styleMatch.ts`/`roleMatch.ts`).

## Issues Found

### Critical
None

### High Priority
None

### Medium Priority
None

### Suggestions

- **Low — `structureAI.ts:58` (`DigestListEntry.contents`)**: the field holds only the band node's *own* `textSnippet`, not a contents summary — deep sections often have no snippet on the band node itself, so the name slightly oversells what the model receives. Harmless (the compact tree carries the real content), but `textSnippet` would be the honest name, or the field could be dropped. Non-blocking nit.

## Validation Results

| Check | Status |
|-------|--------|
| Type Check (`npm run typecheck`) | PASS |
| Lint (`npm run lint`) | PASS |
| Tests (`npm run eval`) | PASS — aggregate 100%, no baseline refresh |
| E2E (synthetic fixture, no API key) | PASS — `sectionsText` byte-identical vs `main`; AI-path rendering spot-checked |

## What's Good

- **Id-keyed join** — descriptions key off band node ids (which survive `applyNodeUpdates` and `annotateRegionMetrics` via spread copies), so the join is robust to the AI pass renaming bands. Name-keying would have been fragile; this is the right call.
- **Untrusted-key filtering** — returned `sectionDescriptions` are filtered to known band ids before use; the model can't inject entries for arbitrary nodes.
- **Offline invariant preserved** — both fallback returns (no key, retry-exhausted) omit the field; `extractFromCapture`/`extractStructureFromCapture` still never touch the network, and the eval gate passes untouched.
- **Prompt-injection blast radius unchanged in kind** — the new response field is plain strings rendered as report text, inside the same Zod-validated JSON gate the existing comment block documents.
- **`max_tokens` 2000 → 3000** anticipates truncation from the enlarged response — easy to have forgotten.

## Recommendation

Approve. Optionally rename `DigestListEntry.contents` → `textSnippet` in a follow-up or before merge; otherwise ready to commit and PR.
