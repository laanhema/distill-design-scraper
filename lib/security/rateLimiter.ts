/**
 * Per-process token-bucket rate limiter for the expensive render/AI path of
 * `POST /api/analyze`. In-memory only: each instance of a scaled-out deployment
 * enforces its own limit.
 *
 * The store is bounded to `RATE_LIMIT_MAX_BUCKETS` client keys, because it
 * must not itself be an unbounded-growth vector keyed by a client-controlled,
 * spoofable header (`X-Forwarded-For`). Past the cap, idle entries (a full
 * window untouched, so already refilled; deleting them changes nothing) are
 * swept first, then the least-recently-touched entry is evicted.
 */

/** Carries the `Retry-After` value the route needs. */
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
 * `x-forwarded-for` (first entry), then `x-real-ip`, then `"unknown"`: without
 * a proxy header every local request shares one bucket, which is fine for
 * local dev.
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
 * Env vars are read fresh on each call so they stay tunable and testable:
 * `RATE_LIMIT_MAX_REQUESTS`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_BUCKETS`,
 * and `RATE_LIMIT_DISABLED` (`"true"`/`"1"`, the local-dev escape hatch).
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
