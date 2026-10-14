/**
 * Ties go to the first value to reach the highest count; empty input returns
 * `fallback`. `recipes.ts` keeps a distinct `modal<T>(values, keyOf)` for
 * objects keyed by property.
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
