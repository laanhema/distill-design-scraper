/**
 * Per-process token-bucket rate limiter guarding the expensive render/AI path
 * of `POST /api/analyze` (`app/api/analyze/route.ts`). In-memory only — in a
 * multi-instance/horizontally-scaled deployment each instance enforces its own
 * independent limit — this is a known MVP gap (no shared store such as Redis
 * in scope), not a bypass a single deployer needs to worry about.
 *
 * The bucket store is bounded to at most `RATE_LIMIT_MAX_BUCKETS` distinct
 * client keys: a rate limiter's own store must not itself be an
 * unbounded-growth vector keyed by a client-controlled, spoofable header
 * (`X-Forwarded-For`). When a new client key would push the store over the
 * cap, idle entries (a full window past their last touch — their tokens have
 * already refilled to full, so deleting them changes no observable behavior)
 * are swept first; if genuinely-active distinct clients still exceed the cap,
 * the least-recently-touched entry is evicted instead.
 */

/** Single error type mirroring `UnsafeUrlError`, carrying the `Retry-After` value the route needs. */
export class RateLimitExceededError extends Error {
  constructor(
    message: string,
    public readonly retryAfterSeconds: number,
  ) {
    super(message);
  }
}

const DEFAULT_MAX_REQUESTS = 20;
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_BUCKETS = 50_000;

interface Bucket {
  tokens: number;
  lastRefillAt: number;
}

const buckets = new Map<string, Bucket>();

function isDisabled(): boolean {
  const raw = (process.env.RATE_LIMIT_DISABLED ?? "").trim().toLowerCase();
  return raw === "true" || raw === "1";
}

import { parsePositiveInteger, parsePositiveNumber } from "@/lib/env";

function evictIfAtCapacity(maxBuckets: number, windowMs: number): void {
  if (buckets.size < maxBuckets) return;

  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.lastRefillAt >= windowMs) {
      buckets.delete(key);
    }
  }

  while (buckets.size >= maxBuckets) {
    const oldestKey = buckets.keys().next().value;
    if (oldestKey === undefined) break;
    buckets.delete(oldestKey);
  }
}

function getOrRefillBucket(key: string, capacity: number, windowMs: number, maxBuckets: number): Bucket {
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing) {
    evictIfAtCapacity(maxBuckets, windowMs);
    const fresh: Bucket = { tokens: capacity, lastRefillAt: now };
    buckets.set(key, fresh);
    return fresh;
  }

  const elapsedMs = now - existing.lastRefillAt;
  const refillRate = capacity / windowMs; // tokens/ms
  existing.tokens = Math.min(capacity, existing.tokens + elapsedMs * refillRate);
  existing.lastRefillAt = now;
  buckets.delete(key);
  buckets.set(key, existing);
  return existing;
}

/**
 * Reads `x-forwarded-for` (first comma-separated entry) then falls back to
 * `x-real-ip`, then to the literal string `"unknown"` — without a proxy
 * header, every unproxied local request is indistinguishable, so they share
 * one bucket, which is fine for the local-dev case the AC calls out.
 */
export function extractClientId(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }

  const realIp = request.headers.get("x-real-ip");
  if (realIp?.trim()) return realIp.trim();

  return "unknown";
}

/**
 * Throws `RateLimitExceededError` once `clientId`'s bucket is empty;
 * otherwise consumes one token. Env vars are read fresh on each call (not
 * cached at module load) so they stay tunable and testable:
 * `RATE_LIMIT_MAX_REQUESTS` (default 20), `RATE_LIMIT_WINDOW_MS` (default
 * 60000), `RATE_LIMIT_MAX_BUCKETS` (default 50000 — cap on distinct tracked
 * client IDs), `RATE_LIMIT_DISABLED` (`"true"`/`"1"` bypasses entirely — the
 * local-dev escape hatch the AC requires).
 */
export function assertWithinRateLimit(clientId: string): void {
  if (isDisabled()) return;

  const capacity = parsePositiveNumber(process.env.RATE_LIMIT_MAX_REQUESTS, DEFAULT_MAX_REQUESTS);
  const windowMs = parsePositiveNumber(process.env.RATE_LIMIT_WINDOW_MS, DEFAULT_WINDOW_MS);
  const maxBuckets = parsePositiveInteger(process.env.RATE_LIMIT_MAX_BUCKETS, DEFAULT_MAX_BUCKETS);

  const bucket = getOrRefillBucket(clientId, capacity, windowMs, maxBuckets);

  if (bucket.tokens < 1) {
    const refillRate = capacity / windowMs; // tokens/ms
    const retryAfterSeconds = Math.ceil((1 - bucket.tokens) / refillRate / 1000);
    throw new RateLimitExceededError(
      `Rate limit exceeded for client "${clientId}": max ${capacity} requests per ${windowMs}ms.`,
      retryAfterSeconds,
    );
  }

  bucket.tokens -= 1;
}
