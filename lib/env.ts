/**
 * Guards bounded-resource caps against invalid or non-positive environment
 * configuration.
 */

export function parsePositiveNumber(
  raw: string | undefined,
  fallback: number,
): number {
  const parsed = Number(raw);
  return Number.isNaN(parsed) || parsed <= 0 ? fallback : parsed;
}

/**
 * Rejects a floor below 1: `0.5` would otherwise floor to `0` and defeat the
 * cap instead of falling back to the default.
 */
export function parsePositiveInteger(
  raw: string | undefined,
  fallback: number,
): number {
  const parsed = Math.floor(parsePositiveNumber(raw, fallback));
  return parsed < 1 ? fallback : parsed;
}
