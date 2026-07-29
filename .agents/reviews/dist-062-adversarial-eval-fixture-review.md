# Code Review: feature/dist-062-adversarial-eval-fixture

**Scope**: Diff of `feature/dist-062-adversarial-eval-fixture` against `main`, including uncommitted/untracked working-tree changes.
**Relates to**: GitHub issue #124 (DIST-062), judged on the diff's own merits.
**Recommendation**: APPROVE WITH NITS

## Summary

The branch adds a third committed eval fixture, `adversarial-shell` (bucket `hostile`), whose DOM is deliberately shaped to defeat the structure lane's positional shortcuts (a squash-surviving root wrapper pushing landmarks to depth 2, a `<div>`-based hero, a `.btn` with a declared transition + CSSOM `:hover`). It registers the corpus entry, un-ignores its `capture.json`, hand-authors `expected.yaml` against the *post-fix* (not current) region/section names, and commits the resulting real score (0.92) to `eval/baseline.json`. It also adds `viewport: VIEWPORT` to the shared `captureEntry()` literal in `eval/capture.ts`, an inert-today, forward-looking fix (the value already matches the structure lane's internal default). No `lib/extract/**` or other production code is touched — this is fixture + harness registration only, exactly as scoped.

Verified independently (not just re-stating the branch's own report):
- `npm run typecheck` — clean.
- `npm run lint` — clean.
- `npm run eval` — all gates pass; `adversarial-shell` scores exactly 92%, matching the committed baseline, with the documented structure misses (`SiteHeader`/`SiteFooter` band names, `SiteHeader`/`MainContent`/`SiteFooter` regions) appearing in the eval notes exactly as the fixture's own comments predict.
- `.gitignore` change confirmed via `git check-ignore -v` to correctly un-ignore only the new fixture's `capture.json`.
- The `bucket: "hostile"` literal already existed in `CorpusEntry`'s type union on `main` — no type surface was added by this branch.

## Issues Found

### Critical
None.

### High Priority
None.

### Medium Priority

1. **`eval/fixtures/adversarial-shell.html:105-113` — the "Motion-aware" / "State-aware" cards claim verification the eval harness never performs.**
   The fixture's own copy states "Declared transitions on recognized recipe elements should surface" / "CSSOM hover deltas should attribute back to the right role" under a `<small>Verified offline.</small>` label, and the implementation report claims this fixture "exercises the motion lane... states lane... neither existing committed fixture exercises." In reality, `eval/score.ts` and `eval/scoreStructure.ts` contain no scoring function for `report.motion` or `report.states` at all (confirmed by grep — only `scorePalette`, `scoreTypography`, `combinedScore`, `scoreStructure` exist), and `expected.yaml` asserts nothing about either field. The fixture does cause `extractMotion`/`buildStates` to run and populate non-empty output (per the report's scratch-script check), which is a legitimate smoke-test value (a crash or thrown exception would fail the run) — but a silent *correctness* regression in either lane (e.g. wrong role attribution, dropped entries) would not move the eval score at all and would sail through `npm run eval` and CI undetected. The "Verified offline" copy overstates what's actually gated, and could mislead a future contributor into believing motion/states regressions are caught here. Not a functional defect, but worth flagging so the coverage gap doesn't quietly become an assumed guarantee — either soften the fixture's copy/report claim, or (separately, out of this PR's stated scope) add motion/states scoring to the harness.

### Low / Nits

1. **`eval/corpus/adversarial-shell/expected.yaml:11-17`** — this is the first `expected.yaml` in the corpus that intentionally asserts *post-fix* ground truth rather than what `main` currently emits (both `clean-light` and `dark-mode` score 100%, i.e. `expected.yaml` == today's actual output there). The in-file comment explains this clearly and the plan/report cross-reference the future DIST-063 fix, so it's well-documented — but it's a new pattern for this eval suite (a fixture that's *supposed* to fail partially today) and worth a reviewer's explicit sign-off, since a less-careful future edit could "fix" the fixture to hide the very regression it's meant to expose (the file already warns against this, which mitigates the risk).

## Validation Results

| Check | Status |
|-------|--------|
| Type Check (`npm run typecheck`) | PASS |
| Lint (`npm run lint`) | PASS |
| Eval (`npm run eval`) | PASS — all gates green, `adversarial-shell` combined 92% (matches baseline), `clean-light`/`dark-mode` unchanged at 100% |

## What's Good

- Tight, single-purpose scope: no production (`lib/extract/**`) code touched, exactly as the plan stated.
- The fixture's HTML comments and `expected.yaml` header explain *why* the DOM is shaped the way it is and *why* the expected values look "wrong" today — unusually good self-documentation for a test fixture.
- The `viewport: VIEWPORT` addition to `eval/capture.ts` is correctly scoped to not disturb the two already-committed captures, and is provably inert today (matches the structure lane's existing default), removing any risk of accidental regression while still closing a real gap for future captures.
- Independently reran the eval and confirmed the exact score, misses, and gate outcome match what's documented — no unverified claims in the branch's own report needed to be taken on faith.
- `.gitignore` pattern verified to correctly scope the new committed capture without loosening the broader `/eval/corpus/*/capture.json` ignore rule.

## Recommendation

Safe to merge. The one medium finding is a documentation/coverage-claim accuracy issue, not a functional bug — the eval gate genuinely passes and nothing is broken. Consider (separately) either toning down the "Verified offline" fixture copy for the motion/states cards or filing a follow-up to add motion/states scoring to `eval/score.ts` so this fixture's stated purpose for those two lanes becomes real regression protection rather than a smoke test.
