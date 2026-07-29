import { deltaE, parseColor } from "@/lib/color";
import type { Palette, Typography } from "@/lib/schema";
import type { ExpectedStructureSpec } from "./scoreStructure";

/**
 * Scoring for the measured lane (§10). Objective diffs against `expected.yaml`:
 * palette by *perceptual distance* (ΔE, never exact hex), roles by whether the
 * right role landed on the right color, type scale by size-bucket overlap.
 */

/** ΔE under which an extracted color counts as matching the expected one. */
const PALETTE_DELTA_E_TOLERANCE = 12;

export interface ExpectedSpec {
  name: string;
  bucket: string;
  palette: Record<string, string>;
  typography?: {
    bodyFamily?: string;
    scale?: Record<string, number>;
  };
  /** Optional structure spec (DIST-013) — when present, the structure lane
   *  is scored against it and folded into `combinedScore`. */
  structure?: ExpectedStructureSpec;
}

export interface PaletteScore {
  matched: number;
  total: number;
  /** Fraction of expected roles whose extracted color is right *and* close. */
  roleAccuracy: number;
  /** Mean ΔE over the matched roles (lower is better). */
  avgDeltaE: number;
  misses: { role: string; expected: string; got: string | null; deltaE: number | null }[];
}

export function scorePalette(
  palette: Palette,
  expected: Record<string, string>,
): PaletteScore {
  const byRole = new Map(palette.colors.map((c) => [c.role, c.hex]));
  const roles = Object.keys(expected);
  let matched = 0;
  let deltaSum = 0;
  const misses: PaletteScore["misses"] = [];

  for (const role of roles) {
    const expHex = expected[role];
    const gotHex = byRole.get(role as never) ?? null;
    const a = parseColor(expHex);
    const b = gotHex ? parseColor(gotHex) : undefined;
    const d = a && b ? deltaE(a, b) : null;

    if (d !== null && d <= PALETTE_DELTA_E_TOLERANCE) {
      matched++;
      deltaSum += d;
    } else {
      misses.push({ role, expected: expHex, got: gotHex, deltaE: d });
    }
  }

  return {
    matched,
    total: roles.length,
    roleAccuracy: roles.length ? matched / roles.length : 1,
    avgDeltaE: matched ? deltaSum / matched : 0,
    misses,
  };
}

export interface TypographyScore {
  matched: number;
  total: number;
  scaleAccuracy: number;
  bodyFamilyOk: boolean | null;
  misses: { token: string; expected: number; got: number | null }[];
}

/** Size match tolerance: within 2px or 10%, whichever is larger. */
function sizeMatches(expected: number, got: number): boolean {
  return Math.abs(expected - got) <= Math.max(2, expected * 0.1);
}

export function scoreTypography(
  typography: Typography | undefined,
  expected: ExpectedSpec["typography"],
): TypographyScore | null {
  if (!expected?.scale) return null;

  const gotByToken = new Map(
    (typography?.scale ?? []).map((s) => [s.token, s.sizePx]),
  );
  const tokens = Object.keys(expected.scale);
  let matched = 0;
  const misses: TypographyScore["misses"] = [];

  for (const token of tokens) {
    const exp = expected.scale[token];
    const got = gotByToken.get(token as never) ?? null;
    if (got !== null && sizeMatches(exp, got)) {
      matched++;
    } else {
      misses.push({ token, expected: exp, got });
    }
  }

  let bodyFamilyOk: boolean | null = null;
  if (expected.bodyFamily) {
    const bodyFam = typography?.families.find((f) => f.role === "body")?.name ?? "";
    bodyFamilyOk =
      bodyFam.toLowerCase() === expected.bodyFamily.toLowerCase();
  }

  return {
    matched,
    total: tokens.length,
    scaleAccuracy: tokens.length ? matched / tokens.length : 1,
    bodyFamilyOk,
    misses,
  };
}

/** Combined per-site score: role accuracy weighted above type-scale overlap.
 *  When a structure score is provided (DIST-013), it is folded in with
 *  palette 0.5 / typography 0.3 / structure 0.2 — palette stays dominant
 *  while a full structure collapse (`0.0`) drops combined by 0.2, well
 *  past `REGRESSION_EPS`. Without structure, keeps the historical
 *  palette 0.6 / typography 0.4 weighting. */
export function combinedScore(
  palette: PaletteScore,
  typography: TypographyScore | null,
  structure?: number | null,
): number {
  if (structure !== undefined && structure !== null) {
    const pal = palette.roleAccuracy;
    const typo = typography ? typography.scaleAccuracy : pal;
    return pal * 0.5 + typo * 0.3 + structure * 0.2;
  }
  if (!typography) return palette.roleAccuracy;
  return palette.roleAccuracy * 0.6 + typography.scaleAccuracy * 0.4;
}
