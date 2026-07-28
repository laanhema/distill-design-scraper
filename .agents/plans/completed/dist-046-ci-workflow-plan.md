# Plan: DIST-046 — Automated GitHub Actions CI workflow (.github/workflows/ci.yml)

## Summary

Create a minimal, reliable GitHub Actions CI workflow at `.github/workflows/ci.yml` that runs `npm run typecheck`, `npm run lint`, and `npm run eval` on all pushes to `main` and pull requests targeting `main`.

## Metadata

| Field | Value |
|-------|-------|
| Type | INFRA |
| Priority | HIGH |
| Complexity | SMALL |
| Systems Affected | `.github/workflows/ci.yml` |
| GitHub Issue | #90 |

---

## Tasks

### Task 1: Create CI workflow definition
- **File**: `.github/workflows/ci.yml`
- **Action**: CREATE
- **Implement**:
  - Configure `push` and `pull_request` triggers for `main`.
  - Set up Node 20 with npm caching (`actions/setup-node@v4`).
  - Run `npm ci`, `npx playwright install --with-deps chromium`.
  - Run `npm run typecheck`, `npm run lint`, and `npm run eval` in order.
- **Validate**: Workflow file syntax check and offline eval test execution.

---

## Validation

- Type check: `npm run typecheck`
- Lint: `npm run lint`
- Eval harness: `npm run eval`
