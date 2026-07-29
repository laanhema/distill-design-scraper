# Plan: Drop the redundant, version-mismatched `@types/js-yaml`

## Summary

The project runs `js-yaml@^5.2.1` (dependencies), which since v5 ships its own bundled TypeScript declarations — but `devDependencies` still carries `@types/js-yaml@^4.0.9`, a global type-reference package describing the *v4* API surface. This is dead weight: `--traceResolution` already shows TS resolving `js-yaml`'s own `.d.ts`, not the `@types` package. The fix is a pure dependency removal — drop the one line from `package.json`, regenerate `package-lock.json` via `npm install` against a clean `node_modules`, update the PRD §8 stack-table parenthetical to reflect the removal (past tense, not "is redundant"), and verify the four consuming commands (`typecheck`, `lint`, `eval`, `build`) all still pass from a fresh install. No source files import `@types/js-yaml` directly (nothing ever does — `@types` packages are ambient/global), so no `lib/`, `app/`, or `eval/` code changes are needed; only `js-yaml`'s named exports (`load`, `dump`) are imported, in `eval/run.ts:3` and `lib/emit.ts:1`, and those keep working unchanged since they now resolve against the bundled v5 types instead of the removed `@types` shim.

## User Story

As a maintainer
I want type definitions to come from one place at the right version
So that TypeScript isn't fed a v4 global type-reference describing a library the project runs at v5

## Metadata

| Field | Value |
|-------|-------|
| Type | REFACTOR (dependency cleanup) |
| Complexity | LOW |
| Systems Affected | `package.json`, `package-lock.json`, `.agents/PRDs/PRD.md` §8 |
| GitHub Issue | #103 |

---

## Patterns to Follow

### Current redundant declaration
```
// SOURCE: package.json:20 (dependencies) and package.json:32 (devDependencies)
"js-yaml": "^5.2.1",          // dependencies — the real runtime package, ships its own .d.ts since v5
...
"@types/js-yaml": "^4.0.9",   // devDependencies — stale v4 ambient types, to be removed
```

### Consumers (unaffected by the removal — named-export imports, not ambient global usage)
```
// SOURCE: lib/emit.ts:1
import { dump as yamlDump } from "js-yaml";
```
```
// SOURCE: eval/run.ts:3
import { load as yamlLoad } from "js-yaml";
```

### A same-shaped transitive dependency to NOT touch
```
// SOURCE: package-lock.json:621-652 (node_modules/@eslint/eslintrc/node_modules/js-yaml)
"js-yaml": "^4.3.0"   // this is eslint's OWN nested js-yaml runtime dependency (not @types/js-yaml,
                       // and not the project's top-level package) — untouched by this change, will
                       // still appear in the regenerated lockfile under @eslint/eslintrc's subtree.
```

### PRD §8 stack-table row to update
```
// SOURCE: .agents/PRDs/PRD.md:203
| Serialization | js-yaml ^5.2 (ships its own types; the `@types/js-yaml@4` devDependency is redundant — §12 Phase 7 / P1-6) | Frontmatter emit |
```
This parenthetical currently describes the problem as still-present ("is redundant"). Per the issue's acceptance criterion, it must be updated to reflect the removal having happened — e.g. drop the parenthetical entirely (the row is clean once the dependency is gone) or reword to past tense noting P1-6 was resolved. Prefer dropping it: every other stack-table row is a plain "why" cell with no embedded backlog reference once the issue is closed, and PRD.md:374 (§12 Phase 7 P1 audit list) already carries the historical record of the finding — no need to duplicate that pointer in §8 permanently. If precedent from a prior remediation exists for how a resolved P1/P2 audit item's PRD row is phrased after landing, check nearby completed plans (e.g. `dist-052-remove-analyze-url-structure-plan.md`, `dist-054-rename-populate-missing-component-defs-plan.md`) for the convention used and mirror it.

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `package.json` | UPDATE | Remove the `"@types/js-yaml": "^4.0.9"` line from `devDependencies` |
| `package-lock.json` | UPDATE (regenerated) | Re-run `npm install` after the `package.json` edit so the lockfile drops the `@types/js-yaml` entry and its resolved/integrity metadata; commit the regenerated file, not a hand edit |
| `.agents/PRDs/PRD.md` | UPDATE | §8 serialization row (line 203): remove/reword the "is redundant" parenthetical about `@types/js-yaml` to reflect the dependency has been dropped |

No `lib/`, `app/`, or `eval/` source files change — `@types/js-yaml` is a pure ambient-types devDependency with no explicit import anywhere in the codebase (confirmed via grep: only `js-yaml` itself is imported, in `lib/emit.ts:1` and `eval/run.ts:3`).

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Remove `@types/js-yaml` from `package.json`

- **File**: `package.json`
- **Action**: UPDATE
- **Implement**: Delete the `"@types/js-yaml": "^4.0.9",` line from the `devDependencies` block (currently line 32, between `@types/culori` and `@types/node`). Leave every other dependency untouched — do not bump `js-yaml` itself, it already correctly reads `^5.2.1` in `dependencies`.
- **Mirror**: N/A — single-line deletion in a JSON file; keep valid JSON (no trailing comma left behind on the preceding line).
- **Validate**: `node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"` (confirms valid JSON) — full validation happens in Task 3.

### Task 2: Regenerate `package-lock.json` against a clean install

- **File**: `package-lock.json`
- **Action**: UPDATE (regenerated, not hand-edited)
- **Implement**: With `package.json` already edited (Task 1), remove the existing `node_modules` and run a fresh `npm install` so npm re-resolves the dependency tree without `@types/js-yaml` and rewrites the lockfile's `packages` map accordingly (both the top-level `"devDependencies"` entry pointing at `@types/js-yaml` and the `node_modules/@types/js-yaml` package block should disappear; the unrelated nested `node_modules/@eslint/eslintrc/node_modules/js-yaml` entry for eslint's own v4 runtime dependency must remain — do not touch it).
  ```bash
  rm -rf node_modules
  npm install
  ```
  Using `npm install` (not `npm ci`) here is deliberate and necessary: `npm ci` requires the lockfile to already match `package.json` and would fail/refuse to update it after a manual `package.json` edit. `npm install` is what actually regenerates `package-lock.json`'s content to drop the removed package. After this, the *acceptance criteria's* clean-install check (`npm ci` + `npm run typecheck`) validates that the newly-committed lockfile is itself `npm ci`-consistent — run that as a separate step in Task 3, not as the regeneration step itself.
- **Mirror**: Standard npm lockfile regeneration flow; no repo-specific script for this.
- **Validate**: `grep -n "@types/js-yaml" package-lock.json` returns nothing; `grep -n "node_modules/@eslint/eslintrc/node_modules/js-yaml" package-lock.json` still returns a match (proves the unrelated nested js-yaml survived).

### Task 3: Update PRD §8 serialization row

- **File**: `.agents/PRDs/PRD.md`
- **Action**: UPDATE
- **Implement**: On line 203, remove the now-stale parenthetical about the redundant `@types/js-yaml` dependency (it describes an unresolved problem; the problem is resolved after Tasks 1–2). Replace:
  ```
  | Serialization | js-yaml ^5.2 (ships its own types; the `@types/js-yaml@4` devDependency is redundant — §12 Phase 7 / P1-6) | Frontmatter emit |
  ```
  with a clean row, e.g.:
  ```
  | Serialization | js-yaml ^5.2 (ships its own types) | Frontmatter emit |
  ```
  Also check `.agents/PRDs/PRD.md:374` (the §12 Phase 7 P1 audit checklist item for this exact finding) — per repo convention for closed audit items, either check it off (`- [x]`) or leave it as the historical record per whatever convention prior completed plans (`dist-052`, `dist-054`) established for their corresponding audit-list rows. Match that convention; don't invent a new one.
- **Mirror**: `.agents/PRDs/PRD.md` §12 Phase 7 audit list formatting for other already-resolved items (check how prior DIST-05x completions marked their own audit rows, if at all).
- **Validate**: `grep -n "js-yaml" .agents/PRDs/PRD.md` shows only the clean stack-table row (and the historical audit-list line, marked per the convention above) — no leftover "@types/js-yaml@4" or "is redundant" wording.

---

## Validation

```bash
# From a genuinely clean install (per issue's technical note: verify against fresh install, not stale node_modules)
rm -rf node_modules
npm ci
npm run typecheck
npm run lint
npm run eval
npm run build

# Confirm resolution now points only at bundled v5 declarations
npx tsc --noEmit --traceResolution 2>&1 | grep -i "js-yaml"
```

## End-to-End Verification

1. `git diff package.json` shows only the single-line removal of `"@types/js-yaml": "^4.0.9",` from `devDependencies`; `js-yaml` in `dependencies` is untouched.
2. `git diff --stat package-lock.json` shows it changed (regenerated); `grep -c "@types/js-yaml" package-lock.json` returns `0`.
3. `rm -rf node_modules && npm ci` succeeds cleanly (proves the regenerated lockfile is internally consistent and installable without the manual `package.json` edit being "ahead of" the lockfile).
4. `npm run typecheck` passes with zero errors, notably none referencing `js-yaml` or a missing type declaration.
5. `npx tsc --noEmit --traceResolution 2>&1 | grep -i js-yaml` shows resolution entries only under `node_modules/js-yaml/` (the bundled v5 `.d.ts`, e.g. a path like `node_modules/js-yaml/dist/js-yaml.d.ts` or similar per v5's actual layout) — no `node_modules/@types/js-yaml` path appears at all.
6. `npm run lint`, `npm run eval`, and `npm run build` all pass (the eval harness and build both exercise `lib/emit.ts`'s `yamlDump` call and `eval/run.ts`'s `yamlLoad` call at runtime, so a genuine type or resolution break would surface here, not just in `tsc`).
7. `grep -n "js-yaml" .agents/PRDs/PRD.md` — line 203 no longer says "is redundant"; content reads as a resolved, clean stack-table entry.

---

## Risks

| Risk | Mitigation |
|------|------------|
| `npm install` (used to regenerate the lockfile) also picks up unrelated upstream version bumps for other `^`-ranged dependencies, producing lockfile noise beyond the intended `@types/js-yaml` removal | In scope to check, out of scope to fix: after regenerating, run `git diff package-lock.json` and confirm the diff is limited to the `@types/js-yaml` removal plus its own dependency subtree; if npm also bumped unrelated transitive packages within their existing semver ranges that's expected/harmless lockfile churn from a fresh resolve and can be left as-is, but if anything outside the `@types/js-yaml` blast radius looks like an unexpected major-version jump, flag it rather than silently shipping it in this cleanup-scoped change. |
| `npm ci` after removing `node_modules` re-triggers the `postinstall` Playwright Chromium download, which is slow/network-dependent in a sandboxed or offline verification environment | Expected and required by the issue's own acceptance criteria ("clean npm ci" + fresh-install verification) — budget time for it; if Playwright download is unavailable in the execution sandbox, note that `npm run typecheck`/`lint`/`eval`/`build` don't actually need Chromium (the eval harness replays committed JSON captures, not live browser renders per `eval/run.ts`), so a Playwright download failure specifically should not be treated as this change's fault, though `npm ci` itself completing is still the acceptance bar. |
| Hand-editing `package-lock.json` instead of regenerating it (e.g. to save time) would leave stale `integrity`/`resolved` metadata or miss the dependency-graph-wide ripple (e.g. `@types/js-yaml`'s own removed sub-dependencies) | Explicitly out of scope — the issue's technical note is explicit that the lockfile "must be regenerated," not hand-patched; Task 2 mandates `npm install` after the `package.json` edit for exactly this reason. |
| The PRD §12 Phase 7 audit-list line (PRD.md:374) is left unchecked/unedited, causing the PRD's "P1 redundancy" section to still list a finding that's actually resolved | In scope: Task 3 explicitly calls out checking this line against whatever convention prior closed DIST-05x items used in that same list, so the PRD doesn't drift out of sync with actual resolved state. |

---

## Acceptance Criteria

- [ ] `@types/js-yaml` absent from `package.json` devDependencies
- [ ] `package-lock.json` regenerated (not hand-edited) and free of any `@types/js-yaml` reference, while the unrelated nested `@eslint/eslintrc` → `js-yaml@4.3.0` transitive entry is preserved
- [ ] Clean `npm ci` + `npm run typecheck` passes with no `js-yaml`-related errors
- [ ] `npx tsc --noEmit --traceResolution` grepped for `js-yaml` shows resolution only at the bundled v5 declarations (no `@types/js-yaml` path)
- [ ] `npm run lint`, `npm run eval`, and `npm run build` all pass
- [ ] PRD §8 serialization row (`.agents/PRDs/PRD.md:203`) updated to drop/reword the "redundant" parenthetical
- [ ] PRD §12 Phase 7 P1 audit item (`.agents/PRDs/PRD.md:374`) reconciled per repo convention for resolved audit findings
