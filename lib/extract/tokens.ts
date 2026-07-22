import type { Elevation, Radius, Spacing } from "@/lib/schema";
import type { StyleDump } from "@/lib/extract/styleDump";

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

  // Filter & sort top spacing values (must appear at least 2 times if total nodes > 10)
  const threshold = dump.nodes.length > 10 ? 2 : 1;
  const sortedVals = Array.from(counts.entries())
    .filter(([, freq]) => freq >= threshold)
    .map(([val]) => val)
    .sort((a, b) => a - b);

  const scale =
    sortedVals.length > 0 ? sortedVals.slice(0, 10) : [4, 8, 16, 24, 32, 48, 64];

  return {
    provenance: "measured",
    baseUnitPx,
    scale,
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
      // Split corner radiuses if multi-value e.g. "8px 8px 8px 8px" -> "8px"
      const parts = raw.split(/\s+/);
      if (parts.every((p) => p === parts[0])) {
        normalized = parts[0];
      }
    }

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

  // Sort by frequency descending
  const sortedShadows = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([shadow]) => shadow);

  return {
    provenance: "measured",
    shadows: sortedShadows.slice(0, 5),
  };
}
