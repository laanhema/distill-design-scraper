# Plan: Score the `states`, `motion` and `paletteDark` lanes in the eval gate

## Summary

`npm run eval` scores only palette, typography and structure (`combinedScore`, `eval/score.ts:135-150`). So a wrong `states`, `motion` or `paletteDark` value passes the gate, and those lanes are only crash-tested (`docs/architecture/eval.md:12`). The change adds three optional keys to the strict `expectedSpecSchema` (`eval/score.ts:18-31`):

- `states`: a list of flattened `{target, state, property, from, to}` changes.
- `motion`: a list of `{target, kind, property, durationMs, timingFunction, delayMs?, iterationCount?}` entries.
- `paletteDark`: a role → hex map, like `palette`.

Two new scorers, `scoreStates` and `scoreMotion`, score those lists. `paletteDark` reuses `scorePalette`, which now accepts `Palette | undefined`. `scoreSite` (`eval/run.ts:57-125`) passes each scored lane's accuracy to `combinedScore` as a new `extraLanes` argument. Each scored lane takes a fixed 0.1 share of the combined score, and the existing palette/typography/structure weighting gets the rest. With no extra lanes the formula is the one on HEAD, so `clean-light`, `dark-mode` and `saas-landing` keep exactly their scores.

`adversarial-shell/expected.yaml` gains the one hover state and the one transition that its capture holds. A new fixture, `eval/fixtures/two-scheme.html`, redefines its CSS variables under `prefers-color-scheme: dark`. It joins the corpus as `two-scheme` with a committed capture and an `expected.yaml` that scores palette, typography, structure and `paletteDark`.

**Decision: a tighter ΔE for states (probe, 2026-11-02).** The palette tolerance is ΔE 12 (`eval/score.ts:13`). A hover shade sits close to its base: `#6d28d9` → `#5b21b6` is ΔE 5.73. So under the palette tolerance, a wrong `to` value equal to the base color would score as a match. `scoreStates` compares colors at ΔE ≤ 2 instead, because states are read verbatim from the CSSOM. Non-color values (`box-shadow`) are compared as normalized CSS text.

**Decision: `min(1)` on the `states`/`motion` lists.** An empty list would score 1.0 while asserting nothing. The schema's own doc comment (`eval/score.ts:15-17`) gives the same reason for being strict.

**Decision: bucket `dark-mode` for the new entry.** `CorpusEntryBase.bucket` (`eval/corpus.ts:9-15`) has no two-scheme bucket. `dark-mode` is the closest one, and the bucket is only a label.

Every `file:line` in this plan is a line of HEAD `a1d470f`, before the prototype patch is applied.

## User Story

As a developer changing the design-tokens extractors
I want `npm run eval` to fail when a `states`, `motion` or dark-scheme palette value goes wrong
So that a regression in those lanes is caught by CI, not discovered in a report

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT |
| Complexity | MEDIUM |
| Systems Affected | Eval harness (`eval/score.ts`, `eval/run.ts`, `eval/corpus.ts`, `eval/corpus/*`, `eval/fixtures/`, `eval/baseline.json`), `docs/architecture/eval.md`, verify skill docs |
| GitHub Issue | #221 (TODO-28, `TODO.md:10`) |
| PRD Phase | N/A |
| Prototype Patch | `.agents/plans/todo-28-score-states-motion-and-palette-dark-in-eval-prototype.patch` |

## Environment Findings

| Probe | Result |
|-------|--------|
| `npm run eval` on HEAD | All four sites `combined 100%`, `aggregate combined: 100%`, `✓ all gates passed` (≈1.8 s) |
| `eval/baseline.json` on HEAD | `clean-light`, `dark-mode`, `adversarial-shell`, `saas-landing`: all `1` |
| `adversarial-shell` report on HEAD (`extractFromCapture`) | `states`: one entry, `primary hover background-color #6d28d9 → #5b21b6`. `motion`: one entry, `Button transition background-color 150ms ease`. No focus state and no keyframes. The raw dump has the same hover delta and transition on two `.btn` nodes |
| `saas-landing` report | 3 state entries and 5 motion entries. Left unscored, as the issue asks |
| `paletteDark` in any committed capture | None. All four have `darkCapture`, but `extractDarkPalette` (`lib/extract/palette.ts:483-498`) drops a dark palette whose background did not move by ΔE ≥ 10 |
| ΔE of a hover pair vs the palette tolerance | `#6d28d9`/`#5b21b6` 5.73, `#2dd4bf`/`#14b8a6` 7.27: both under 12, hence the states tolerance of 2 |
| New fixture capture (`npm run eval:capture -- two-scheme`) | `ok (29 nodes)`. Keys: `source, finalUrl, title, viewport, viewportShot, styleDump, rawHarvestNode, responsiveHarvests, darkCapture`. There is no `scrollShots` or `panoramaShot`, because the page fits in one viewport |
| New fixture report | Light: background `#fafaf9`, surface `#f0efed`, text `#1c1917`, primary `#0f766e`, muted `#78716c`, border `#d6d3d1`. Dark: background `#0c0a09`, surface `#1c1917`, text `#f5f5f4`, primary `#2dd4bf`, muted `#a8a29e`, border `#44403c`. Each matches the fixture's CSS tokens exactly. Body family `Source Sans 3`. Scale h1 46 / h2 30 / h3 21 / body 16 / small 13. No states or motion |
| New fixture structure (heuristic naming) | Sections `SiteHeader, Hero, CardGrid, SiteFooter`. Components include `TextLink 4`, `Button 2`, `SectionCard 3`. The skeleton has `SiteHeader`, `MainContent`, `CardGrid` and `SiteFooter` |
| `npm run eval` with the prototype and the capture | Five sites at 100%. `adversarial-shell … states 100%  motion 100%`, `two-scheme … dark 100%`, `✓ all gates passed` |
| `UPDATE_BASELINE=1 npm run eval` with the prototype | `git diff eval/baseline.json` adds only `"two-scheme": 1`. The other four stay `1` |
| `npx tsc --noEmit`, `npx eslint eval` with the prototype | Both exit 0 |
| Wrong-value check (End-to-End Verification) with the prototype | Exit 0, four `ok` lines. A wrong state or motion value: `adversarial-shell` 90% < baseline. A wrong `paletteDark` role: `two-scheme` 98% < baseline |
| Wrong-value check on HEAD | Exit 1. `sed changed nothing` for both `adversarial-shell` cases, because there is no `states`/`motion` key. The `two-scheme` case fails because the spec is missing |
| Capture repeatability | The patch applied to a second, clean worktree and recaptured there gave identical scores and an identical baseline diff |
| Forward references to #221 / TODO-28 | Only `TODO.md:10` and `.agents/issues/todo-issues.md` (off-limits). There is no code placeholder |
| Verify fixture server | Serves every `eval/fixtures/*.html` (`.claude/skills/verify/SKILL.md:25`), so the new page is served with no script change |

## Patterns to Follow

### Strict spec keys, optional so other specs stay valid

```ts
// SOURCE: eval/score.ts:18-31
export const expectedSpecSchema = z.strictObject({
  name: z.string(),
  bucket: z.string(),
  palette: z.record(z.string(), z.string()),
  typography: z
    .strictObject({
      bodyFamily: z.string().optional(),
      scale: z.record(z.string(), z.number()).optional(),
    })
    .optional(),
  /** Optional structure spec — when present, the structure lane
   *  is scored against it and folded into `combinedScore`. */
  structure: expectedStructureSpecSchema.optional(),
});
```

### Miss notes, one line each, prefixed by lane

```ts
// SOURCE: eval/run.ts:97-113
  for (const m of pal.misses) {
    notes.push(
      `palette ${m.role}: expected ${m.expected}, got ${m.got ?? "—"}` +
        (m.deltaE !== null ? ` (ΔE ${m.deltaE.toFixed(1)})` : ""),
    );
  }
  ...
  for (const m of structureMisses) {
    notes.push(`structure: ${m}`);
  }
```

### Fixture spec header: what the page stresses, why the values are right

```yaml
# SOURCE: eval/corpus/dark-mode/expected.yaml:1-4
# Hand-authored ground truth for the dark-mode fixture (§10).
# Stresses "largest-area dark → background", not mislabelling the whole page.
name: dark-mode
bucket: dark-mode
```

### Tests

This repo has no unit test framework (`AGENTS.md`, Commands). `npm run eval` is the gate, and the wrong-value check in End-to-End Verification shows AC 3.

## Files to Change

| File | Action | In patch? | Purpose |
|------|--------|-----------|---------|
| `eval/score.ts` | UPDATE | Yes | Adds `STATE_DELTA_E_TOLERANCE`, `expectedStateSchema`, `expectedMotionSchema`, and the spec keys `paletteDark`/`states`/`motion`. Adds `scoreStates`, `scoreMotion`, `LaneScore` and `EXTRA_LANE_WEIGHT`. `scorePalette` accepts `undefined`. `combinedScore` gains `extraLanes` and delegates the old formula to `baseScore` |
| `eval/run.ts` | UPDATE | Yes | Scores the three lanes when the spec has them, passes `extraLanes`, adds `paletteDark …` / `states …` / `motion …` notes, and adds `dark` / `states` / `motion` columns to the summary line |
| `eval/corpus.ts` | UPDATE | Yes | Adds the `two-scheme` `CorpusEntry` (bucket `dark-mode`) |
| `eval/fixtures/two-scheme.html` | CREATE | Yes | Light tokens, redefined under `@media (prefers-color-scheme: dark)` |
| `eval/corpus/two-scheme/expected.yaml` | CREATE | Yes | Palette, `paletteDark`, typography and structure ground truth |
| `eval/corpus/adversarial-shell/expected.yaml` | UPDATE | Yes | Appends `states` and `motion` with a comment |
| `eval/corpus/two-scheme/capture.json` | CREATE | **No** | Task 1 generates it. It is left out of the patch because `finalUrl` records the absolute path of the checkout that captured it |
| `eval/baseline.json` | UPDATE | No | Task 2: deliberate refresh |
| `docs/architecture/eval.md` | UPDATE | No | Task 4 |
| `.claude/skills/verify/SKILL.md` | UPDATE | No | Task 5: fixture list |
| `.claude/skills/verify/features/README.md` | UPDATE | No | Task 5: fixture list |

## Tasks

Execute in order. `/implement` applies the patch before Task 1.

### Task 1: Capture the new fixture, and only it

- **File**: `eval/corpus/two-scheme/capture.json`
- **Action**: CREATE
- **Implement**: Run `npm run eval:capture -- two-scheme` from the repo root. The slug argument is mandatory: a bare `npm run eval:capture` recaptures all five fixtures (`selectEntries`, `eval/capture.ts:62-70`), and the issue forbids refreshing the existing captures. Expect `Capturing two-scheme… ok (29 nodes)`.
- **Mirror**: `eval/capture.ts:9-15` (usage comment)
- **Validate**: `git status --short eval/corpus` shows ` M eval/corpus/adversarial-shell/expected.yaml` and `?? eval/corpus/two-scheme/` only, with no ` M …/capture.json`. Then `npm run eval` exits 0 with `adversarial-shell … states 100%  motion 100%` and `two-scheme … dark 100%`.

### Task 2: Refresh the baseline deliberately

- **File**: `eval/baseline.json`
- **Action**: UPDATE
- **Implement**: `UPDATE_BASELINE=1 npm run eval`. This is the intended result (AC 4), so the refresh is deliberate.
- **Mirror**: `AGENTS.md`, eval workflow step 3
- **Validate**: `git diff eval/baseline.json` shows only `"saas-landing": 1,` and `+  "two-scheme": 1`. The four existing values stay `1`.

### Task 3: Prove a wrong value fails the gate (AC 3)

- **File**: none (scratch script, in End-to-End Verification)
- **Action**: CHECK
- **Implement**: Save the script below to a scratch path outside the repo and run it from the repo root. It edits one `expected.yaml` line at a time and restores it from a backup. Afterwards, check that `git status --short eval/corpus` matches Task 1.
- **Mirror**: n/a
- **Validate**: `bash <scratch>/wrong-value-check.sh` exits 0 and prints four `ok` lines.

### Task 4: Document the scored lanes

- **File**: `docs/architecture/eval.md`
- **Action**: UPDATE
- **Implement**:
  - Line 3 (Coverage scope): add `two-scheme` to the required fixtures. It is a page whose CSS variables are redefined under `prefers-color-scheme: dark`, so its capture is the only one that produces `paletteDark`, and its `expected.yaml` scores that palette.
  - After the "Both lanes are scored" paragraph (line 8), add one short paragraph. An `expected.yaml` may also carry `states`, `motion` and `paletteDark`, all optional. Each scored lane takes a 0.1 share of `combinedScore` (`EXTRA_LANE_WEIGHT`), and the old weighting keeps the rest, so a spec without them keeps its score. State colors match at ΔE ≤ 2, not the palette's 12, because a hover shade is often within ΔE 6 of its base. Only `adversarial-shell` asserts `states`/`motion`. `saas-landing`'s states and motion stay unscored.
  - Line 12: replace "(none produce `paletteDark`), and eval doesn't score either lane — so it can catch a crash in them, but not a wrong value." with wording that says `adversarial-shell`'s states and motion are scored, `saas-landing`'s are crash-tested only, and `two-scheme` is the one capture that produces `paletteDark`.
- **Mirror**: the existing paragraph style of `docs/architecture/eval.md:5-8`
- **Validate**: `grep -n "two-scheme\|EXTRA_LANE_WEIGHT\|doesn't score either lane" docs/architecture/eval.md` shows the first two and not the third.

### Task 5: List the new fixture page in the verify skill docs

- **File**: `.claude/skills/verify/SKILL.md`, `.claude/skills/verify/features/README.md`
- **Action**: UPDATE
- **Implement**:
  - `SKILL.md:25`: add `two-scheme` to the parenthesized list after `saas-landing`.
  - `features/README.md:11`: add `` `$FIXTURE_URL/two-scheme.html` (light page with a `prefers-color-scheme: dark` scheme) `` after the `saas-landing` item.
  - Leave the `drive.ts` usage comment (`.claude/skills/verify/scripts/drive.ts:7`) unchanged. It does not list `saas-landing` either, and the issue does not name it.
- **Mirror**: the existing list items on those lines
- **Validate**: `grep -c two-scheme .claude/skills/verify/SKILL.md .claude/skills/verify/features/README.md` prints `1` for each.

### Task 6: Full gate

- **File**: none
- **Action**: CHECK
- **Implement**: If a `verify.sh` instance is up, run `verify.sh down` first: `scripts/guard-build.mjs` blocks the build otherwise. Then run `npm run check`.
- **Mirror**: n/a
- **Validate**: `npm run check` exits 0, and its eval step prints five sites at 100% and `✓ all gates passed`.

## Validation

```bash
# Type check / Build
npm run typecheck

# Lint
npm run lint

# Tests (the eval gate): five sites at 100%, adversarial-shell shows states/motion, two-scheme shows dark
npm run eval

# AC 3: a wrong states / motion / paletteDark value fails the gate (exit 0 = all four ok lines)
bash <scratch>/wrong-value-check.sh

# Full CI gate
npm run check
```

## End-to-End Verification

`npm run eval` executes every changed line: the spec schema, the three scorers, `combinedScore`, and the new corpus entry. The script below drives it with deliberately wrong values. It ran on HEAD (exit 1, see Environment Findings) and on the prototype (exit 0).

1. After Tasks 1–2, `npm run eval` prints:
   ```
   adversarial-shell combined 100%  roles 100%  type 100%  ΔE 0.0  states 100%  motion 100%
   ...
   two-scheme     combined 100%  roles 100%  type 100%  ΔE 0.0  dark 100%
   ✓ all gates passed
   ```
2. Save this script outside the repo as `wrong-value-check.sh` and run `bash <scratch>/wrong-value-check.sh` from the repo root:

```bash
#!/usr/bin/env bash
# AC 3: a deliberately wrong expected states / motion / paletteDark value must
# lower that site's score and fail `npm run eval`. Run from the repo root:
#   bash wrong-value-check.sh
# Each case edits one expected.yaml line in place, runs the gate, and restores
# the file from a backup (also on exit), so the tree ends unchanged.
set -u
fail=0
backup_dir=$(mktemp -d)
restore() { for f in "$backup_dir"/*.yaml; do [ -e "$f" ] && cp "$f" "eval/corpus/$(basename "$f" .yaml)/expected.yaml"; done; rm -rf "$backup_dir"; }
trap restore EXIT

check() { # slug, sed expression, expected note substring
  local slug=$1 expr=$2 note=$3 spec="eval/corpus/$1/expected.yaml"
  cp "$spec" "$backup_dir/$slug.yaml"
  sed -i "$expr" "$spec"
  if cmp -s "$spec" "$backup_dir/$slug.yaml"; then echo "FAIL $slug: sed changed nothing ($expr)"; fail=1; return; fi
  out=$(npm run eval 2>&1); code=$?
  cp "$backup_dir/$slug.yaml" "$spec"
  if [ "$code" -ne 0 ] && grep -qF "✗ regression $slug" <<<"$out" && grep -qF "$note" <<<"$out"; then
    echo "ok   $slug: exit $code, \"$note\", $(grep -F "✗ regression $slug" <<<"$out" | sed 's/^ *//')"
  else
    echo "FAIL $slug: exit $code, wanted \"✗ regression $slug\" and \"$note\""; fail=1
    grep -E "✗|does not match|$slug" <<<"$out" | head -5 | sed 's/^/     /'
  fi
}

check adversarial-shell 's/to: "#5b21b6"/to: "#6d28d9"/' 'states primary hover background-color: expected #6d28d9 → #6d28d9, got #6d28d9 → #5b21b6'
check adversarial-shell 's/durationMs: 150/durationMs: 200/' 'motion Button transition background-color: expected 200ms ease, got 150ms ease'
check two-scheme '/^paletteDark:/,/^typography:/s/primary: "#2dd4bf"/primary: "#0f766e"/' 'paletteDark primary: expected #0f766e, got #2dd4bf'

if npm run eval >/dev/null 2>&1; then echo "ok   unmodified specs: npm run eval exits 0"; else echo "FAIL unmodified specs: npm run eval exits non-zero"; fail=1; fi
exit $fail
```

   Expected output (prototype run):
   ```
   ok   adversarial-shell: exit 1, "states primary hover background-color: expected #6d28d9 → #6d28d9, got #6d28d9 → #5b21b6", ✗ regression adversarial-shell: 90% < baseline 100%
   ok   adversarial-shell: exit 1, "motion Button transition background-color: expected 200ms ease, got 150ms ease", ✗ regression adversarial-shell: 90% < baseline 100%
   ok   two-scheme: exit 1, "paletteDark primary: expected #0f766e, got #2dd4bf", ✗ regression two-scheme: 98% < baseline 100%
   ok   unmodified specs: npm run eval exits 0
   ```
   The first case is a wrong value that the palette tolerance would have accepted (ΔE 5.73). The script needs Task 2's baseline: without a `two-scheme` baseline the third case only meets the 0.7 floor and passes.
3. Afterwards, `git status --short eval/corpus` matches Task 1.

The verify skill (`/verify`) adds nothing here. The UI already renders `paletteDark`, and this change touches only the offline gate. CI runs the same `npm run check` with no API key, and the eval forces heuristic naming, so no live outside service is called.

## Risks

| Risk | Mitigation | Scope |
|------|------------|-------|
| A bare `npm run eval:capture` recaptures the four existing fixtures (`eval/capture.ts:69`), which the issue forbids | Task 1 passes `-- two-scheme` and checks `git status`. If a `capture.json` shows ` M`, restore it with `git checkout -- eval/corpus/<slug>/capture.json` | In scope |
| `paletteDark` uses the palette's ΔE 12 tolerance, so a swap of near colors (dark surface ↔ background is ΔE 4.0) would still score | Same property as the light palette. A wholly wrong role (light primary for dark primary) fails, as the check shows | Out of scope: flag only |
| Lane granularity: a lane is worth 0.1, so with 10 or more expected items one wrong item drops the site by ≤ 0.01 and passes `REGRESSION_EPS` | Today's largest lane has 6 items (one wrong role: −0.0167). The new doc paragraph names the 0.1 share, so a future spec author can see the limit | Out of scope: flag only |
| Scoring is recall-only, like `scorePalette`. An extra, fabricated state or motion entry is not penalized | See Open Question 1 | Open Question |
| The capture depends on the capturing machine (the screenshot, the font fallback for `Source Sans 3`) | Role colors and sizes come from computed CSS, and `bodyFamily` from the declared stack. A second clean worktree recaptured with identical scores. The capture is committed, so CI never recaptures | In scope (verified) |
| `capture.json` stores `finalUrl` as an absolute `file://` path | Capture from the repo root, as the existing four were (`file:///home/lauri/github/distill-design-scraper/...`). This is why the patch leaves the capture out | In scope |
| The `two-scheme` capture has no `scrollShots`/`panoramaShot` (the page fits one viewport) | Both are optional capture fields. The palette falls back to `viewportShot` (`lib/analyze.ts:58`), and eval scores 100% | Accepted |

## Open Questions

1. **Should unexpected `states`/`motion` entries lower the score?** Proposed default: **no**, recall only, mirroring `scorePalette`. Precision would protect "measured, never faked". But it would also turn every legitimate extractor improvement (say a focus state that is detected for the first time) into a score drop that needs a spec edit. The issue's AC 3 asks only for wrong expected values to be caught. A follow-up could add a "no unexpected entries" option per lane.
2. **Weight of an extra lane.** Proposed default: **0.1 each**, applied on top of the unchanged base weighting. Then a wiped lane fails the gate (−0.1) but cannot reach the 0.7 floor alone, and specs without the lanes keep their exact scores (AC 4). A larger share would make one-item lanes like `adversarial-shell`'s dominate that site.

## Acceptance Criteria

- [ ] All tasks completed
- [ ] `expectedSpecSchema` accepts optional `states`, `motion` and `paletteDark`, and `adversarial-shell/expected.yaml` lists its hover state and transition (issue AC 1)
- [ ] `two-scheme` is in the corpus with a committed capture and `expected.yaml`, and its `paletteDark` is scored (issue AC 2)
- [ ] The wrong-value check exits 0 (issue AC 3)
- [ ] The four existing fixtures stay at `1`, and `eval/baseline.json` gains only `"two-scheme": 1` (issue AC 4)
- [ ] `npm run check` passes (issue AC 5)
- [ ] `.agents/issues/todo-issues.md` is untouched
