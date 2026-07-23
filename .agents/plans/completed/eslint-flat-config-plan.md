# Plan: Working ESLint Config for Non-Interactive `npm run lint` (DIST-014)

## Summary

Add a real ESLint setup so `npm run lint` runs to completion non-interactively. Today no ESLint config or eslint packages exist anywhere in the repo, so `next lint` (the current script) drops into its interactive setup wizard — and Next 15.5 deprecates `next lint` anyway. The fix: install `eslint`, `eslint-config-next` (version-matched to the installed Next 15.5.20), and `@eslint/eslintrc`; add a flat `eslint.config.mjs` extending `next/core-web-vitals` + `next/typescript` via `FlatCompat` (the exact shape `create-next-app@15` generates and the `next-lint-to-eslint-cli` codemod produces); change the script to `"lint": "eslint ."` keeping the script name stable. Then run lint on the existing codebase and make it pass — trivial fixes only (unused imports and the like); any rule that fires broadly on existing code gets explicitly disabled in the config with a comment, per the issue's "no drive-by refactors" constraint.

## User Story

As a contributor
I want `npm run lint` to run to completion without prompting
So that the lint gate mandated by CLAUDE.md and the git policy is actually usable locally and in CI

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT (tooling) |
| Complexity | LOW |
| Systems Affected | Tooling only: `package.json`, new `eslint.config.mjs`; possibly tiny targeted source fixes |
| GitHub Issue | #20 |

---

## Context and Constraints (from issue #20 + comment)

- AC1: fresh checkout, `npm run lint` non-interactive → completes with pass/fail, no prompt.
- AC2: lint **passes** on current codebase — fix or *explicitly disable* rules that fire on existing code; **no drive-by refactors**.
- AC3: config uses Next's recommended preset (`next/core-web-vitals` or flat equivalent); migrate off deprecated `next lint` per its deprecation warning; keep `npm run lint` script name stable.
- Technical note on issue: prefer invoking `eslint` directly with `eslint-config-next` in a flat config.
- Installed Next version: **15.5.20** → install `eslint-config-next@15.5.20` (must match Next major/minor to avoid plugin version skew).
- CLAUDE.md git policy: do not commit/push unless asked. Work on a feature branch; leave changes uncommitted unless orchestrator instructs otherwise. (Orchestrator instruction for this flow: feature branch yes, commit allowed, no push/PR.)
- `postinstall` runs `playwright install chromium` — an `npm install` of the new devDeps will trigger it; harmless (already cached) but expect it.

## Patterns to Follow

### Flat config shape (what `create-next-app@15` / the official codemod generate)

```js
// SOURCE: Next.js 15.5 docs / next-lint-to-eslint-cli codemod output — no in-repo precedent (this is the first ESLint config)
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts"],
  },
];

export default eslintConfig;
```

### Script naming

```jsonc
// SOURCE: package.json:6-16 — keep the "lint" key, swap the command
"lint": "eslint ."
```

### Repo conventions

- ESM config files use `.mjs` (`next.config.mjs`, `postcss.config.mjs`) → name the config `eslint.config.mjs`.
- Comments in config files explain *why* (see `next.config.mjs`'s serverExternalPackages comment) — any rule disabled for existing code must carry a one-line justification comment.

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `package.json` | UPDATE | Add devDeps `eslint`, `eslint-config-next@15.5.20`, `@eslint/eslintrc`; change `lint` script to `eslint .` |
| `package-lock.json` | UPDATE | Lockfile fallout from the install (do not hand-edit) |
| `eslint.config.mjs` | CREATE | Flat config extending `next/core-web-vitals` + `next/typescript` with ignores |
| (targeted source files) | UPDATE (only if needed) | Trivial fixes for rules that fire (e.g. unused import); otherwise disable the rule in config with a comment |

---

## Tasks

### Task 1: Create feature branch

- **Action**: `git checkout -b feature/eslint-flat-config` from current `main`.

### Task 2: Install dev dependencies

- **File**: `package.json`, `package-lock.json`
- **Action**: UPDATE via `npm install --save-dev eslint eslint-config-next@15.5.20 @eslint/eslintrc`
- **Implement**: Let npm pick a compatible `eslint` (v9.x — required for flat config) — `eslint-config-next@15.5.x` supports ESLint 9. Expect `postinstall` (playwright install chromium) to run.
- **Validate**: `npx eslint --version` prints a 9.x version.

### Task 3: Add `eslint.config.mjs`

- **File**: `eslint.config.mjs`
- **Action**: CREATE
- **Implement**: The FlatCompat config from "Patterns to Follow". Ignores must cover `.next/**`, `node_modules/**`, `next-env.d.ts`. Add `eval/**` ONLY if its scripts trigger noise that can't be cleanly rule-scoped — prefer linting `eval/` too since it's first-party TS; if a rule fires there (e.g. `no-console`, which is NOT in core-web-vitals, so unlikely), scope a rule override to `eval/**` rather than ignoring the directory.
- **Validate**: `npm run lint` runs non-interactively (no wizard) and reports pass/fail.

### Task 4: Update the lint script

- **File**: `package.json`
- **Action**: UPDATE `"lint": "next lint"` → `"lint": "eslint ."`
- **Validate**: `npm run lint` exits 0 or with real findings — never a prompt.

### Task 5: Make lint pass on the existing codebase

- **File**: TBD by lint output
- **Action**: UPDATE (minimal)
- **Implement**: Run `npm run lint`. Triage every finding:
  - Trivial, mechanical fix (unused import/var, `prefer-const`) → fix in place.
  - Rule firing on deliberate existing patterns (e.g. `@typescript-eslint/no-explicit-any` — one known hit in `lib/extract/structure/structureAI.ts`; `@typescript-eslint/no-unused-vars` on intentionally-unused args) → prefer a narrowly-scoped fix (`_`-prefix arg, typed replacement) if it's a one-liner; otherwise set the rule to `"off"`/`"warn"` in `eslint.config.mjs` with a comment naming why (existing code, no drive-by refactors — see DIST-014 AC2).
  - Never restructure logic to satisfy a rule.
- **Validate**: `npm run lint` exits 0.

### Task 6: Full validation

- **Validate**: `npm run typecheck` passes; `npm run eval` passes unchanged (no extractor code touched — score must not move; do NOT update baseline); `npm run lint` passes.

---

## Risks

| Risk | Mitigation |
|------|------------|
| `eslint-config-next` version drifts from installed Next | Pin to `15.5.20` (matches `node_modules/next`) |
| `next/typescript` preset too noisy on existing code | AC2 explicitly allows disabling rules; disable with comment rather than refactor. If wholly unworkable, fall back to `next/core-web-vitals` alone (still satisfies AC3) |
| Lint pulls in `.next/` build artifacts or `tsconfig.tsbuildinfo` noise | `ignores` block; eslint only lints JS/TS files anyway |
| `npm install` postinstall (playwright) fails offline | Browser already installed/cached from prior installs; if it fails, `npm install --ignore-scripts` then verify node_modules intact |
| Lockfile churn large | Expected and legitimate — commit as-is, never hand-edit |

---

## Validation

```bash
npm run lint       # must complete non-interactively and pass
npm run typecheck  # must pass
npm run eval       # must pass with unchanged scores (no extractor changes)
```

---

## Acceptance Criteria

- [ ] `npm run lint` completes non-interactively with pass/fail (AC1)
- [ ] `npm run lint` passes on the current codebase, with any disabled rules explicitly commented (AC2)
- [ ] Config extends Next's recommended preset via flat config; script name `lint` unchanged; no more deprecated `next lint` (AC3)
- [ ] `npm run typecheck` and `npm run eval` still pass
- [ ] No drive-by refactors
