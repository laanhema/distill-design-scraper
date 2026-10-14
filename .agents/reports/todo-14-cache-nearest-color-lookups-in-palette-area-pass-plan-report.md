# Implementation Report

**Plan**: `.agents/plans/completed/todo-14-cache-nearest-color-lookups-in-palette-area-pass-plan.md`
**Branch**: `feature/todo-14-cache-nearest-color-lookups-in-palette-area-pass`
**Status**: COMPLETE

Nothing is committed: the change is an uncommitted edit of one file on the branch (project git policy).

## Summary

The pixel loop of `assignAreaWeights` (`lib/extract/palette.ts`) now takes each pixel's nearest canonical color from a `Map<number, number>` that lives for one call. The key is the 24-bit RGB value `(r << 16) | (g << 8) | b`; the value is the nearest canonical index, or -1 when no canonical color is within `PIXEL_MATCH_LAB`. The Lab conversion and the scan over the canonical colors run only on a miss. A pixel whose cached value is -1 still adds to `farCount` and to its `farBuckets` entry.

The reports are the same as before, byte for byte, on the three committed captures, and the palette lane is about 4 times faster on them:

| Capture | Sampled pixels | Distinct RGB values | `extractPalette` before | after |
|---------|----------------|---------------------|-------------------------|-------|
| `clean-light` | 325,120 | 2,813 | 167.0 ms | 40.4 ms |
| `dark-mode` | 311,680 | 2,838 | 191.1 ms | 43.1 ms |
| `adversarial-shell` | 296,320 | 3,106 | 139.0 ms | 40.1 ms |

(Best of 5 on the host. The time includes the PNG decode and the DOM-color merge, which did not change.)

The map holds at most 65,536 entries (`NEAREST_CACHE_MAX`). When it is full it is emptied and filled again. The issue's note describes an unbounded map; the ceiling and the reset are this run's decisions, and the section Deviations gives the measurements behind them.

One cost remains, and the owner should know it: on a screenshot where nearly every pixel has its own RGB value, a cache cannot help, and the lookups make the pass slower than on `main`. On 1.5 million pixels of noise the palette lane took 1,274 ms against 1,095 ms (16 % more in the last run, 16 to 33 % more over the runs of this session). With an unbounded map the same input took about 60 % more.

GitHub issue: #178 (finding M8 of `.agents/reviews/codebase-analysis-review.md:28`).

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Take the snapshot on the unchanged code | scratch `area-pass-check.mts` (outside the repository, deleted) | PASS |
| 2 | Cache the nearest canonical index per RGB value | `lib/extract/palette.ts` | PASS |
| 3 | Prove that the results are identical and the pass is faster | scratch `area-pass-check.mts` (deleted) | PASS |
| 4 | Run the full gate | none | PASS |

## Validation Results

| Check | Result | Command / environment |
|-------|--------|-----------------------|
| Type check | PASS | `npm run typecheck` (also step 1 of `npm run check`) — host, Node v22.23.1 |
| Lint | PASS | `npm run lint` (also step 2 of `npm run check`) — host |
| Build | PASS | `next build` as step 3 of `npm run check` — host |
| Tests (eval gate) | PASS (3 fixtures at `combined 100%`, `aggregate combined: 100%`, `✓ all gates passed`, the same as on `main` at `3fd3cde`; `UPDATE_BASELINE` never set) | `npm run eval` (also step 4 of `npm run check`) — host |
| Full CI gate | PASS (exit 0) | `npm run check` — host, no `verify.sh` instance running, scratch files deleted first |
| E2E 1: snapshot on the unchanged code | PASS (`snapshot written`, exit 0) | `npx tsx "$SCRATCH/area-pass-check.mts" snapshot "$SCRATCH/before.json"` — host, no browser, no network |
| E2E 1, dry run: compare on the unchanged code against its own snapshot | Red as intended (exit 1: every identity line `ok`, both speed-up lines `FAIL`) | `npx tsx "$SCRATCH/area-pass-check.mts" compare "$SCRATCH/before.json"` — host |
| E2E 2: compare after the change | PASS (10 `ok` lines, `all checks ok`, exit 0) | the same command — host |
| E2E 3: the identity check fails on a wrong cache key | PASS (exit 1 with 4 `FAIL` lines; the file was then restored and E2E 2 passed again) | the same command, with the key changed to `(r << 16) \| (g << 8)` — host |
| Extra: identity with a ceiling of 4 entries, so the reset runs on every synthetic page | PASS (`all checks ok`, exit 0; the constant was then restored) | the same command, with `NEAREST_CACHE_MAX = 4` — host |
| E2E 4: full gate, `eval/` untouched | PASS (`git diff --stat -- eval/` prints nothing) | `npm run check && git status --short && git diff --stat -- eval/` — host |

### E2E 2 output (after the change, last run)

```
info clean-light: 325120 pixels, 2813 distinct RGB values, 0 image-sourced swatch(es), extractPalette 40.4 ms (best of 5)
info dark-mode: 311680 pixels, 2838 distinct RGB values, 0 image-sourced swatch(es), extractPalette 43.1 ms (best of 5)
info adversarial-shell: 296320 pixels, 3106 distinct RGB values, 0 image-sourced swatch(es), extractPalette 40.1 ms (best of 5)
info synthetic: 300 cases, 94 with an image-sourced swatch
info large flat shot (3.84 M pixels): extractPalette 65.4 ms (best of 3)
info large noise shot (1.536 M pixels, 1467580 distinct RGB values): extractPalette 1274.0 ms (best of 3)
info hero photo above flat UI (3.84 M pixels): extractPalette 363.5 ms (best of 3)
ok   clean-light: report, markdown, viewport-only and dark palettes identical
ok   dark-mode: report, markdown, viewport-only and dark palettes identical
ok   adversarial-shell: report, markdown, viewport-only and dark palettes identical
ok   synthetic palettes identical (300 cases)
ok   large flat shot: palette identical
ok   large flat shot: at most 0.5 × the snapshot's time: 65.4 ms now, 2054.1 ms in the snapshot
ok   large noise shot: palette identical
ok   large noise shot: at most 1.5 × the snapshot's time: 1274.0 ms now, 1094.8 ms in the snapshot
ok   hero photo above flat UI: palette identical
ok   hero photo above flat UI: at most 0.5 × the snapshot's time: 363.5 ms now, 2130.8 ms in the snapshot

all checks ok
```

Each capture line compares the whole report object, the Markdown, the palette from the viewport shot alone and the palette of the dark-scheme render.

### The snapshot on the unchanged code (`main` at `3fd3cde`)

```
info clean-light: 325120 pixels, 2813 distinct RGB values, 0 image-sourced swatch(es), extractPalette 167.0 ms (best of 5)
info dark-mode: 311680 pixels, 2838 distinct RGB values, 0 image-sourced swatch(es), extractPalette 191.1 ms (best of 5)
info adversarial-shell: 296320 pixels, 3106 distinct RGB values, 0 image-sourced swatch(es), extractPalette 139.0 ms (best of 5)
info synthetic: 300 cases, 94 with an image-sourced swatch
info large flat shot (3.84 M pixels): extractPalette 2054.1 ms (best of 3)
info large noise shot (1.536 M pixels, 1467580 distinct RGB values): extractPalette 1094.8 ms (best of 3)
info hero photo above flat UI (3.84 M pixels): extractPalette 2130.8 ms (best of 3)
```

### E2E 3 output (wrong cache key)

```
FAIL clean-light: report, markdown, viewport-only and dark palettes identical
ok   dark-mode: report, markdown, viewport-only and dark palettes identical
FAIL adversarial-shell: report, markdown, viewport-only and dark palettes identical
FAIL synthetic palettes identical (300 cases): 20 differ, first seeds 23, 24, 62, 98, 128
ok   large flat shot: palette identical
ok   large flat shot: at most 0.5 × the snapshot's time: 70.6 ms now, 2054.1 ms in the snapshot
ok   large noise shot: palette identical
ok   large noise shot: at most 1.5 × the snapshot's time: 203.9 ms now, 1094.8 ms in the snapshot
FAIL hero photo above flat UI: palette identical
ok   hero photo above flat UI: at most 0.5 × the snapshot's time: 177.7 ms now, 2130.8 ms in the snapshot

4 check(s) failed
```

In the first differing synthetic page, the `surface` swatch moved from `areaWeight` 0.22 to 0.213 and nothing else changed, so the check sees a credit that is off by a few pixels.

## Files Changed

| File | Action | Lines |
|------|--------|-------|
| `lib/extract/palette.ts` | UPDATE | +36/-11 |

Not part of the change: the plan (moved to `.agents/plans/completed/`) and this report, both new files.

## Deviations from Plan

1. **A full cache is emptied and refilled; the plan said that it stops taking entries.** The plan's Task 2 had `if (nearest.size < NEAREST_CACHE_MAX) nearest.set(rgbKey, match);`. The code has `if (nearest.size >= NEAREST_CACHE_MAX) nearest.clear(); nearest.set(rgbKey, match);`. The plan's version passed every check of the plan, and a measurement outside the plan then showed its weakness: on a page with a photograph at the top, the photograph's colors fill the map, and the flat UI below is never cached. Timings of `extractPalette`, best of 5 on the host, in ms:

   | Screenshot | `main` | stop when full (plan) | empty and refill (code) | unbounded (issue's note) |
   |------------|--------|-----------------------|-------------------------|--------------------------|
   | 1.5 M pixels of noise | 980 | 1,197 | 1,206 | 1,569 |
   | 1.5 M pixels, photograph-like gradient with noise | 890 | 1,177 | 1,083 | 1,449 |
   | 384,000 pixels of noise above 3.46 M pixels of flat UI | 1,967 | 2,046 | 359 | 440 |

   The results are identical under all three policies, because the cache only skips repeated work. A ceiling of 16,384 entries gave the same timings as 65,536, so the plan's value stayed.

2. **The scratch check gained a case that the plan's script does not have**: the third screenshot of the table above, with an identity line and a speed-up line (at most 0.5 × the snapshot's time). The snapshot was taken again on the unchanged code (`git stash`, snapshot, compare for the dry run, `git stash pop`) so that it holds the new case. The addition to the plan's script, verbatim:

   ```typescript
   // In `interface Snapshot`:
     heroPalette: string;
     heroMs: number;

   /** A page with a photograph on top: 640 × 600 pixels of seeded noise (384,000
    *  pixels, more distinct values than the cache holds) above 640 × 5400 pixels
    *  of flat UI bands. A cache that stops taking entries once it is full gains
    *  nothing here; one that is emptied and refilled caches the UI below. */
   async function heroCase(): Promise<{ palette: string; ms: number }> {
     const width = 640;
     const height = 6000;
     const heroHeight = 600;
     const rand = prng(1780);
     const raw = Buffer.alloc(width * height * 3);
     for (let y = 0; y < height; y++) {
       const band = BANDS[Math.floor(((y - heroHeight) / (height - heroHeight)) * BANDS.length)];
       for (let x = 0; x < width; x++) {
         const i = (y * width + x) * 3;
         if (y < heroHeight) {
           raw[i] = Math.floor(rand() * 256);
           raw[i + 1] = Math.floor(rand() * 256);
           raw[i + 2] = Math.floor(rand() * 256);
         } else {
           raw[i] = band[0];
           raw[i + 1] = band[1];
           raw[i + 2] = band[2];
         }
       }
     }
     return timed(bandDump(), await pngFromRaw(raw, width, height, 3));
   }

   // At the end of `collect()`, before the return, which also gets `heroPalette: hero.palette, heroMs: hero.ms`:
     const hero = await heroCase();
     console.log(`info hero photo above flat UI (3.84 M pixels): extractPalette ${hero.ms.toFixed(1)} ms (best of 3)`);

   // In `main()`, after the noise checks:
     check("hero photo above flat UI: palette identical", now.heroPalette === before.heroPalette);
     check(
       `hero photo above flat UI: at most ${SPEEDUP_REQUIRED} × the snapshot's time`,
       now.heroMs <= before.heroMs * SPEEDUP_REQUIRED,
       `${now.heroMs.toFixed(1)} ms now, ${before.heroMs.toFixed(1)} ms in the snapshot`,
     );
   ```

3. **An extra check ran: the compare with `NEAREST_CACHE_MAX = 4`.** The synthetic pages have at most 500 pixels and never fill a map of 65,536 entries, so they did not exercise the reset. With a ceiling of 4 the reset runs many times on every page, and all 300 palettes stayed identical. The constant was restored afterwards (`git diff` equal to the diff saved before the experiment).

4. **The plan's Summary understates the worst case.** It says that a value that arrives after the map is full "is computed as it is today". The result is the same, but each such pixel also pays a failed lookup, which is the 16 to 33 % of the Summary above. The plan's guard (noise at most 1.5 × the snapshot's time) passed in every run.

5. **The ceiling itself is not in the issue.** The issue's note describes an unbounded `Map<number, number>`. The plan added the ceiling after measuring a map of 2.83 million entries at 168 MiB of heap. The acceptance criteria hold with it: the cache is per call, keyed by the RGB value, and Lab is computed only on a miss.

## Tests Written

The project has no test framework (`AGENTS.md`), so none was introduced. The change was exercised through the eval gate and through the scratch script of the plan's End-to-End Verification section, which was deleted after use.

| Test File | Test Cases |
|-----------|------------|
| scratch `area-pass-check.mts` (outside the repository, deleted; its text is in the plan, and its one addition is in Deviations above) | Whole report, Markdown, viewport-only palette and dark palette identical for `clean-light`, `dark-mode` and `adversarial-shell`; 300 seeded synthetic pages of at most 500 pixels identical (94 with an image-sourced swatch); a 3.84 M pixel flat screenshot identical and at most 0.5 × the time; a 1.5 M pixel noise screenshot identical and at most 1.5 × the time; a photograph above flat UI identical and at most 0.5 × the time |

## Acceptance Criteria of the Issue

- The area pass takes each pixel's nearest canonical color from a per-call cache keyed by its RGB value, and computes Lab only on a miss: met (`lib/extract/palette.ts`, the loop of `assignAreaWeights`).
- Area weights and image-sourced colors are identical to before for the three committed captures: met (E2E 2). None of the three captures produces an image-sourced swatch, so that path was shown identical on the synthetic pages.
- `npm run eval` prints the same scores, with the baseline untouched: met (E2E 4).
