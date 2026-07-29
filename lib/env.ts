/**
 * Shared environment-variable parsing helpers (§6 "Bounded everything").
 *
 * Used by:
 * - `cache.ts`: `CACHE_MAX_ENTRIES`
 * - `security/rateLimiter.ts`: `RATE_LIMIT_MAX_REQUESTS`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_BUCKETS`
 *
 * Guards bounded-resource caps against invalid or non-positive environment configuration.
 */

/** Parse an env var as a positive number (> 0), returning `fallback` if unparseable or non-positive. */
export function parsePositiveNumber(
  raw: string | undefined,
  fallback: number,
): number {
  const parsed = Number(raw);
  return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
}

/**
 * Like `parsePositiveNumber`, but floors to an integer and rejects the result if that floor is `< 1`.
 * A fractional value below 1 (e.g. `0.5`) would otherwise floor to `0`, which defeats bounded-resource
 * caps (entry caps, bucket capping) instead of falling back to the documented default.
 */
export function parsePositiveInteger(
  raw: string | undefined,
  fallback: number,
): number {
  const parsed = Math.floor(parsePositiveNumber(raw, fallback));
  return parsed < 1 ? fallback : parsed;
}
