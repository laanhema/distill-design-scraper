import crypto from "crypto";

/**
 * Phase 5: Simple TTL cache for analysis results (§9).
 * Caches results by SHA-256 hash of request key/artifacts.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const DEFAULT_TTL_MS = 10 * 60 * 1000; // 10 minutes
const cacheStore = new Map<string, CacheEntry<unknown>>();

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

  return entry.value as T;
}

export function setCache<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS): void {
  cacheStore.set(key, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}
