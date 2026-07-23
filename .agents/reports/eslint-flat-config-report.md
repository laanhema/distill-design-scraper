# Implementation Report

**Plan**: `.agents/plans/completed/eslint-flat-config-plan.md`
**Branch**: `feature/eslint-flat-config`
**Status**: COMPLETE
**Issue**: #20 (DIST-014)

## Summary

Added a working ESLint setup so `npm run lint` runs to completion non-interactively. Installed `eslint@9.39.5`, `eslint-config-next@15.5.20` (pinned to the installed Next version), and `@eslint/eslintrc`; created a flat `eslint.config.mjs` extending `next/core-web-vitals` + `next/typescript` via `FlatCompat` (the shape `create-next-app@15` / the official `next-lint-to-eslint-cli` codemod generate); migrated the `lint` script from the deprecated `next lint` wrapper to `eslint .` (script name unchanged). The initial lint run surfaced 6 findings (2 errors, 4 warnings) — all had trivial mechanical fixes, so **no rules had to be disabled**.

## Tasks Completed

| # | Task | File | Status |
|---|------|------|--------|
| 1 | Create feature branch `feature/eslint-flat-config` | — | ✅ |
| 2 | Install `eslint`, `eslint-config-next@15.5.20`, `@eslint/eslintrc` | `package.json`, `package-lock.json` | ✅ |
| 3 | Create flat config (`next/core-web-vitals` + `next/typescript`, ignores `.next/`, `node_modules/`, `next-env.d.ts`) | `eslint.config.mjs` | ✅ |
| 4 | Migrate script `next lint` → `eslint .` | `package.json` | ✅ |
| 5 | Make lint pass on existing code (6 findings, all mechanically fixed) | see below | ✅ |
| 6 | Full validation (lint / typecheck / eval) | — | ✅ |

### Lint findings fixed (Task 5)

| Finding | Rule | Fix |
|---------|------|-----|
| `app/page.tsx:271` unescaped `'` in JSX | `react/no-unescaped-entities` | `it's` → `it&apos;s` |
| `lib/extract/imagePalette.ts:8` unused import `lightness` | `@typescript-eslint/no-unused-vars` | removed from import |
| `lib/extract/structure/index.ts:6` unused import `buildFallbackComponentMap` | `@typescript-eslint/no-unused-vars` | removed from import |
| `lib/extract/structure/repetition.ts:53` `matchedVariance` assigned, never read | `@typescript-eslint/no-unused-vars` | removed the dead flag (loop still sets `varianceNote` + breaks) |
| `lib/extract/structure/structureAI.ts:121` `any` return type | `@typescript-eslint/no-explicit-any` | typed as new recursive `CompactTreeNode` (payload is only `JSON.stringify`-ed into the prompt) |
| `lib/extract/structure/structureEmit.ts:222` unused param `isLast` | `@typescript-eslint/no-unused-vars` | removed the parameter and its recursive pass-through |

## Validation Results

| Check | Result |
|-------|--------|
| Lint (`npm run lint`, also with stdin closed) | ✅ exit 0, no interactive prompt, 0 findings |
| Type check (`npm run typecheck`) | ✅ |
| Eval gate (`npm run eval`) | ✅ all gates passed, scores unchanged (clean-light 100%, dark-mode 100%) — baseline NOT updated |

## Files Changed

| File | Action | Notes |
|------|--------|-------|
| `eslint.config.mjs` | CREATE | flat config, +15 lines |
| `package.json` | UPDATE | 3 devDeps added; `lint` script migrated |
| `package-lock.json` | UPDATE | lockfile fallout (large, mechanical) |
| `app/page.tsx` | UPDATE | 1-line JSX entity escape |
| `lib/extract/imagePalette.ts` | UPDATE | -1 unused import |
| `lib/extract/structure/index.ts` | UPDATE | -1 unused import |
| `lib/extract/structure/repetition.ts` | UPDATE | -2 lines dead flag |
| `lib/extract/structure/structureAI.ts` | UPDATE | +13/-1: typed `CompactTreeNode` replaces `any` |
| `lib/extract/structure/structureEmit.ts` | UPDATE | removed unused `isLast` param |

## Deviations from Plan

- The plan anticipated possibly disabling noisy rules with comments; in practice all 6 findings were mechanically fixable, so no rules were disabled and the config stays stock.
- The plan suggested `_`-prefixing unused args as an option; the default preset does not ignore `_`-prefixed args, so dead code was removed instead (still purely mechanical).

## Tests Written

No unit test framework exists in this repo by design; the stated correctness gate is `npm run eval`, which passes with unchanged scores. The tooling change itself was verified end-to-end: `npm run lint` completes non-interactively (stdin closed) with a pass/fail exit code and zero findings on the current codebase.
