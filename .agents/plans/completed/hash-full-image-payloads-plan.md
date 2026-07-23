# Plan: Hash Full Image Payloads in the Analyze Cache Key (DIST-007)

## Summary

The `POST /api/analyze` response cache keys image requests on only the first 100 base64 characters of each upload (`img.data.slice(0, 100)`), so two different images sharing a PNG signature/IHDR prefix collide and the second user silently receives the first user's cached report. The fix is a one-line change: feed the full `img.data` of every image into the SHA-256 cache key. Hashing a few MB is negligible next to the Chromium render / AI call the cache fronts, and `createCacheKey` already SHA-256-hashes its input, so key size stays constant.

## User Story

As an image-upload user
I want the response cache keyed on my complete image payloads
So that another user's visually similar upload can never collide with mine and hand them my cached report (including my screenshot previews)

## Metadata

| Field | Value |
|-------|-------|
| Type | BUG_FIX |
| Complexity | LOW |
| Systems Affected | API route cache keying (`app/api/analyze/route.ts`) |
| GitHub Issue | #13 (DIST-007) |

---

## Patterns to Follow

### Cache-key construction (the defect site)

```ts
// SOURCE: app/api/analyze/route.ts:67-68
const imagesKeyPart = images.map((img) => img.data.slice(0, 100)).join("|");
const cacheKey = createCacheKey(`${url || ""}:${imagesKeyPart}:${mode}`);
```

### Hashing helper (already does the heavy lifting)

```ts
// SOURCE: lib/cache.ts:16-18
export function createCacheKey(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}
```

Notes:
- `img.data` is base64 (optionally with a `data:image/...;base64,` prefix), so the `|` join delimiter cannot appear inside a payload — the existing join stays unambiguous with full payloads.
- Keep the same key composition (`url : imagesKeyPart : mode`) so URL-request keys are untouched.

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `app/api/analyze/route.ts` | UPDATE | Feed full image payloads into the cache key (drop the 100-char truncation) |

---

## Tasks

### Task 1: Hash full payloads in the cache key

- **File**: `app/api/analyze/route.ts`
- **Action**: UPDATE
- **Implement**: At line 67, replace `images.map((img) => img.data.slice(0, 100)).join("|")` with `images.map((img) => img.data).join("|")`. No other behavior changes — same delimiter, same key composition, same `createCacheKey` call.
- **Mirror**: `lib/cache.ts:16-18` — `createCacheKey` already SHA-256-hashes arbitrary-length input.
- **Validate**: `npm run typecheck && npm run lint`

### Task 2: Verify acceptance criteria

- **Verify**:
  - Two different payloads sharing the first 100 chars now produce distinct `cacheKey`s (distinct SHA-256 inputs) — can be sanity-checked with a tiny scratch script in the scratchpad if desired; the change is trivially inspectable.
  - Identical payload twice → identical key → cache hit preserved (deterministic hash of identical input).
  - `grep -n "slice(0" app/api/analyze/route.ts` returns nothing — no prefix truncation feeds the hash.
- **Validate**: `npm run eval` (must pass unchanged — this change touches no extraction code, so no baseline refresh)

---

## Validation

```bash
npm run typecheck
npm run lint
npm run eval
```

---

## Acceptance Criteria

- [ ] Different images sharing a 100-char prefix produce distinct cache keys and responses
- [ ] Same image re-uploaded within TTL still hits the cache
- [ ] No prefix truncation feeds the hash in `app/api/analyze/route.ts`
- [ ] `npm run typecheck` and `npm run eval` pass unchanged
