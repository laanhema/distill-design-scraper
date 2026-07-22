import {
  converter,
  differenceCiede2000,
  formatHex,
  parse,
  wcagContrast,
  type Color,
} from "culori";

/**
 * Color math for the extraction engine (§5). Every comparison happens in a
 * perceptual space (Lab / OKLCH) via culori — never raw RGB — because "are
 * these two colors the same" and "which of these is more colorful" are
 * perceptual questions that RGB distance answers badly.
 */

const toLab = converter("lab");
const toOklch = converter("oklch");
const ciede2000 = differenceCiede2000();

/** Parse any CSS color string (`rgb(...)`, `rgba(...)`, hex, named). */
export function parseColor(input: string): Color | undefined {
  return parse(input);
}

/** Canonical `#rrggbb` for a parsed color; alpha is dropped. */
export function hex(color: Color): string {
  return formatHex(color);
}

/** Perceptual distance (CIEDE2000). ΔE ≈ 2–3 is "near-duplicate" (§5 Stage B). */
export function deltaE(a: Color, b: Color): number {
  return ciede2000(a, b);
}

/**
 * Chroma in OKLCH — how colorful a color is, independent of lightness. Used to
 * separate near-neutral UI (backgrounds, text, borders) from brand colors
 * (primary / accent). Undefined chroma (pure grey) reads as 0.
 */
export function chroma(color: Color): number {
  const c = toOklch(color).c;
  return Number.isFinite(c) ? c : 0;
}

/** OKLCH lightness, 0 (black) → 1 (white). */
export function lightness(color: Color): number {
  const l = toOklch(color).l;
  return Number.isFinite(l) ? l : 0;
}

/** OKLCH hue in degrees [0, 360). Undefined (achromatic greys) reads as 0. */
export function hue(color: Color): number {
  const h = toOklch(color).h;
  return Number.isFinite(h) ? (h as number) : 0;
}

/** WCAG contrast ratio (1–21) between two colors. Order-independent. */
export function contrastRatio(a: Color, b: Color): number {
  return wcagContrast(a, b);
}

/** Map a contrast ratio to its WCAG normal-text grade. */
export function wcagGrade(ratio: number): "AAA" | "AA" | "AA Large" | "fail" {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA Large";
  return "fail";
}

/**
 * A color is "near-neutral" when it carries almost no chroma — the greys,
 * off-whites and near-blacks that make up most of a UI's surface area.
 */
export function isNeutral(color: Color, threshold = 0.045): boolean {
  return chroma(color) < threshold;
}

/** Lab coordinates as a plain triple, for the pixel-nearest-color pass (§5). */
export function labTriple(color: Color): [number, number, number] {
  const { l, a, b } = toLab(color);
  return [l, a ?? 0, b ?? 0];
}

/**
 * Squared Euclidean distance in Lab between two triples. Cheap stand-in for a
 * full CIEDE2000 in the hot per-pixel loop, where we compare one pixel against
 * a handful of canonical colors and only need the nearest, not a calibrated ΔE.
 */
export function labDistanceSq(
  p: [number, number, number],
  q: [number, number, number],
): number {
  const dl = p[0] - q[0];
  const da = p[1] - q[1];
  const db = p[2] - q[2];
  return dl * dl + da * da + db * db;
}
