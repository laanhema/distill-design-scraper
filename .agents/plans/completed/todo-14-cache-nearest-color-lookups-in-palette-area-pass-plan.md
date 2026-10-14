# Plan: TODO-14: Cache nearest-color lookups in the palette area pass

## Summary

`assignAreaWeights` (`lib/extract/palette.ts:126-211`) credits each sampled screenshot pixel to its nearest canonical color. For every pixel, the loop of lines 149-177 converts the pixel to Lab (line 153) and scans all canonical colors (lines 155-163), although a screenshot of a UI repeats a few thousand RGB values over hundreds of thousands of pixels. This plan (GitHub issue #178, finding M8 of `.agents/reviews/codebase-analysis-review.md:28`) adds a cache that lives for one call: a `Map<number, number>` from the 24-bit RGB value to the nearest canonical index, or -1 when no canonical color is within `PIXEL_MATCH_LAB`. Lab is computed only on a miss. The nearest index is a pure function of the RGB value while `canon` does not change, and `canon` changes only after the loop (line 198), so every pixel gets the result that it gets today. The "far" branch (lines 167-176) still runs once per pixel, so `farCount` and the first-seen `r`/`g`/`b` of each `farBuckets` entry do not change either.

Measured while planning, on `main` at `3fd3cde`:

- `npm run eval` exits 0: `clean-light`, `dark-mode` and `adversarial-shell` at `combined 100%`, `aggregate combined: 100%`, `✓ all gates passed`. Start green, stay green.
- The issue's numbers hold. The three committed captures sample 325,120, 311,680 and 296,320 pixels with 2,813, 2,838 and 3,106 distinct RGB values, and `extractPalette` takes 130-190 ms on each (best of 5; the issue states 153-213 ms). The issue's line numbers are 3 lines off: the loop is at 149-177 and the conversion at 153.
- None of the three committed captures produces an image-sourced swatch, so they alone cannot show that the "far" path is unchanged. The scratch check of the End-to-End Verification section adds 300 seeded synthetic pages, 94 of which produce one.
- `npm run eval` scores role names and ΔE, not area weights, so the eval gate can stay green on a wrong credit. The scratch check compares the whole report.
- The scratch check, run on `main` against its own snapshot, prints `ok` for every identity check and `FAIL large flat shot: at most 0.5 × the snapshot's time: 1929.2 ms now, 1932.0 ms in the snapshot`, and exits 1. So it shows the change.

Decision:

- **The cache stops growing at 65,536 entries (`NEAREST_CACHE_MAX`).** The issue's note describes an unbounded map, on the premise that a screenshot holds few distinct colors. That premise fails on a photograph-heavy page: a `Map<number, number>` filled from 3.1 million distinct values (the 12-viewport panorama cap) took 168 MiB of heap and 1.2 s for the map operations alone, more than the Lab work that it replaces. With the ceiling, the map holds about 6 MiB at most, a UI screenshot (about 3,000 values) is cached in full, and a value that arrives after the map is full is computed as it is today. The results are the same with or without the ceiling. The scratch check guards this with a 1.5 million pixel noise screenshot that must not take more than 1.5 × its time on `main` (985 ms).

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT |
| Complexity | LOW |
| Systems Affected | `lib/extract/palette.ts` |
| GitHub Issue | #178 (finding M8 of `.agents/reviews/codebase-analysis-review.md:28`) |
| PRD Phase | N/A |
| Prototype Patch | N/A |

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/extract/palette.ts` | UPDATE | Add `NEAREST_CACHE_MAX` and the per-call nearest-color cache in the pixel loop of `assignAreaWeights` |

No change: `lib/color.ts`, `lib/extract/imagePalette.ts`, `lib/analyze.ts`, `docs/architecture/tokens-lane.md` (its description of the area pass stays true), `eval/corpus/*`, `eval/baseline.json`, `AGENTS.md`, `package.json`.

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Take the snapshot on the unchanged code

- **File**: `$SCRATCH/area-pass-check.mts` (scratch, outside the repository, never committed)
- **Action**: CREATE, run
- **Implement**: Follow step 1 of the End-to-End Verification section. The snapshot must be written before `lib/extract/palette.ts` is edited (`git status --short lib/` prints nothing).
- **Mirror**: `eval/run.ts:44-52` (load a committed capture and call `extractFromCapture`)
- **Validate**: `npx tsx "$SCRATCH/area-pass-check.mts" snapshot "$SCRATCH/before.json"` prints `snapshot written` and exits 0

### Task 2: Cache the nearest canonical index per RGB value

- **File**: `lib/extract/palette.ts`
- **Action**: UPDATE
- **Implement**:
  - After the `IMAGE_COLOR_MIN_SHARE` constant (line 45), add `const NEAREST_CACHE_MAX = 1 << 16;` with a comment that states why: it is the ceiling on the entries of the area pass's per-call nearest-color cache; a UI screenshot holds a few thousand distinct RGB values and is cached in full; a photograph-heavy page can hold millions, where an unbounded map costs more memory and time than the Lab math that it saves; a value that arrives after the map is full is computed directly, so the ceiling never changes a result.
  - Before the pixel loop (line 149), declare `const nearest = new Map<number, number>();` with a comment: nearest canonical index per RGB value, or -1 when no canonical color is within `PIXEL_MATCH_LAB`; valid for this call only, because the answer depends on `canon`, which must not change while the loop runs (the image-sourced colors are appended after it).
  - In the loop, after `r`, `g`, `b` are read: compute `const rgbKey = (r << 16) | (g << 8) | b;` and `let match = nearest.get(rgbKey);`. When `match === undefined`, run today's code (the `labTriple` call of line 153 and the scan of lines 155-163, unchanged), set `match = bestDist <= PIXEL_MATCH_LAB_SQ ? best : -1;`, and store it with `if (nearest.size < NEAREST_CACHE_MAX) nearest.set(rgbKey, match);`.
  - Replace the condition of line 165 with `if (match >= 0) { credited[match]++; } else { … }`. Keep the `else` body (lines 168-175) as it is, so a pixel whose cached value is -1 still adds to `farCount` and to its `farBuckets` entry.
  - `best >= 0 && bestDist <= PIXEL_MATCH_LAB_SQ` and `bestDist <= PIXEL_MATCH_LAB_SQ ? best : -1` agree: `canon` is not empty here (line 130), and when no distance compares below `Infinity`, `best` is still -1.
  - Change nothing else: `totalPixels`, the area-weight division (lines 179-181) and the image-sourced block (lines 183-210) stay as they are.
- **Mirror**: `lib/extract/palette.ts:135-138` (a per-call `Map` keyed by a packed RGB integer, with a comment that states why)
- **Validate**: `npm run typecheck && npm run lint && npm run eval`

### Task 3: Prove that the results are identical and the pass is faster

- **File**: `$SCRATCH/area-pass-check.mts` (scratch)
- **Action**: run, then DELETE
- **Implement**: Follow steps 2 and 3 of the End-to-End Verification section, then delete the scratch directory.
- **Mirror**: N/A (scratch)
- **Validate**: `npx tsx "$SCRATCH/area-pass-check.mts" compare "$SCRATCH/before.json"` prints `all checks ok` and exits 0

### Task 4: Run the full gate

- **File**: none
- **Action**: run
- **Implement**: Follow step 4 of the End-to-End Verification section.
- **Mirror**: N/A
- **Validate**: `npm run check && git status --short`

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Eval gate (must print the same scores: combined 100% for each fixture, aggregate 100%; never set UPDATE_BASELINE)
npm run eval

# Everything CI runs: typecheck → lint → build → eval (no verify.sh instance may be up)
npm run check
```

`npm run eval` executes the changed loop but scores only role names and ΔE. The check that compares area weights and image-sourced colors is the scratch check below.

## End-to-End Verification

The change has no effect that a browser could show: the report must be the same, byte for byte. So the proof is a scratch script that calls the real entry points (`extractFromCapture` and `extractPalette`) before and after the change, with no browser and no network, and the running app is not needed.

Set up the scratch directory outside the repository. The script's own `import sharp` resolves from the script's location, so the directory needs a link to the project's `node_modules`; `@/` and `eval/corpus/...` resolve from the working directory, which must be the project root:

```bash
SCRATCH="$(mktemp -d)"        # or the session's scratch directory
ln -sfn "$PWD/node_modules" "$SCRATCH/node_modules"
```

Create `$SCRATCH/area-pass-check.mts` with this content:

````typescript
// Scratch check for #178 (cache nearest-color lookups in the palette area pass).
// Never committed. It lives in a scratch directory outside the repository that
// holds a `node_modules` symlink to the project's, and runs with the project
// root as the working directory (so `@/` resolves through the project's
// tsconfig.json and `eval/corpus/...` resolves from the cwd):
//
//   npx tsx "$SCRATCH/area-pass-check.mts" snapshot "$SCRATCH/before.json"   # on the unchanged code
//   npx tsx "$SCRATCH/area-pass-check.mts" compare  "$SCRATCH/before.json"   # after the change
//
// `compare` exits 1 unless (a) every output is identical to the snapshot,
// (b) the palette lane on a large flat-color screenshot takes at most half the
// snapshot's time, and (c) on a large all-noise screenshot, where a cache
// cannot help, it takes at most 1.5 × the snapshot's time. Run against its own
// snapshot on unchanged code, (a) and (c) hold and (b) fails, so the check
// shows the change. No browser, no network.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { extractFromCapture, type Capture } from "@/lib/analyze";
import { extractPalette } from "@/lib/extract/palette";
import type { StyleDump, NodeStyle, ColorChannel } from "@/lib/extract/styleDump";

const SLUGS = ["clean-light", "dark-mode", "adversarial-shell"] as const;
const SYNTHETIC_CASES = 300;
const SPEEDUP_REQUIRED = 0.5; // after ≤ 0.5 × before on the large flat shot
const NOISE_SLOWDOWN_ALLOWED = 1.5; // after ≤ 1.5 × before on the large noise shot

interface Snapshot {
  captures: Record<string, string>;
  synthetic: string[];
  bigPalette: string;
  bigMs: number;
  noisePalette: string;
  noiseMs: number;
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

/** Deterministic PRNG (mulberry32), so both runs see the same inputs. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Rgb = [number, number, number];
const css = ([r, g, b]: Rgb) => `rgb(${r}, ${g}, ${b})`;
const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

function node(color: Rgb, channel: ColorChannel, interactive: boolean, semantic: boolean): NodeStyle {
  return {
    tag: "div",
    rect: { x: 0, y: 0, w: 10, h: 10 },
    colors: [{ channel, value: css(color) }],
    hasText: channel === "text",
    interactive,
    ...(semantic ? { semanticContext: "alert" } : {}),
  } as NodeStyle;
}

async function pngFromRaw(raw: Buffer, width: number, height: number, channels: 3 | 4): Promise<string> {
  const buf = await sharp(raw, { raw: { width, height, channels } }).png().toBuffer();
  return buf.toString("base64");
}

async function png(pixels: Rgb[], width: number, height: number, alpha: boolean): Promise<string> {
  const channels = alpha ? 4 : 3;
  const raw = Buffer.alloc(width * height * channels);
  for (let i = 0; i < width * height; i++) {
    const p = pixels[i];
    raw[i * channels] = p[0];
    raw[i * channels + 1] = p[1];
    raw[i * channels + 2] = p[2];
    if (alpha) raw[i * channels + 3] = 255;
  }
  return pngFromRaw(raw, width, height, channels);
}

/**
 * One small synthetic page: 3-8 DOM colors and a screenshot of at most 500
 * pixels (never resized: it is narrower than the 640px sample width). With so
 * few pixels, one pixel credited differently moves a swatch's `areaWeight`
 * by at least 0.002, which survives the report's rounding to 3 decimals. The
 * pixels mix exact DOM colors, colors jittered around the Lab-15 match radius,
 * two repeated "far" colors (the image-sourced backstop) and pure noise.
 */
async function syntheticCase(seed: number): Promise<string> {
  const rand = prng(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const rgb = (): Rgb => [int(0, 255), int(0, 255), int(0, 255)];
  const grey = (): Rgb => {
    const v = int(0, 255);
    return [v, v, v];
  };

  const channelsFor: ColorChannel[] = ["background", "background", "text", "text", "border", "background", "text", "border"];
  const count = int(3, 8);
  const colors: Rgb[] = [];
  const nodes: NodeStyle[] = [];
  for (let k = 0; k < count; k++) {
    const color = rand() < 0.5 ? grey() : rgb();
    colors.push(color);
    const repeats = int(1, 4);
    for (let n = 0; n < repeats; n++) {
      nodes.push(node(color, channelsFor[k], rand() < 0.3, rand() < 0.2));
    }
  }
  const dump: StyleDump = { nodes, totalVisible: nodes.length, truncated: false };

  const width = int(16, 25);
  const height = int(10, 20);
  const far: Rgb[] = [rgb(), rgb()];
  const pixels: Rgb[] = [];
  for (let i = 0; i < width * height; i++) {
    const roll = rand();
    if (roll < 0.4) {
      pixels.push(colors[int(0, count - 1)]);
    } else if (roll < 0.65) {
      const base = colors[int(0, count - 1)];
      const spread = int(2, 28);
      pixels.push([
        clamp(base[0] + (rand() - 0.5) * spread),
        clamp(base[1] + (rand() - 0.5) * spread),
        clamp(base[2] + (rand() - 0.5) * spread),
      ]);
    } else if (roll < 0.85) {
      pixels.push(far[int(0, 1)]);
    } else {
      pixels.push(rgb());
    }
  }
  const shot = await png(pixels, width, height, seed % 3 === 0);
  return JSON.stringify(await extractPalette({ dump, screenshotPngBase64: shot }));
}

const BANDS: Rgb[] = [
  [255, 255, 255], [246, 248, 250], [17, 24, 39], [37, 99, 235],
  [229, 231, 235], [107, 114, 128], [220, 38, 127],
];

/** The DOM of the two large cases. The last band is not in it, so its pixels
 *  take the "far" path. */
function bandDump(): StyleDump {
  const nodes = [
    node(BANDS[0], "background", false, false),
    node(BANDS[1], "background", false, false),
    node(BANDS[2], "text", false, false),
    node(BANDS[3], "background", true, false),
    node(BANDS[4], "border", false, false),
    node(BANDS[5], "text", false, false),
  ];
  return { nodes, totalVisible: nodes.length, truncated: false };
}

async function timed(dump: StyleDump, shot: string): Promise<{ palette: string; ms: number }> {
  let best = Infinity;
  let palette = "";
  for (let run = 0; run < 3; run++) {
    const t0 = performance.now();
    palette = JSON.stringify(await extractPalette({ dump, screenshotPngBase64: shot }));
    best = Math.min(best, performance.now() - t0);
  }
  return { palette, ms: best };
}

/** A tall flat-color screenshot: 640 × 6000 = 3.84 M sampled pixels, about the
 *  size of a page at the 12-viewport panorama cap, holding 7 distinct colors. */
async function bigCase(): Promise<{ palette: string; ms: number }> {
  const width = 640;
  const height = 6000;
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    const band = BANDS[Math.floor((y / height) * BANDS.length)];
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      raw[i] = band[0];
      raw[i + 1] = band[1];
      raw[i + 2] = band[2];
    }
  }
  return timed(bandDump(), await pngFromRaw(raw, width, height, 3));
}

/** The worst case for a cache: 640 × 2400 = 1.536 M pixels of seeded noise, so
 *  nearly every pixel is a distinct RGB value (a photograph-heavy page). */
async function noiseCase(): Promise<{ palette: string; ms: number; distinct: number }> {
  const width = 640;
  const height = 2400;
  const rand = prng(178);
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i++) raw[i] = Math.floor(rand() * 256);
  const distinct = new Set<number>();
  for (let i = 0; i < raw.length; i += 3) distinct.add((raw[i] << 16) | (raw[i + 1] << 8) | raw[i + 2]);
  const result = await timed(bandDump(), await pngFromRaw(raw, width, height, 3));
  return { ...result, distinct: distinct.size };
}

async function collect(): Promise<Snapshot> {
  const captures: Record<string, string> = {};
  for (const slug of SLUGS) {
    const capture = JSON.parse(readFileSync(`eval/corpus/${slug}/capture.json`, "utf8")) as Capture;
    const { report, markdown } = await extractFromCapture(capture);
    // Every palette input a committed capture offers: the panorama (what the
    // report uses), the viewport shot alone, and the dark-scheme render.
    const viewportOnly = await extractPalette({ dump: capture.styleDump, screenshotPngBase64: capture.viewportShot });
    const dark = capture.darkCapture
      ? await extractPalette({ dump: capture.darkCapture.styleDump, screenshotPngBase64: capture.darkCapture.viewportShot })
      : null;
    captures[slug] = sha(JSON.stringify({ report, markdown, viewportOnly, dark }));

    // Informational: pixels, distinct RGB values, and the time of the palette lane.
    const shot = capture.panoramaShot ?? capture.viewportShot;
    const { data, info } = await sharp(Buffer.from(shot, "base64"))
      .resize({ width: 640, withoutEnlargement: true })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const distinct = new Set<number>();
    for (let i = 0; i < data.length; i += info.channels) {
      distinct.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
    }
    let best = Infinity;
    for (let run = 0; run < 5; run++) {
      const t0 = performance.now();
      await extractPalette({ dump: capture.styleDump, screenshotPngBase64: shot });
      best = Math.min(best, performance.now() - t0);
    }
    const imageSourced = report.palette.colors.filter((c) => c.imageSourced).length;
    console.log(
      `info ${slug}: ${info.width * info.height} pixels, ${distinct.size} distinct RGB values, ` +
        `${imageSourced} image-sourced swatch(es), extractPalette ${best.toFixed(1)} ms (best of 5)`,
    );
  }

  const synthetic: string[] = [];
  for (let seed = 1; seed <= SYNTHETIC_CASES; seed++) synthetic.push(await syntheticCase(seed));
  const withImageSourced = synthetic.filter((s) => s.includes('"imageSourced":true')).length;
  console.log(`info synthetic: ${synthetic.length} cases, ${withImageSourced} with an image-sourced swatch`);

  const big = await bigCase();
  console.log(`info large flat shot (3.84 M pixels): extractPalette ${big.ms.toFixed(1)} ms (best of 3)`);
  const noise = await noiseCase();
  console.log(
    `info large noise shot (1.536 M pixels, ${noise.distinct} distinct RGB values): ` +
      `extractPalette ${noise.ms.toFixed(1)} ms (best of 3)`,
  );
  return {
    captures,
    synthetic,
    bigPalette: big.palette,
    bigMs: big.ms,
    noisePalette: noise.palette,
    noiseMs: noise.ms,
  };
}

async function main() {
  const [mode, file] = process.argv.slice(2);
  if ((mode !== "snapshot" && mode !== "compare") || !file) {
    console.error("usage: area-pass-check.mts snapshot|compare <file>");
    process.exit(2);
  }
  const now = await collect();
  if (mode === "snapshot") {
    writeFileSync(file, JSON.stringify(now));
    console.log(`\nsnapshot written: ${file}`);
    return;
  }

  const before = JSON.parse(readFileSync(file, "utf8")) as Snapshot;
  let failed = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
  };
  for (const slug of SLUGS) {
    check(`${slug}: report, markdown, viewport-only and dark palettes identical`, now.captures[slug] === before.captures[slug]);
  }
  const differing = now.synthetic.flatMap((s, i) => (s === before.synthetic[i] ? [] : [i + 1]));
  check(
    `synthetic palettes identical (${now.synthetic.length} cases)`,
    differing.length === 0 && now.synthetic.length === before.synthetic.length,
    differing.length ? `${differing.length} differ, first seeds ${differing.slice(0, 5).join(", ")}` : "",
  );
  if (differing.length) {
    const i = differing[0] - 1;
    console.log(`     before: ${before.synthetic[i]}\n     after:  ${now.synthetic[i]}`);
  }
  check("large flat shot: palette identical", now.bigPalette === before.bigPalette);
  check(
    `large flat shot: at most ${SPEEDUP_REQUIRED} × the snapshot's time`,
    now.bigMs <= before.bigMs * SPEEDUP_REQUIRED,
    `${now.bigMs.toFixed(1)} ms now, ${before.bigMs.toFixed(1)} ms in the snapshot`,
  );
  check("large noise shot: palette identical", now.noisePalette === before.noisePalette);
  check(
    `large noise shot: at most ${NOISE_SLOWDOWN_ALLOWED} × the snapshot's time`,
    now.noiseMs <= before.noiseMs * NOISE_SLOWDOWN_ALLOWED,
    `${now.noiseMs.toFixed(1)} ms now, ${before.noiseMs.toFixed(1)} ms in the snapshot`,
  );
  if (failed > 0) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log("\nall checks ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
````

### 1. Snapshot on the unchanged code (Task 1)

From the project root, before `lib/extract/palette.ts` is edited:

```bash
npx tsx "$SCRATCH/area-pass-check.mts" snapshot "$SCRATCH/before.json"
```

Expected: five `info` lines and `snapshot written`, exit 0. On `main` the `info` lines read about 150-190 ms for each capture, about 1,900 ms for the large flat shot and about 1,000 ms for the large noise shot.

### 2. Compare after the change (Task 3; second acceptance criterion)

```bash
npx tsx "$SCRATCH/area-pass-check.mts" compare "$SCRATCH/before.json"
```

Expected: eight `ok` lines, `all checks ok`, exit 0. The identity lines cover, for each of the three committed captures, the whole report object, the Markdown, the palette from the viewport shot alone and the palette of the dark-scheme render; then the 300 synthetic palettes and the two large ones. Record the `info` timings of the three captures in the report next to those of step 1.

If the speed-up line fails with every identity line `ok`, run the command once more before reading it as a failure: the timings are the best of 3 on a machine that does other work. If the noise line fails, the ceiling of Task 2 is not in effect.

### 3. Show that the identity check can fail

An identity check that cannot fail proves nothing. Break the cache key on purpose: in `lib/extract/palette.ts`, change `(r << 16) | (g << 8) | b` to `(r << 16) | (g << 8)`, so pixels that differ only in blue share an entry. Run the command of step 2 again.

Expected: at least `FAIL synthetic palettes identical`, exit 1. Then restore the line, check that `git diff lib/extract/palette.ts` shows the diff of Task 2 again, and run step 2 once more: `all checks ok`.

### 4. Full gate (Task 4; third acceptance criterion)

```bash
rm -rf "$SCRATCH"
npm run check
git status --short
git diff --stat -- eval/
```

Expected: `npm run check` exits 0, and its eval part prints `combined 100%` for `clean-light`, `dark-mode` and `adversarial-shell`, `aggregate combined: 100%` and `✓ all gates passed`, the same as on `main`. `git status --short` lists `lib/extract/palette.ts` and the plan and report files only. `git diff --stat -- eval/` prints nothing: `eval/baseline.json` and `eval/corpus/*` are untouched.

## Acceptance Criteria

- [ ] All tasks completed
- [ ] The area pass takes each pixel's nearest canonical color from a per-call cache keyed by its RGB value, and computes Lab only on a miss (Task 2; the speed-up line of step 2)
- [ ] Area weights and image-sourced colors are identical to before for the three committed captures (the three capture lines of step 2), and for the 300 synthetic pages that exercise the image-sourced path
- [ ] The identity check fails on a deliberately wrong cache key (step 3)
- [ ] `npm run eval` prints the same scores, with `eval/baseline.json` and `eval/corpus/*` untouched (step 4)
- [ ] `npm run check` passes
- [ ] No scratch file is left in the repository
