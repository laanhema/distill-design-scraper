import { deltaE, parseColor } from "@/lib/color";
import { z } from "zod";
import {
  colorRoleSchema,
  MOTION_KINDS,
  recipeElementSchema,
  STATE_KINDS,
  type Motion,
  type Palette,
  type States,
  type Typography,
} from "@/lib/schema";
import { expectedStructureSpecSchema } from "./scoreStructure";

/**
 * Scoring for the measured lane. Objective diffs against `expected.yaml`:
 * palette by *perceptual distance* (ΔE, never exact hex), roles by whether the
 * right role landed on the right color, type scale by size-bucket overlap.
 */

/** ΔE under which an extracted color counts as matching the expected one. */
const PALETTE_DELTA_E_TOLERANCE = 12;

/** A state's from/to colors are read verbatim from the CSSOM, and a hover
 *  shade sits only ΔE ~6 from its base, so the palette tolerance would let a
 *  wrong value through. This one absorbs rounding only. */
const STATE_DELTA_E_TOLERANCE = 2;

/** One expected hover/focus change, flattened from a report `StateEntry`. */
const expectedStateSchema = z.strictObject({
  target: colorRoleSchema,
  state: z.enum(STATE_KINDS),
  property: z.string(),
  from: z.string(),
  to: z.string(),
});
export type ExpectedState = z.infer<typeof expectedStateSchema>;

const expectedMotionSchema = z.strictObject({
  target: recipeElementSchema,
  kind: z.enum(MOTION_KINDS),
  property: z.string(),
  durationMs: z.number(),
  timingFunction: z.string(),
  delayMs: z.number().optional(),
  iterationCount: z.string().optional(),
});
export type ExpectedMotion = z.infer<typeof expectedMotionSchema>;

/** The shape of a hand-written `expected.yaml`. Strict at every level: an
 *  unknown (e.g. misspelt) key would otherwise drop that part of the spec,
 *  and the scorers count a missing part as a full score. */
export const expectedSpecSchema = z.strictObject({
  name: z.string(),
  bucket: z.string(),
  palette: z.record(z.string(), z.string()),
  /** The `prefers-color-scheme: dark` palette, by role, as `palette`. */
  paletteDark: z.record(z.string(), z.string()).optional(),
  typography: z
    .strictObject({
      bodyFamily: z.string().optional(),
      scale: z.record(z.string(), z.number()).optional(),
    })
    .optional(),
  /** Optional structure spec — when present, the structure lane
   *  is scored against it and folded into `combinedScore`. */
  structure: expectedStructureSpecSchema.optional(),
  /** `min(1)`: an empty list would score a full mark while asserting nothing. */
  states: z.array(expectedStateSchema).min(1).optional(),
  motion: z.array(expectedMotionSchema).min(1).optional(),
});
export type ExpectedSpec = z.infer<typeof expectedSpecSchema>;

export interface PaletteScore {
  matched: number;
  total: number;
  /** Fraction of expected roles whose extracted color is right *and* close. */
  roleAccuracy: number;
  /** Mean ΔE over the matched roles (lower is better). */
  avgDeltaE: number;
  misses: { role: string; expected: string; got: string | null; deltaE: number | null }[];
}

/** `palette` is `undefined` when the report has none (no `paletteDark`):
 *  every expected role then misses. */
export function scorePalette(
  palette: Palette | undefined,
  expected: Record<string, string>,
): PaletteScore {
  // Keyed by plain strings, so a role name read from `expected.yaml` looks
  // itself up without a cast. A swatch without a role is left out.
  const byRole = new Map<string, string>();
  for (const c of palette?.colors ?? []) {
    if (c.role !== undefined) byRole.set(c.role, c.hex);
  }
  const roles = Object.keys(expected);
  let matched = 0;
  let deltaSum = 0;
  const misses: PaletteScore["misses"] = [];

  for (const role of roles) {
    const expHex = expected[role];
    const gotHex = byRole.get(role) ?? null;
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

  const gotByToken = new Map<string, number>(
    (typography?.scale ?? []).map((s) => [s.token, s.sizePx]),
  );
  const tokens = Object.keys(expected.scale);
  let matched = 0;
  const misses: TypographyScore["misses"] = [];

  for (const token of tokens) {
    const exp = expected.scale[token];
    const got = gotByToken.get(token) ?? null;
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

/** Shared result of the list-shaped lanes (`states`, `motion`). */
export interface LaneScore {
  matched: number;
  total: number;
  accuracy: number;
  misses: string[];
}

function laneScore(total: number, misses: string[]): LaneScore {
  const matched = total - misses.length;
  return { matched, total, accuracy: total ? matched / total : 1, misses };
}

const normalizeCss = (v: string) => v.trim().replace(/\s+/g, " ").toLowerCase();

/** Colors by ΔE, any other value (a `box-shadow`) as normalized CSS text. */
function stateValueMatches(expected: string, got: string): boolean {
  const a = parseColor(expected);
  const b = parseColor(got);
  if (a && b) return deltaE(a, b) <= STATE_DELTA_E_TOLERANCE;
  return normalizeCss(expected) === normalizeCss(got);
}

export function scoreStates(
  states: States | undefined,
  expected: ExpectedState[],
): LaneScore {
  const misses: string[] = [];
  for (const want of expected) {
    const label = `${want.target} ${want.state} ${want.property}`;
    const got = states?.entries
      .find((e) => e.target === want.target && e.state === want.state)
      ?.changes.find((c) => c.property === want.property);
    if (!got) {
      misses.push(`${label}: expected ${want.from} → ${want.to}, got —`);
    } else if (!stateValueMatches(want.from, got.from) || !stateValueMatches(want.to, got.to)) {
      misses.push(`${label}: expected ${want.from} → ${want.to}, got ${got.from} → ${got.to}`);
    }
  }
  return laneScore(expected.length, misses);
}

export function scoreMotion(
  motion: Motion | undefined,
  expected: ExpectedMotion[],
): LaneScore {
  const misses: string[] = [];
  const fmt = (m: { durationMs: number; timingFunction: string; delayMs?: number; iterationCount?: string }) =>
    `${m.durationMs}ms ${m.timingFunction}` +
    (m.delayMs ? ` delay ${m.delayMs}ms` : "") +
    (m.iterationCount ? ` ×${m.iterationCount}` : "");
  for (const want of expected) {
    const label = `${want.target} ${want.kind} ${want.property}`;
    const got = motion?.entries.find(
      (e) => e.target === want.target && e.kind === want.kind && e.property === want.property,
    );
    if (!got) {
      misses.push(`${label}: expected ${fmt(want)}, got —`);
      continue;
    }
    const ok =
      got.durationMs === want.durationMs &&
      normalizeCss(got.timingFunction) === normalizeCss(want.timingFunction) &&
      (got.delayMs ?? 0) === (want.delayMs ?? 0) &&
      (want.iterationCount === undefined || got.iterationCount === want.iterationCount);
    if (!ok) misses.push(`${label}: expected ${fmt(want)}, got ${fmt(got)}`);
  }
  return laneScore(expected.length, misses);
}

/** Each scored `states` / `motion` / `paletteDark` lane takes this share of
 *  the combined score, and the base weighting below keeps the rest, so a
 *  spec without those lanes keeps its score. A wiped lane drops the site by
 *  0.1, well past `REGRESSION_EPS`. */
const EXTRA_LANE_WEIGHT = 0.1;

/** Palette 0.5 / typography 0.3 / structure 0.2, so a full structure collapse
 *  drops combined by 0.2, well past `REGRESSION_EPS`; without a structure
 *  score, palette 0.6 / typography 0.4. `extraLanes` holds the accuracy of
 *  each scored `states` / `motion` / `paletteDark` lane. */
export function combinedScore(
  palette: PaletteScore,
  typography: TypographyScore | null,
  structure?: number | null,
  extraLanes: readonly number[] = [],
): number {
  const base = baseScore(palette, typography, structure);
  const extraWeight = EXTRA_LANE_WEIGHT * extraLanes.length;
  return (
    base * (1 - extraWeight) +
    extraLanes.reduce((sum, accuracy) => sum + accuracy * EXTRA_LANE_WEIGHT, 0)
  );
}

function baseScore(
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
