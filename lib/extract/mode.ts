/**
 * Shared modal aggregation helper (DIST-068 / §12 Phase 8 P2-1).
 *
 * Finds the most frequent value in a list (mode).
 * Tie-break rule: Ties preserve the first value to reach the highest count (first-seen wins).
 * Empty input rule: Returns `fallback` if provided; otherwise returns `undefined` (or `values[0]` if non-empty).
 *
 * Used by:
 * - `tokens.ts`: aggregating spacing/radius/elevation tokens across DOM nodes.
 * - `typography.ts`: aggregating font-family, weight, line-height, letter-spacing per token.
 *
 * Note: `recipes.ts` maintains a distinct `modal<T>(values, keyOf)` helper for objects keyed by property.
 */

export function mode<T>(values: T[]): T;
export function mode<T>(values: T[], fallback: T): T;
export function mode<T>(values: T[], fallback?: T): T | undefined {
  if (values.length === 0) return fallback;
  const counts = new Map<T, number>();
  let best: T = values[0];
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
