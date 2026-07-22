import { ELEVATION_LEVELS } from "@/lib/schema";
import type { Elevation, ElevationShadow, Radius, Spacing } from "@/lib/schema";
import type { StyleDump } from "@/lib/extract/styleDump";

/** Most frequent value in a list (ties keep the first-seen value). */
function mode<T>(values: T[]): T {
  const counts = new Map<T, number>();
  let best = values[0];
  let bestN = 0;
  for (const v of values) {
    const n = (counts.get(v) ?? 0) + 1;
    counts.set(v, n);
    if (n > bestN) {
      bestN = n;
      best = v;
    }
  }
  return best;
}

/** Combined offset+blur+spread magnitude, used to rank shadows by depth. */
function shadowMagnitude(raw: string): number {
  const matches = raw.match(/-?\d+(?:\.\d+)?px/g) ?? [];
  return matches.reduce((sum, m) => sum + Math.abs(parseFloat(m)), 0);
}

/**
 * Phase 4: Spacing, Radius, and Elevation deterministic extraction (§5).
 */

export interface ExtractedTokens {
  spacing: Spacing;
  radius: Radius;
  elevation: Elevation;
}

export function extractTokens(dump: StyleDump): ExtractedTokens {
  return {
    spacing: extractSpacing(dump),
    radius: extractRadius(dump),
    elevation: extractElevation(dump),
  };
}

export function extractSpacing(dump: StyleDump): Spacing {
  const counts = new Map<number, number>();

  for (const node of dump.nodes) {
    if (!node.layout) continue;
    const { marginsPx, paddingsPx, gapsPx } = node.layout;
    const values = [...marginsPx, ...paddingsPx, ...gapsPx];

    for (const v of values) {
      if (v > 0 && v <= 256) {
        const rounded = Math.round(v);
        counts.set(rounded, (counts.get(rounded) ?? 0) + 1);
      }
    }
  }

  // Find candidate base unit (4 or 8)
  let div8Count = 0;
  let div4Count = 0;

  for (const [val, freq] of counts.entries()) {
    if (val % 8 === 0) div8Count += freq;
    if (val % 4 === 0) div4Count += freq;
  }

  const baseUnitPx = div8Count >= div4Count && div8Count > 0 ? 8 : 4;

  // Snap each observed value onto the nearest multiple of the base unit
  // (within ±1px); anything else is noise (stray margins, etc.) and dropped.
  // Frequencies of values snapping to the same multiple are summed, so the
  // ranking below reflects real usage of that rhythm step, not raw magnitude.
  const snapped = new Map<number, number>();
  for (const [val, freq] of counts.entries()) {
    const nearestMultiple = Math.round(val / baseUnitPx) * baseUnitPx;
    if (nearestMultiple > 0 && Math.abs(val - nearestMultiple) <= 1) {
      snapped.set(nearestMultiple, (snapped.get(nearestMultiple) ?? 0) + freq);
    }
  }

  // Filter & rank top spacing values (must appear at least 2 times if total nodes > 10)
  const threshold = dump.nodes.length > 10 ? 2 : 1;
  const scale = Array.from(snapped.entries())
    .filter(([, freq]) => freq >= threshold)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([val]) => val)
    .sort((a, b) => a - b);

  return {
    provenance: "measured",
    baseUnitPx,
    scale: scale.length > 0 ? scale : [4, 8, 16, 24, 32, 48, 64],
    unit: "px",
  };
}

export function extractRadius(dump: StyleDump): Radius {
  const counts = new Map<string, number>();

  for (const node of dump.nodes) {
    if (!node.layout?.borderRadius) continue;
    const raw = node.layout.borderRadius.trim();
    if (!raw || raw === "0px" || raw === "0") continue;

    // Normalize pill/circle radiuses
    let normalized = raw;
    if (raw === "50%" || raw.includes("999") || raw.includes("9999")) {
      normalized = "9999px";
    } else {
      // Multi-value corners (e.g. "0px 0px 6px 6px") collapse to the
      // dominant (mode) corner value rather than being kept as a composite.
      // Flush (0) corners are excluded first so a split like "0 0 6px 6px"
      // reads as a 6px radius, not a tie won by the flush side.
      const parts = raw.split(/\s+/);
      if (parts.every((p) => p === parts[0])) {
        normalized = parts[0];
      } else {
        const nonZeroParts = parts.filter((p) => p !== "0px" && p !== "0");
        normalized = nonZeroParts.length > 0 ? mode(nonZeroParts) : "0px";
      }
    }

    if (normalized === "0px" || normalized === "0") continue;

    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }

  // Sort radiuses: numeric values ascending, then 9999px at the end
  const sortedScale = Array.from(counts.keys()).sort((a, b) => {
    if (a === "9999px") return 1;
    if (b === "9999px") return -1;
    const numA = parseFloat(a) || 0;
    const numB = parseFloat(b) || 0;
    return numA - numB;
  });

  return {
    provenance: "measured",
    scale: sortedScale.length > 0 ? sortedScale.slice(0, 6) : ["4px", "8px", "16px", "9999px"],
  };
}

export function extractElevation(dump: StyleDump): Elevation {
  const counts = new Map<string, number>();

  for (const node of dump.nodes) {
    if (!node.layout?.boxShadow) continue;
    const raw = node.layout.boxShadow.trim();
    if (!raw || raw === "none") continue;

    counts.set(raw, (counts.get(raw) ?? 0) + 1);
  }

  // Keep the most commonly used shadows, then name them by increasing
  // offset+blur magnitude so the scale reads sm → xl like a spacing scale.
  const topShadows = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, ELEVATION_LEVELS.length)
    .map(([shadow]) => shadow)
    .sort((a, b) => shadowMagnitude(a) - shadowMagnitude(b));

  const shadows: ElevationShadow[] = topShadows.map((value, i) => ({
    name: ELEVATION_LEVELS[i],
    value,
  }));

  return {
    provenance: "measured",
    shadows,
  };
}
