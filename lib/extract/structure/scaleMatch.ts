/**
 * Snaps a measured value to the nearest scale step, or `null` when no step lies
 * within `tolerance` — so a caller never guesses a token that isn't in the
 * report. Each call site passes its own tolerance for its input: exact DOM
 * gaps take a tight 2px (`tokenLink.ts`), bounds-derived padding averages a
 * slacker 4px (`regionMetrics.ts`).
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
