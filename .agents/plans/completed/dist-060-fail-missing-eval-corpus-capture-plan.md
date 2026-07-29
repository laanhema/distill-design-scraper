# Plan: DIST-060 — Make a missing eval corpus capture fail rather than skip

## Summary

`npm run eval` silently skipped any `CORPUS` entry whose `capture.json` or `expected.yaml` was missing. This plan introduces an explicit `optional?: boolean` field on `CorpusEntry` in `eval/corpus.ts`. Non-optional entries missing their capture or expected files will now cause `npm run eval` to fail with a clear error message. Live reference entries (`stripe`, `linear`, `vercel`) are explicitly marked `optional: true`. Documentation in `CLAUDE.md` and `.agents/PRDs/PRD.md` is updated to explicitly state what the eval gate covers and does not cover.

## User Story

As a maintainer
I want missing required corpus entries to fail the eval runner
So that the eval gate is honest and cannot silently drop required coverage

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT (eval/tooling) |
| Complexity | LOW |
| Systems Affected | `eval/corpus.ts`, `eval/run.ts`, `CLAUDE.md`, `.agents/PRDs/PRD.md` |
| GitHub Issue | #108 (DIST-060) |

---

## Patterns to Follow

### `eval/corpus.ts` CorpusEntry shape
```ts
// SOURCE: eval/corpus.ts:14-27
export interface CorpusEntry {
  slug: string;
  bucket: ...;
  fixture?: string;
  url?: string;
  optional?: boolean;
}
```

### `eval/run.ts` failure handling
```ts
// SOURCE: eval/run.ts:181-197
if (failed) process.exit(1);
```

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `eval/corpus.ts` | UPDATE | Add `optional?: boolean` to `CorpusEntry` and mark `stripe`, `linear`, `vercel` as `optional: true` |
| `eval/run.ts` | UPDATE | Fail the eval runner if a non-optional corpus entry is missing capture/expected files |
| `CLAUDE.md` | UPDATE | Clarify eval gate coverage and non-coverage bounds |
| `.agents/PRDs/PRD.md` | UPDATE | Update §11 gate honesty description |

---

## Tasks

### Task 1: Update `eval/corpus.ts` and `eval/run.ts`

- **File**: `eval/corpus.ts` & `eval/run.ts`
- **Action**: UPDATE
- **Implement**:
  - In `eval/corpus.ts`: Add `optional?: boolean` to `CorpusEntry` interface and set `optional: true` on live reference entries `stripe`, `linear`, `vercel`.
  - In `eval/run.ts`: Track missing required entries. If any non-optional entry is missing `capture.json` or `expected.yaml`, print an error message `✗ missing required corpus capture: <slug>` and set `failed = true`.
- **Mirror**: `eval/run.ts:122-197`
- **Validate**: `npm run typecheck && npm run lint && npm run eval`

### Task 2: Update documentation (`CLAUDE.md` and `.agents/PRDs/PRD.md`)

- **File**: `CLAUDE.md` & `.agents/PRDs/PRD.md`
- **Action**: UPDATE
- **Implement**:
  - Clarify in `CLAUDE.md` that `npm run eval` checks required committed fixtures (`clean-light`, `dark-mode`) and fails if required captures are missing. Note explicit coverage boundaries (measured token lane + heuristic structure lane; doesn't cover uncommitted optional URLs or live AI calls).
  - Update §11 in `.agents/PRDs/PRD.md` to note that missing non-optional corpus entries fail the gate.
- **Validate**: `npm run typecheck && npm run lint`

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Eval suite
npm run eval
```

---

## End-to-End Verification

1. Run `npm run eval` — all gates pass with `clean-light` and `dark-mode`, while optional entries `stripe`, `linear`, `vercel` are reported as skipped optional entries.
2. Add a temporary required entry to `CORPUS` (e.g. `{ slug: "test-missing", bucket: "clean-design-system" }`) in `eval/corpus.ts` and run `npm run eval` — verify it exits non-zero with `✗ missing required corpus capture: test-missing`.
3. Revert the temporary test entry.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Unintended eval breakage | `clean-light` and `dark-mode` captures and expected specs are committed and present; optional flag on uncommitted live entries ensures CI remains green. |

---

## Acceptance Criteria

- [ ] Missing required corpus capture causes `npm run eval` to fail with exit code 1.
- [ ] Explicit `optional: true` on uncommitted corpus entries allows them to log as skipped without failing.
- [ ] `CLAUDE.md` and `.agents/PRDs/PRD.md` state what the gate covers and does not cover.
- [ ] `npm run typecheck`, `npm run lint`, and `npm run eval` all pass.
