import crypto from "crypto";

/**
 * TTL cache for analysis results, keyed by a SHA-256 hash of the request.
 *
 * Bounded like `lib/security/rateLimiter.ts`: a cache of multi-MB payloads
 * (base64 screenshots) must not be an unbounded-growth vector. Three
 * mechanisms keep it bounded:
 *
 * - an entry cap (`CACHE_MAX_ENTRIES`): an insert past it sweeps expired
 *   entries first, then evicts the least-recently-used live one;
 * - LRU recency: a `Map` iterates in insertion order, so delete + re-set on
 *   every read hit keeps the first-iterated key the least-recently-used one;
 * - a periodic sweep, started lazily and `unref()`d so it never keeps the
 *   process alive, that removes expired entries nobody reads again.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 10 * 60 * 1000;
// Cap on cached responses (tunable via CACHE_MAX_ENTRIES, mirroring
// RATE_LIMIT_MAX_BUCKETS). Deliberately small: each entry can carry several
// MB of base64 screenshots, so 50 entries bounds the cache to the order of a
// few hundred MB worst case instead of unbounded heap growth.
const DEFAULT_MAX_ENTRIES = 50;
import { parsePositiveInteger } from "@/lib/env";

const SWEEP_INTERVAL_MS = 60_000;

const cacheStore = new Map<string, CacheEntry<unknown>>();

let sweepTimer: NodeJS.Timeout | null = null;

function sweepExpired(): void {
  const now = Date.now();
  for (const [key, entry] of cacheStore) {
    if (now > entry.expiresAt) {
      cacheStore.delete(key);
    }
  }
}

/** Sweeps expired entries first, then evicts from the Map's iteration head (LRU). */
function evictIfAtCapacity(maxEntries: number): void {
  if (cacheStore.size < maxEntries) return;

  sweepExpired();

  while (cacheStore.size >= maxEntries) {
    const oldestKey = cacheStore.keys().next().value;
    if (oldestKey === undefined) break;
    cacheStore.delete(oldestKey);
  }
}

export function createCacheKey(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/** The live value stored under `key`, or `null`. Typed `unknown`: the store
 *  holds whatever `setCache` was given, so the caller narrows what it reads. */
export function getCache(key: string): unknown {
  const entry = cacheStore.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    cacheStore.delete(key);
    return null;
  }

  // Refresh recency (see the header).
  cacheStore.delete(key);
  cacheStore.set(key, entry);

  return entry.value;
}

export function setCache<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS): void {
  // Read fresh on each call (not cached at module load) so it stays tunable
  // and testable, like the rate limiter's env knobs.
  const maxEntries = parsePositiveInteger(process.env.CACHE_MAX_ENTRIES, DEFAULT_MAX_ENTRIES);

  // Delete first so overwriting an existing key refreshes its recency rather
  // than double-counting toward the cap (and never evicts a victim for it).
  cacheStore.delete(key);
  evictIfAtCapacity(maxEntries);

  cacheStore.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });

  if (sweepTimer === null) {
    // Started lazily (not at module load) and unref'd so scripts, builds and
    // tests that import this module can still exit promptly.
    sweepTimer = setInterval(sweepExpired, SWEEP_INTERVAL_MS);
    sweepTimer.unref();
  }
}
