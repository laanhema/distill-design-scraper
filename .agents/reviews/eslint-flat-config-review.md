# Code Review: feature/eslint-flat-config (issue #20 / DIST-014)

**Scope**: `git diff main...feature/eslint-flat-config` (1 commit, `c8333b3`), no uncommitted source changes
**Recommendation**: APPROVE (with nits)

## Summary

Adds the repo's first ESLint setup: `eslint@9`, `eslint-config-next@15.5.20`, `@eslint/eslintrc`, a flat `eslint.config.mjs` extending `next/core-web-vitals` + `next/typescript` via FlatCompat, and migrates the `lint` script from the deprecated `next lint` to `eslint .`. Six small source edits make lint pass with zero disabled rules. The diff is tightly scoped to the issue; every source change is mechanically equivalent to the old behavior (verified: unused symbols only written/imported, never read; the new `CompactTreeNode` type matches the object literal and its only consumer is `JSON.stringify`; the removed `isLast` parameter was never read inside `buildAsciiSkeleton`). All acceptance criteria of issue #20 are met.

## Issues Found

### Critical
None

### High Priority
None

### Medium Priority
None

### Suggestions (Low)

1. `eslint.config.mjs:4` — `import.meta.dirname` requires Node >= 20.11; `package.json` declares no `engines` field, so on Node 18 (which Next 15 still nominally supports) `baseDirectory` silently becomes `undefined` and FlatCompat falls back to cwd. This is the exact shape `create-next-app@15` generates, so it is conventional — but an `engines: { "node": ">=20.11" }` field (or a `fileURLToPath(import.meta.url)` fallback) would make the assumption explicit.
2. `package.json:33` — `eslint-config-next` is `^15.5.20` while `next` is `^15.1.6`; the two carets can drift to different 15.x minors on a fresh install, and eslint-config-next minor versions track Next minors. An exact pin (or aligning the `next` range) would keep them lock-stepped. Consistent with the repo's existing caret style, so nit only.

## Validation Results

| Check | Status |
|-------|--------|
| Lint (`npm run lint`) | PASS (exit 0, non-interactive, 0 findings) |
| Type check (`npm run typecheck`) | PASS |
| Eval gate (`npm run eval`) | PASS (all gates, scores unchanged, baseline untouched) |

## What's Good

- No rules disabled — all six pre-existing findings fixed mechanically instead of suppressed, and each fix is behavior-preserving.
- `any` was replaced with a precise recursive type rather than `unknown` or a suppression comment.
- Script name `lint` kept stable; deprecated `next lint` fully removed per its own deprecation guidance.
- Eval baseline correctly left untouched (no extractor behavior changed).

## Recommendation

Approve. The two suggestions are optional follow-ups, not blockers. Next step: push and open a PR via the follow-up command.
