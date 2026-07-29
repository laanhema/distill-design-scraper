/**
 * Shared scale step matcher (DIST-067 / §12 Phase 8 P2-1).
 *
 * Snaps a measured numeric value to the nearest step in a numeric scale (e.g. `report.spacing.scale`),
 * returning `null` if no scale value lies within `tolerance`.
 *
 * Used by:
 * - `tokenLink.ts` (§P3-1): matching exact DOM gaps to spacing tokens (tight tolerance = 2px).
 *   `tokenLink` relies on returning `null` when out of tolerance so it NEVER guesses a token not in the report.
 * - `regionMetrics.ts` (§P7-2): snapping bounds-derived vertical padding averages (slack tolerance = 4px).
 *
 * Differing tolerances reflect physical inputs (exact DOM gaps vs bounds-derived averages),
 * passed explicitly per call site.
 */

export function nearestScaleValue(
  value: number,
  scale: number[],
  tolerance: number,
): number | null {
  let best: number | null = null;
  let bestDiff = Infinity;
  for (const s of scale) {
    const diff = Math.abs(s - value);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = s;
    }
  }
  return best !== null && bestDiff <= tolerance ? best : null;
}
