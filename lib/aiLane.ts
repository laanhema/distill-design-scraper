/**
 * Shared primitives for every Claude-backed lane (interpretation, DOM-based
 * structure labelling, vision-based structure inference) — one model id, one
 * availability check, and one retry policy so the three lanes can't drift out
 * of sync with each other.
 */

/** Vision-capable; pinned everywhere an AI lane calls Claude. */
export const AI_MODEL = "claude-opus-4-8";

/** True when a live AI lane call is possible (an API key is configured). */
export function aiLaneAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * One repair retry, then graceful `null` — the shared fallback policy across
 * every AI lane. `onError` lets a caller log the failure without changing the
 * retry shape itself.
 */
export async function retryOnce<T>(
  fn: () => Promise<T | null>,
  onError?: (err: unknown, attempt: 1 | 2) => void,
): Promise<T | null> {
  let result = await fn().catch((err) => {
    onError?.(err, 1);
    return null;
  });
  if (!result) {
    result = await fn().catch((err) => {
      onError?.(err, 2);
      return null;
    });
  }
  return result;
}
