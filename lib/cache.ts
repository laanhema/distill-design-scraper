import crypto from "crypto";

/**
 * Phase 5: Simple TTL cache for analysis results (§9).
 * Caches results by SHA-256 hash of request key/artifacts.
 *
 * The store is bounded, mirroring `lib/security/rateLimiter.ts`: a cache of
 * multi-MB response payloads (base64 screenshots) keyed by request hash must
 * not itself be an unbounded-growth vector — entries whose keys are never
 * requested again would otherwise live forever, since expiry was only ever
 * checked on read. Three mechanisms keep it bounded:
 *
 * - an entry cap (`CACHE_MAX_ENTRIES`, default `DEFAULT_MAX_ENTRIES`): when an
 *   insert would exceed it, expired entries are swept first (deleting them
 *   changes no observable behavior), then the least-recently-used live entry
 *   is evicted;
 * - LRU recency: a `Map` iterates in insertion order, so delete + re-set on
 *   every read hit keeps the first-iterated key the least-recently-used one;
 * - a periodic sweep (`SWEEP_INTERVAL_MS`, started lazily on first write and
 *   `unref()`d so it never keeps the process alive) that removes expired
 *   entries without requiring a read.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes
// Cap on cached responses (tunable via CACHE_MAX_ENTRIES, mirroring
// RATE_LIMIT_MAX_BUCKETS). Deliberately small: each entry can carry several
// MB of base64 screenshots, so 50 entries bounds the cache to the order of a
// few hundred MB worst case instead of unbounded heap growth.
const DEFAULT_MAX_ENTRIES = 50;
import { parsePositiveInteger } from "@/lib/env";

// How often the periodic sweep evicts expired entries that are never re-read.
const SWEEP_INTERVAL_MS = 60_000;

const cacheStore = new Map<string, CacheEntry<unknown>>();

let sweepTimer: NodeJS.Timeout | null = null;

/** Removes every expired entry, regardless of whether it is ever read again. */
function sweepExpired(): void {
  const now = Date.now();
  for (const [key, entry] of cacheStore) {
    if (now > entry.expiresAt) {
      cacheStore.delete(key);
    }
  }
}

/**
 * Enforces the entry cap before an insert: sweep expired entries first, then
 * evict least-recently-used live entries (the Map's iteration head) until a
 * slot is free. Mirrors `evictIfAtCapacity` in `lib/security/rateLimiter.ts`.
 */
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

export function getCache<T>(key: string): T | null {
  const entry = cacheStore.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    cacheStore.delete(key);
    return null;
  }

  // Refresh recency: delete + re-set moves the entry to the end of the Map's
  // insertion order, so the iteration head stays the LRU eviction candidate.
  cacheStore.delete(key);
  cacheStore.set(key, entry);

  return entry.value as T;
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
