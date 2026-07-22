import type { NodeStyle, StyleDump } from "@/lib/extract/styleDump";
import type { Bounds } from "../structureSchema";

/**
 * Shared bounds-overlap matcher (§P3-1 tokenLink, §P7-2 regionMetrics): finds
 * the style-dump node that "is" a given PrunedNode by nearest bounding box,
 * within a small tolerance. Best-effort — callers treat a null match as "no
 * data", never a guess.
 */

/** Max total px difference (x+y+w+h) for a style-dump node to "be" a PrunedNode. */
export const BOUNDS_MATCH_TOLERANCE = 6;

export function boundsDistance(a: Bounds, b: NodeStyle["rect"]): number {
  return (
    Math.abs(a.x - b.x) +
    Math.abs(a.y - b.y) +
    Math.abs(a.width - b.w) +
    Math.abs(a.height - b.h)
  );
}

export function findMatchingStyleNode(
  bounds: Bounds,
  dump: StyleDump,
): NodeStyle | null {
  let best: NodeStyle | null = null;
  let bestDist = Infinity;
  for (const n of dump.nodes) {
    const d = boundsDistance(bounds, n.rect);
    if (d < bestDist) {
      bestDist = d;
      best = n;
    }
  }
  return bestDist <= BOUNDS_MATCH_TOLERANCE ? best : null;
}
