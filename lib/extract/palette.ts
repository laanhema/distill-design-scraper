import sharp from "sharp";
import type { Color } from "culori";
import {
  chroma,
  contrastRatio,
  deltaE,
  hex,
  hue,
  isNeutral,
  labDistanceSq,
  labTriple,
  parseColor,
  wcagGrade,
} from "@/lib/color";
import type { ColorChannel, StyleDump } from "@/lib/extract/styleDump";
import type {
  ContrastPair,
  Palette,
  Swatch,
  ColorRole,
} from "@/lib/schema";
import { COLOR_ROLES } from "@/lib/schema";

/**
 * Palette extraction — the staged, channel-aware, score-based pipeline (§5).
 *
 *   A  Collect & attribute   colors tagged with the channel they came from
 *   B  Merge near-duplicates  ΔE ≈ 2.5 → canonical colors ("247 greys" → few)
 *   —  Area weight            credit screenshot pixels to canonical colors
 *   C  Score per role         every (color, role) pair scored, not first-wins
 *   D  Resolve with guardrails assign in dependency order under hard constraints
 *
 * Stage E (AI relabelling) is Phase 2 and never runs here — Phase 1 is the
 * measured lane only. All color math is perceptual (Lab / OKLCH), never RGB.
 */

// Stage B near-duplicate threshold. Kept low (near the just-noticeable ΔE)
// because real design systems place `background` and `surface` only 2–4 ΔE
// apart on purpose — a looser merge collapses that pair and loses `surface`.
// DOM colors are exact strings, so genuine duplicates sit at ΔE≈0 anyway.
const MERGE_DELTA_E = 1.5;
const PIXEL_MATCH_LAB = 15; // Lab distance under which a pixel "is" a color.
const PIXEL_MATCH_LAB_SQ = PIXEL_MATCH_LAB * PIXEL_MATCH_LAB;
const PIXEL_SAMPLE_WIDTH = 640; // Downscale screenshot for the area pass.
const IMAGE_COLOR_MIN_SHARE = 0.02; // Min pixel share to surface a CSS-missed color.
const MIN_TEXT_CONTRAST = 4.5; // WCAG AA; hard guardrail for the `text` role.
// Below this pixel share a swatch is effectively never painted on screen.
// Scoped to `border` (a role about visible stroked lines, unlike e.g. a
// small-but-important `primary` button) so a CSS-declared-but-invisible
// border color doesn't get reported as a design token.
const AREA_DROP_THRESHOLD = 0.005;

interface Canonical {
  color: Color;
  hex: string;
  lab: [number, number, number];
  /** Observation counts per channel across the DOM walk. */
  channels: Record<ColorChannel, number>;
  /** Total DOM observations (sum over channels). */
  total: number;
  /** Observations that occurred on interactive/CTA elements. */
  interactive: number;
  /** Share of painted screenshot pixels credited to this color (0–1). */
  areaWeight: number;
  /** True when recovered from pixels but absent from the DOM (gradient/image). */
  imageSourced: boolean;
  /** Observations on nodes flagged `alert`/`status`/`aria-invalid` — the
   *  usage-context evidence semantic (success/warning/danger) roles require
   *  (§P5-1), never assigned from hue alone. */
  semanticContext: number;
}

function emptyChannels(): Record<ColorChannel, number> {
  return { background: 0, text: 0, border: 0, fill: 0, stroke: 0 };
}

// ── Stage A + B: collect, attribute, and merge into canonical colors ─────────

function collectCanonical(dump: StyleDump): Canonical[] {
  const canon: Canonical[] = [];

  const addObservation = (
    color: Color,
    channel: ColorChannel,
    interactive: boolean,
    semanticContext: boolean,
  ) => {
    // Merge into an existing canonical color if perceptually near-identical.
    for (const c of canon) {
      if (deltaE(c.color, color) <= MERGE_DELTA_E) {
        c.channels[channel]++;
        c.total++;
        if (interactive) c.interactive++;
        if (semanticContext) c.semanticContext++;
        return;
      }
    }
    const channels = emptyChannels();
    channels[channel] = 1;
    canon.push({
      color,
      hex: hex(color),
      lab: labTriple(color),
      channels,
      total: 1,
      interactive: interactive ? 1 : 0,
      areaWeight: 0,
      imageSourced: false,
      semanticContext: semanticContext ? 1 : 0,
    });
  };

  for (const node of dump.nodes) {
    for (const obs of node.colors) {
      const parsed = parseColor(obs.value);
      if (!parsed) continue;
      addObservation(parsed, obs.channel, node.interactive, Boolean(node.semanticContext));
    }
  }

  return canon;
}

// ── Area weight: credit screenshot pixels to the canonical set (§5) ──────────

async function assignAreaWeights(
  canon: Canonical[],
  screenshotPngBase64: string,
): Promise<void> {
  if (canon.length === 0) return;

  const buf = Buffer.from(screenshotPngBase64, "base64");
  const { data, info } = await sharp(buf)
    .resize({ width: PIXEL_SAMPLE_WIDTH, withoutEnlargement: true })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const step = info.channels; // 3 (RGB) or 4 (RGBA)
  const totalPixels = info.width * info.height;
  const credited = new Array<number>(canon.length).fill(0);

  // Coarse histogram of pixels that match no DOM color — the gradient/image
  // backstop. Keyed by 4-bit-per-channel bucket to keep it tiny.
  const farBuckets = new Map<number, { count: number; r: number; g: number; b: number }>();
  let farCount = 0;

  for (let i = 0; i < data.length; i += step) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lab = labTriple({ mode: "rgb", r: r / 255, g: g / 255, b: b / 255 });

    let best = -1;
    let bestDist = Infinity;
    for (let k = 0; k < canon.length; k++) {
      const d = labDistanceSq(lab, canon[k].lab);
      if (d < bestDist) {
        bestDist = d;
        best = k;
      }
    }

    if (best >= 0 && bestDist <= PIXEL_MATCH_LAB_SQ) {
      credited[best]++;
    } else {
      farCount++;
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const bucket = farBuckets.get(key);
      if (bucket) {
        bucket.count++;
      } else {
        farBuckets.set(key, { count: 1, r, g, b });
      }
    }
  }

  for (let k = 0; k < canon.length; k++) {
    canon[k].areaWeight = credited[k] / totalPixels;
  }

  // Surface significant colors CSS missed (hero gradients, image tints) as
  // image-sourced canonical colors, so they can still win e.g. `background`.
  if (farCount / totalPixels > IMAGE_COLOR_MIN_SHARE) {
    const sorted = [...farBuckets.values()].sort((a, b) => b.count - a.count);
    for (const bucket of sorted) {
      const share = bucket.count / totalPixels;
      if (share < IMAGE_COLOR_MIN_SHARE) break;
      const color: Color = {
        mode: "rgb",
        r: bucket.r / 255,
        g: bucket.g / 255,
        b: bucket.b / 255,
      };
      // Don't duplicate a color we already have under the merge threshold.
      if (canon.some((c) => deltaE(c.color, color) <= MERGE_DELTA_E)) continue;
      canon.push({
        color,
        hex: hex(color),
        lab: labTriple(color),
        channels: emptyChannels(),
        total: 0,
        interactive: 0,
        areaWeight: share,
        imageSourced: true,
        semanticContext: 0,
      });
    }
  }
}

// ── Stage C: score each canonical color for each role ────────────────────────

function backgroundScore(c: Canonical): number {
  const eligible = c.channels.background > 0 || c.imageSourced;
  if (!eligible) return 0;
  // Area dominates; a near-neutral prior nudges above brand-colored heroes but
  // never disqualifies them (dark-mode sites have colored backgrounds too).
  return c.areaWeight * (isNeutral(c.color) ? 1 : 0.6);
}

function textScore(c: Canonical, background: Canonical | null): number {
  if (c.channels.text === 0) return 0;
  const freq = c.channels.text / Math.max(1, c.total);
  const contrast = background
    ? contrastRatio(c.color, background.color)
    : 1;
  const contrastNorm = Math.min(contrast / 21, 1);
  // Weighted so a well-contrasting, text-dominant color wins; low contrast is
  // heavily penalised (a guardrail also enforces the AA floor in Stage D).
  return freq * 0.4 + contrastNorm * 0.6 + Math.log1p(c.channels.text) * 0.05;
}

function brandScore(c: Canonical): number {
  if (isNeutral(c.color)) return 0;
  const recurrence = Math.log1p(c.total);
  const interactiveBoost = c.interactive > 0 ? 2 : 1;
  return chroma(c.color) * recurrence * interactiveBoost;
}

function borderScore(c: Canonical): number {
  if (c.channels.border === 0) return 0;
  const freq = c.channels.border / Math.max(1, c.total);
  // Borders are low-chroma, low-area, border-channel-dominant.
  return freq * (isNeutral(c.color) ? 1 : 0.5);
}

function mutedScore(c: Canonical): number {
  // Near-neutral, present but not dominant — secondary text / dividers / chips.
  if (!isNeutral(c.color)) return 0;
  const areaPenalty = c.areaWeight > 0.25 ? 0.2 : 1; // not a big surface
  return Math.log1p(c.total) * areaPenalty;
}

/** True when hue `h` falls within `[lo, hi]`, wrapping past 360°. */
function inHueBand(h: number, lo: number, hi: number): boolean {
  return lo <= hi ? h >= lo && h <= hi : h >= lo || h <= hi;
}

// Semantic (success/warning/danger) hue bands, in OKLCH degrees — sampled from
// sRGB primaries (red ≈29°, orange/yellow ≈50-90°, green ≈100-170°).
const SEMANTIC_HUE_BANDS: Record<"success" | "warning" | "danger", [number, number]> = {
  danger: [345, 40],
  warning: [40, 95],
  success: [95, 170],
};

/** Requires *both* a matching hue band and real usage-context evidence
 *  (an `alert`/`status`/`aria-invalid` node) — a red brand color with no such
 *  evidence never becomes `danger` (§P5-1). */
function semanticScore(c: Canonical, band: [number, number]): number {
  if (c.semanticContext === 0) return 0;
  if (isNeutral(c.color)) return 0;
  if (!inHueBand(hue(c.color), band[0], band[1])) return 0;
  return c.semanticContext * chroma(c.color);
}

// ── Stage D: resolve conflicts by best score, with guardrails ────────────────

function assignRoles(canon: Canonical[]): Map<ColorRole, Canonical> {
  const assigned = new Map<ColorRole, Canonical>();
  const taken = new Set<Canonical>();
  // "Perceptually distinct" for the surface guardrail shares the merge
  // threshold: if two colors survived Stage B unmerged, they differ enough to
  // be separate roles. A larger gate here would wrongly drop legitimately
  // subtle surfaces (e.g. #0d1117 vs #161b22, ΔE≈3).
  const distinct = (c: Canonical, other: Canonical | null) =>
    !other || deltaE(c.color, other.color) > MERGE_DELTA_E;

  const pick = (
    role: ColorRole,
    score: (c: Canonical) => number,
    ok: (c: Canonical) => boolean = () => true,
  ): Canonical | null => {
    let best: Canonical | null = null;
    let bestScore = 0;
    for (const c of canon) {
      if (taken.has(c)) continue;
      if (!ok(c)) continue;
      const s = score(c);
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
    if (best) {
      assigned.set(role, best);
      taken.add(best);
    }
    return best;
  };

  // Order matters for guardrails: background anchors text/surface contrast.
  const background = pick("background", backgroundScore);

  // Semantic roles claim their color *before* the generic surface/primary/
  // accent scorers run: `semanticScore` only fires on real alert/invalid
  // usage-context evidence, so a color that clears it is authoritatively
  // success/warning/danger and must not be swallowed by a broader role first
  // just because nothing else was competing for it (§P5-1).
  pick("danger", (c) => semanticScore(c, SEMANTIC_HUE_BANDS.danger));
  pick("warning", (c) => semanticScore(c, SEMANTIC_HUE_BANDS.warning));
  pick("success", (c) => semanticScore(c, SEMANTIC_HUE_BANDS.success));

  pick(
    "surface",
    backgroundScore,
    (c) => distinct(c, background), // surface must be perceptually distinct
  );

  pick(
    "text",
    (c) => textScore(c, background),
    (c) =>
      !background ||
      contrastRatio(c.color, background.color) >= MIN_TEXT_CONTRAST,
  );
  // Guardrail fallback: if nothing cleared AA, take the highest-contrast text
  // candidate regardless, so we still report *something* honest.
  if (!assigned.has("text") && background) {
    pick("text", (c) =>
      c.channels.text > 0 ? contrastRatio(c.color, background.color) : 0,
    );
  }

  const primary = pick("primary", brandScore);
  pick("accent", brandScore, (c) => distinct(c, primary));

  pick("border", borderScore);
  pick("muted", mutedScore);

  return assigned;
}

// ── Assemble the Palette token ───────────────────────────────────────────────

export const ROLE_USAGE: Record<ColorRole, string> = {
  background: "page background",
  surface: "cards, raised panels",
  text: "body text",
  primary: "primary actions, links",
  accent: "secondary emphasis",
  muted: "secondary text, dividers",
  border: "borders, separators",
  "on-primary": "text/icons on primary buttons",
  success: "positive/confirmation state",
  warning: "caution/warning state",
  danger: "error/destructive state",
};

function makeContrastPair(a: string, b: string, colorA: Color, colorB: Color): ContrastPair {
  const ratio = contrastRatio(colorA, colorB);
  return {
    pair: [a, b],
    ratio: Math.round(ratio * 10) / 10,
    wcag: wcagGrade(ratio),
  };
}

function buildContrast(
  assigned: Map<ColorRole, Canonical>,
  onPrimary: { color: Color } | null,
): ContrastPair[] {
  const pairs: ContrastPair[] = [];

  const bg = assigned.get("background");
  if (bg) {
    for (const role of ["text", "primary"] as const) {
      const c = assigned.get(role);
      if (c) pairs.push(makeContrastPair(role, "background", c.color, bg.color));
    }
  }

  // The two pairings a rebuild needs most: what goes on a card, and what goes
  // on a primary button (§P8-2) — `text on background` alone doesn't answer
  // either.
  const surface = assigned.get("surface");
  if (surface) {
    for (const role of ["text", "muted"] as const) {
      const c = assigned.get(role);
      if (c) pairs.push(makeContrastPair(role, "surface", c.color, surface.color));
    }
  }

  const primary = assigned.get("primary");
  if (primary && onPrimary) {
    pairs.push(makeContrastPair("on-primary", "primary", onPrimary.color, primary.color));
  }

  return pairs;
}

/** Modal text color measured directly on primary-background elements — i.e.
 *  nodes whose own computed background is (perceptually) the primary color
 *  *and* whose own computed text color was observed (a direct text child).
 *  Wrapped button labels (text on a child <span>) won't show up here; that's
 *  a miss, not a wrong answer — the inferred fallback covers it (§P8-2). */
function findMeasuredOnPrimary(dump: StyleDump, primaryColor: Color): Color | null {
  const counts = new Map<string, { count: number; color: Color }>();
  for (const node of dump.nodes) {
    const bg = node.colors.find((c) => c.channel === "background");
    const text = node.colors.find((c) => c.channel === "text");
    if (!bg || !text) continue;
    const bgParsed = parseColor(bg.value);
    if (!bgParsed || deltaE(bgParsed, primaryColor) > MERGE_DELTA_E) continue;
    const textParsed = parseColor(text.value);
    if (!textParsed) continue;
    const key = hex(textParsed);
    const entry = counts.get(key);
    if (entry) entry.count++;
    else counts.set(key, { count: 1, color: textParsed });
  }
  let best: Color | null = null;
  let bestCount = 0;
  for (const { count, color } of counts.values()) {
    if (count > bestCount) {
      bestCount = count;
      best = color;
    }
  }
  return best;
}

/** Black or white, whichever contrasts more with `against` — the last-resort,
 *  honestly-labeled fallback when no real on-primary text was observed. */
function contrastFallback(against: Color): Color {
  const white: Color = { mode: "rgb", r: 1, g: 1, b: 1 };
  const black: Color = { mode: "rgb", r: 0, g: 0, b: 0 };
  return contrastRatio(white, against) >= contrastRatio(black, against) ? white : black;
}

export interface PaletteInput {
  dump: StyleDump;
  /** Base64 PNG of the viewport screenshot, for the area-weight pixel pass. */
  screenshotPngBase64: string;
}

export async function extractPalette({
  dump,
  screenshotPngBase64,
}: PaletteInput): Promise<Palette> {
  const canon = collectCanonical(dump);
  await assignAreaWeights(canon, screenshotPngBase64);

  const assigned = assignRoles(canon);

  const colors: Swatch[] = [];
  for (const role of COLOR_ROLES) {
    const c = assigned.get(role);
    if (!c) continue;
    if (role === "border" && c.areaWeight < AREA_DROP_THRESHOLD) continue;
    colors.push({
      name: role,
      hex: c.hex,
      role,
      usage: ROLE_USAGE[role],
      areaWeight: Math.round(c.areaWeight * 1000) / 1000,
      ...(c.imageSourced ? { imageSourced: true } : {}),
    });
  }

  // On-primary (§P8-2): measured when a real button's text color is directly
  // observable, else honestly stamped `inferred` — never silently guessed.
  const primary = assigned.get("primary");
  let onPrimary: { color: Color } | null = null;
  if (primary) {
    const measured = findMeasuredOnPrimary(dump, primary.color);
    const isInferred = measured === null;
    const color = measured ?? contrastFallback(primary.color);
    onPrimary = { color };
    const onPrimaryHex = hex(color);
    const matchingCanon = canon.find((c) => deltaE(c.color, color) <= MERGE_DELTA_E);
    colors.push({
      name: "on-primary",
      hex: onPrimaryHex,
      role: "on-primary",
      usage: ROLE_USAGE["on-primary"],
      areaWeight: matchingCanon ? Math.round(matchingCanon.areaWeight * 1000) / 1000 : 0,
      ...(isInferred ? { provenance: "inferred" as const } : {}),
    });
  }

  return {
    provenance: "measured",
    colors,
    contrast: buildContrast(assigned, onPrimary),
  };
}
