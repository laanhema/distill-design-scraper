import {
  converter,
  differenceCiede2000,
  formatHex,
  parse,
  wcagContrast,
  type Color,
} from "culori";

/**
 * Every comparison happens in a perceptual space (Lab / OKLCH), never raw RGB:
 * "are these the same color" is a question RGB distance answers badly.
 */

const toLab = converter("lab");
const toOklch = converter("oklch");
const ciede2000 = differenceCiede2000();

export function parseColor(input: string): Color | undefined {
  return parse(input);
}

/** Canonical `#rrggbb` for a parsed color; alpha is dropped. */
export function hex(color: Color): string {
  return formatHex(color);
}

/** Perceptual distance (CIEDE2000). Each caller sets its own near-duplicate
 *  threshold (e.g. `MERGE_DELTA_E`). */
export function deltaE(a: Color, b: Color): number {
  return ciede2000(a, b);
}

/** OKLCH chroma, independent of lightness. Pure grey reads as 0. */
export function chroma(color: Color): number {
  const c = toOklch(color).c;
  return Number.isFinite(c) ? c : 0;
}


/** OKLCH hue in degrees [0, 360). Undefined (achromatic greys) reads as 0. */
export function hue(color: Color): number {
  const h = toOklch(color).h;
  return typeof h === "number" && Number.isFinite(h) ? h : 0;
}

/** WCAG contrast ratio (1–21) between two colors. Order-independent. */
export function contrastRatio(a: Color, b: Color): number {
  return wcagContrast(a, b);
}

export function wcagGrade(ratio: number): "AAA" | "AA" | "AA Large" | "fail" {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA Large";
  return "fail";
}

/** Near-neutral: almost no chroma — the greys, off-whites and near-blacks of a UI. */
export function isNeutral(color: Color, threshold = 0.045): boolean {
  return chroma(color) < threshold;
}

/** Lab coordinates as a plain triple, for the pixel-nearest-color pass. */
export function labTriple(color: Color): [number, number, number] {
  const { l, a, b } = toLab(color);
  return [l, a ?? 0, b ?? 0];
}

/** Cheap stand-in for CIEDE2000 in the hot per-pixel loop, which only needs
 *  the nearest color, not a calibrated ΔE. */
export function labDistanceSq(
  p: [number, number, number],
  q: [number, number, number],
): number {
  const dl = p[0] - q[0];
  const da = p[1] - q[1];
  const db = p[2] - q[2];
  return dl * dl + da * da + db * db;
}
