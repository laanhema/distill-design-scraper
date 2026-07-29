# Plan: DIST-069: Unify `parsePositiveNumber` / `parsePositiveInteger`

## Summary

Extract `parsePositiveNumber` and `parsePositiveInteger` into a shared module `lib/env.ts` used by both `lib/cache.ts` and `lib/security/rateLimiter.ts`.

## Metadata

| Field | Value |
|-------|-------|
| Type | REFACTOR |
| Complexity | LOW |
| Systems Affected | lib/env.ts, lib/cache.ts, lib/security/rateLimiter.ts |
| GitHub Issue | #131 |

---

## Tasks

### Task 1: Create shared lib/env.ts module
- **File**: `lib/env.ts`
- **Implement**: Export `parsePositiveNumber` and `parsePositiveInteger` with doc comments explaining fractional floor rejection (< 1 fallback to default).

### Task 2: Refactor cache.ts and rateLimiter.ts
- **Files**: `lib/cache.ts`, `lib/security/rateLimiter.ts`
- **Implement**: Import env helpers from `@/lib/env` and remove local copies.

---

## Validation

```bash
npm run typecheck
npm run lint
npm run eval
```
