# Plan: Stop Caching Transient Structure Failures on the URL Path (DIST-018)

## Summary

The URL-analysis branch of `POST /api/analyze` unconditionally calls `setCache` even when the structure lane was requested (`mode: "structure" | "both"`) and threw a transient exception — so `structureReport: null` is served for the full 10-minute TTL. The image-analysis branch already implements the correct behavior: it skips `setCache` when `structureUnavailableReason` is set (route.ts:175–180, citing review finding #3). This plan mirrors that exact mechanism on the URL path: when `extractStructureFromCapture` throws, record a `structureUnavailableReason`, include it in the response payload (the frontend already renders this field generically), and gate `setCache` on its absence. Success paths and no-structure-requested paths cache exactly as today.

## User Story

As a URL-analysis user
I want a transient structure-lane failure to not be cached
So that I'm not served `structureReport: null` for the full 10-minute TTL after a one-off exception

## Metadata

| Field | Value |
|-------|-------|
| Type | BUG_FIX |
| Complexity | LOW |
| Systems Affected | API route (`app/api/analyze/route.ts`) only |
| GitHub Issue | #24 |

---

## Patterns to Follow

### The image path's existing skip-cache condition (the behavior to copy)

```ts
// SOURCE: app/api/analyze/route.ts:175-181
      // Don't cache a transient structure failure — replaying it verbatim for
      // the full TTL would hide a one-off vision-model flake/timeout from a
      // resubmission seconds later (§ code review finding #3).
      if (!structureUnavailableReason) {
        setCache(cacheKey, responsePayload);
      }
      return NextResponse.json(responsePayload);
```

### The URL path's current structure-extraction error handling (site of the bug)

```ts
// SOURCE: app/api/analyze/route.ts:188-201, 219
    let structureReport = null;
    if (mode === "structure" || mode === "both") {
      try {
        structureReport = await extractStructureFromCapture(
          capture,
          mode === "both" ? report : undefined,
        );
      } catch (err) {
        console.warn("Structure extraction error:", err);
      }
    }
    // ... responsePayload built without structureUnavailableReason ...
    setCache(cacheKey, responsePayload);   // ← unconditional: the bug
```

### `structureUnavailableReason` wording precedent (image lane)

```ts
// SOURCE: lib/analyze.ts:255
structureUnavailableReason: "Vision structure inference failed for this image.",
```

### Frontend already renders the field generically

```ts
// SOURCE: app/page.tsx:143
setStructureUnavailableReason(data.structureUnavailableReason ?? null);
```

So adding `structureUnavailableReason` to the URL response is additive and immediately useful — no frontend change needed.

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `app/api/analyze/route.ts` | UPDATE | Track structure-lane failure on the URL path; surface `structureUnavailableReason`; skip `setCache` when set |

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Record the structure failure on the URL path

- **File**: `app/api/analyze/route.ts`
- **Action**: UPDATE
- **Implement**: In the URL branch, alongside `let structureReport = null;` declare `let structureUnavailableReason: string | undefined;`. In the existing `catch (err)` block (after the `console.warn`), set it to a short user-facing message, e.g. `"Structure extraction failed for this page."` (mirror the tone of lib/analyze.ts:255). Do not change the success path — `structureReport` remains whatever extraction returned, and the variable stays `undefined` when structure wasn't requested or succeeded.
- **Mirror**: `lib/analyze.ts:247-260` — reason set only on the failure arm, `undefined` otherwise.
- **Validate**: `npm run typecheck`

### Task 2: Include the reason in the response payload

- **File**: `app/api/analyze/route.ts`
- **Action**: UPDATE
- **Implement**: Add `structureUnavailableReason,` to the URL branch's `responsePayload` object (next to `structureReport`), matching the image branch's payload shape at route.ts:159–160. When `undefined`, JSON serialization omits it — response shape for success/no-structure requests is byte-identical to today.
- **Mirror**: `app/api/analyze/route.ts:155-173` (image branch payload)
- **Validate**: `npm run typecheck`

### Task 3: Gate `setCache` on the absence of a structure failure

- **File**: `app/api/analyze/route.ts`
- **Action**: UPDATE
- **Implement**: Replace the unconditional `setCache(cacheKey, responsePayload);` (currently line 219) with the image path's guarded form, including an equivalent comment:
  ```ts
  // Don't cache a transient structure failure — replaying it verbatim for
  // the full TTL would hide a one-off flake/timeout from a resubmission
  // seconds later (mirrors the image path, § code review finding #3).
  if (!structureUnavailableReason) {
    setCache(cacheKey, responsePayload);
  }
  ```
- **Mirror**: `app/api/analyze/route.ts:175-181`
- **Validate**: `npm run typecheck && npm run lint`

---

## Risks

| Risk | Mitigation |
|------|------------|
| Accidentally treating "structure not requested" (`mode: "tokens"`) as a failure and never caching | Reason is only set inside the `catch` of the structure `try`, which only runs when `mode` is `structure`/`both` — tokens-only requests keep today's caching |
| `extractStructureFromCapture` legitimately returning `null`/empty being conflated with failure | Gate only on the thrown-exception path (the `catch`), never on the return value — a successful-but-null extraction still caches, exactly as today |
| Response-shape change breaking the frontend | `structureUnavailableReason` is already an optional field the frontend reads (app/page.tsx:31,143); `undefined` serializes to an absent key |
| Eval regression | The route is not part of the eval harness surface, but run `npm run eval` anyway per CLAUDE.md — it must pass unchanged |

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Extraction regression gate (must pass unchanged — no extractor touched)
npm run eval
```

## End-to-End Verification

The route depends on Next.js request plumbing, so exercise the exact decision logic with a scratch script that imports nothing network-bound — or verify via the dev server:

1. **Static verification of the three acceptance criteria against the diff** (required):
   - AC1: in the URL branch, the `catch` sets `structureUnavailableReason`, and `setCache` is inside `if (!structureUnavailableReason)`.
   - AC2: when structure succeeds or `mode === "tokens"`, `structureUnavailableReason` stays `undefined` → `setCache` runs exactly as before.
   - AC3: because nothing was cached on failure, a retry re-enters the analysis path (cache lookup at route.ts:119-124 misses) → fresh attempt.
2. **Optional live check** (only if time permits): `npm run dev`, POST `{"url": "https://example.com", "mode": "both"}` to `/api/analyze` twice — second call should be a fast cache hit when structure succeeded; there is no easy way to force a transient structure throw against a live page, which is why the static check above is the primary gate.

Expected outcome: typecheck/lint/eval all pass; diff confined to `app/api/analyze/route.ts` URL branch.

---

## Acceptance Criteria

- [ ] Given a URL analysis where structure was requested but threw, `setCache` is skipped (mirroring the image path's existing behavior)
- [ ] Given a URL analysis where structure succeeded (or wasn't requested), caching behaves exactly as today
- [ ] Given a retry after a transient failure, a fresh attempt runs instead of returning the cached null
- [ ] `npm run typecheck`, `npm run lint`, `npm run eval` all pass
- [ ] Follows existing patterns (image-path mirror, comment citing the same review finding)
