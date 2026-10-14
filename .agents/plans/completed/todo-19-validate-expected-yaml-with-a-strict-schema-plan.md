# Plan: TODO-19: Validate `expected.yaml` with a strict schema

## Summary

`eval/run.ts:50` reads each hand-written `eval/corpus/<slug>/expected.yaml` with `yamlLoad(...) as ExpectedSpec`. Nothing checks the keys, so a misspelt key drops a part of the spec, and the scorers give a missing part a full score: `scoreStructure` returns 1.0 for a missing spec (`eval/scoreStructure.ts:42-50`), and `combinedScore` substitutes the palette score for missing typography (`eval/score.ts:141`). This plan (GitHub issue #183, finding L4 of `.agents/reviews/codebase-analysis-review.md:35`) describes the spec with `z.strictObject` schemas, derives the `ExpectedSpec`, `ExpectedStructureSpec` and `ExpectedSectionEntry` types from them with `z.infer` (so the type and the schema cannot drift), and parses the YAML with `safeParse` at load. A spec that does not match stops the run with a message that names the file, the key and its path.

Measured while planning, on `main` at `43f524b`:

- `npm run eval` exits 0: `clean-light`, `dark-mode` and `adversarial-shell` at `combined 100%`, `aggregate combined: 100%`, `✓ all gates passed`. Start green, stay green.
- The silent path is real and wider than the two sites the issue names. The scratch check of the End-to-End Verification section misspells one key at a time in a disposable copy of `clean-light/expected.yaml`. On `main`, all ten misspellings (`typography`, `structure`, an extra top-level key, `bodyFamily`, `scale`, `expectedSections`, `expectedRegions`, `expectedComponents`, a key of a section entry, a key of a component entry) exit 0 at `combined 100%` with `✓ all gates passed`. With `UPDATE_BASELINE=1`, a spec whose `structure` key is misspelt prints `baseline updated (3 sites)`. The check prints 11 `FAIL` lines and exits 1 on `main`, so it shows the change.
- The issue's line numbers are stale after #182: the cast is still at `eval/run.ts:50`, the `ExpectedSpec` interface is at `eval/score.ts:14-25`, the structure types at `eval/scoreStructure.ts:3-15`, the missing-spec return at `eval/scoreStructure.ts:42-50`, and the typography substitution at `eval/score.ts:141` (the issue says `:136`).
- Zod 4.4.3 is installed and has `z.strictObject` and `z.prettifyError`. Probed on a schema of this shape: an unknown top-level key gives `✖ Unrecognized key: "typograhpy"`, a nested one gives `✖ Unrecognized key: "cuont"` followed by `  → at structure.expectedComponents.Card`, and a wrong value type gives `✖ Invalid input: expected number, received string` followed by `  → at typography.scale.h1`.
- js-yaml 5.2.1 already throws `expected a document, but the input is empty` on an empty file, so that case fails today and needs no code.
- The three committed specs use only keys that the schema below declares (each was read in full), so they pass unchanged.

Decisions:

- **The schemas live beside the types they replace.** `expectedSectionEntrySchema` and `expectedStructureSpecSchema` go in `eval/scoreStructure.ts`, `expectedSpecSchema` in `eval/score.ts`, in the `xSchema` + `z.infer` form of `lib/schema.ts:52-67`. The exported type names do not change, so `scoreTypography`, `scoreStructure` and `eval/run.ts` keep their signatures.
- **An invalid spec throws, and the run stops there.** `scoreSite` runs before every gate and before the `UPDATE_BASELINE` branch, so a throw from the loader cannot leave a refreshed baseline behind. `main().catch` (`eval/run.ts:215-218`) prints the error and exits 1. An invalid spec of an `optional` corpus entry fails the run too: the entry is skipped only when a file is absent.
- **Optional parts stay optional.** `typography`, `structure` and the fields inside them are optional in today's interfaces, and the weighting for a spec without them is documented behaviour (`eval/score.ts:128-133`). The issue asks that an unknown key fails, so the schema rejects unknown keys and wrong value types and does not start to require parts that the type allows to be absent.
- **Map keys stay free strings.** `palette`, `typography.scale` and `expectedComponents` are records keyed by role, token and component name. A misspelt name there is already loud: the scorer looks the name up, finds nothing, and reports a miss that lowers the score.
- **`as Capture` is out of scope.** `eval/run.ts:49` and `eval/stability.ts:62` keep their casts, and the `baseline` annotation at `eval/run.ts:173` stays: the issue's technical notes say that the fix covers the spec only.

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT |
| Complexity | LOW |
| Systems Affected | `eval/run.ts`, `eval/score.ts`, `eval/scoreStructure.ts`, `AGENTS.md`, `README.md` |
| GitHub Issue | #183 (finding L4 of `.agents/reviews/codebase-analysis-review.md:35`) |
| PRD Phase | N/A |
| Prototype Patch | N/A |

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `eval/scoreStructure.ts` | UPDATE | Replace the `ExpectedSectionEntry` and `ExpectedStructureSpec` interfaces with strict Zod schemas and inferred types |
| `eval/score.ts` | UPDATE | Replace the `ExpectedSpec` interface with `expectedSpecSchema` and an inferred type |
| `eval/run.ts` | UPDATE | Parse `expected.yaml` with `expectedSpecSchema.safeParse` at load; remove `as ExpectedSpec` |
| `AGENTS.md` | UPDATE | One sentence in the eval harness section and one row in Rules & Enforcements |
| `README.md` | UPDATE | One sentence in "Testing and evaluation" |

No change: `eval/corpus/*` (the three `expected.yaml` and `capture.json`), `eval/baseline.json`, `eval/fixtures/*`, `eval/corpus.ts`, `eval/capture.ts`, `eval/stability.ts`, `lib/**`, `package.json` (zod and js-yaml are already dependencies).

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Describe the structure spec with strict schemas

- **File**: `eval/scoreStructure.ts`
- **Action**: UPDATE
- **Implement**: Add `import { z } from "zod";`. Replace the two interfaces at lines 3-15 with:
  - `export const expectedSectionEntrySchema = z.strictObject({ name: z.string(), instances: z.number().optional() });` and `export type ExpectedSectionEntry = z.infer<typeof expectedSectionEntrySchema>;`
  - `export const expectedStructureSpecSchema = z.strictObject({ expectedRegions: z.array(z.string()).optional(), expectedComponents: z.record(z.string(), z.strictObject({ count: z.number().optional(), type: z.string().optional() })).optional(), expectedSections: z.array(expectedSectionEntrySchema).optional() });` and `export type ExpectedStructureSpec = z.infer<typeof expectedStructureSpecSchema>;`
  - Keep the DIST-028 doc comment on `expectedSections`. Change nothing in `scoreStructure` itself.
- **Mirror**: `lib/schema.ts:52-67` (`export const swatchSchema = z.object({...})`, then `export type Swatch = z.infer<typeof swatchSchema>`)
- **Validate**: `npm run typecheck`

### Task 2: Describe the whole spec with a strict schema

- **File**: `eval/score.ts`
- **Action**: UPDATE
- **Implement**: Add `import { z } from "zod";` and change line 3 from the type import to `import { expectedStructureSpecSchema } from "./scoreStructure";`. Replace the interface at lines 14-25 with `export const expectedSpecSchema = z.strictObject({ name: z.string(), bucket: z.string(), palette: z.record(z.string(), z.string()), typography: z.strictObject({ bodyFamily: z.string().optional(), scale: z.record(z.string(), z.number()).optional() }).optional(), structure: expectedStructureSpecSchema.optional() });` and `export type ExpectedSpec = z.infer<typeof expectedSpecSchema>;`. Keep the DIST-013 doc comment on `structure`, and add a comment above the schema that says why it is strict (an unknown key in a hand-written spec would drop a part that the scorers then count as a full score). Change nothing in `scorePalette`, `scoreTypography` or `combinedScore`.
- **Mirror**: `lib/schema.ts:52-67`
- **Validate**: `npm run typecheck`

### Task 3: Parse the spec at load

- **File**: `eval/run.ts`
- **Action**: UPDATE
- **Implement**: Add `import { z } from "zod";` and import `expectedSpecSchema` (a value) beside the `type ExpectedSpec` import from `./score`. Add a function above `scoreSite`:

  ```ts
  /** Reads a hand-written spec and rejects any key the schema does not know:
   *  a misspelt key would otherwise drop that part of the spec, and the
   *  scorers count a missing part as a full score. */
  function loadExpectedSpec(slug: string, expectedPath: string): ExpectedSpec {
    const parsed = expectedSpecSchema.safeParse(
      yamlLoad(readFileSync(expectedPath, "utf8")),
    );
    if (!parsed.success) {
      throw new Error(
        `eval/corpus/${slug}/expected.yaml does not match the spec schema:\n` +
          z.prettifyError(parsed.error),
      );
    }
    return parsed.data;
  }
  ```

  Replace line 50 with `const expected = loadExpectedSpec(slug, expectedPath);`. Leave line 49 (`as Capture`) and the rest of the file as they are.
- **Mirror**: `app/api/analyze/route.ts:120-129` (`safeParse`, then report the issues)
- **Validate**: `npm run typecheck && npm run lint && npm run eval` (the three sites stay at `combined 100%`), and `grep -c "as ExpectedSpec" eval/run.ts` prints `0`

### Task 4: Say in the docs that the spec is validated

- **File**: `AGENTS.md`, `README.md`
- **Action**: UPDATE
- **Implement**:
  - `AGENTS.md`, eval harness section: after the sentence that ends "and fails if any required corpus entry is missing its capture or expected spec.", add: "Each `expected.yaml` is parsed at load with the strict `expectedSpecSchema` (`eval/score.ts`), so a key the schema does not know — a misspelt `typography`, say — fails the run with a message that names it instead of dropping that part of the spec, which the scorers would count as a full score."
  - `AGENTS.md`, Rules & Enforcements: add the row `| Hand-written eval specs must not carry a key the scorer does not read | `expectedSpecSchema` (`z.strictObject`) parsed in `loadExpectedSpec` in `eval/run.ts` | Schema / Runtime validation (Level 2) |` after the row for `analyzeBodySchema.safeParse`.
  - `README.md`, "Testing and evaluation", first paragraph (line 190): add at its end: "Each `expected.yaml` is checked against a strict schema when it is loaded, so a misspelt key fails the run and names the key."
- **Mirror**: the existing row "Request payloads to `POST /api/analyze` must be validated before access" in the same table
- **Validate**: `npm run lint`

### Task 5: Prove the gate and run the full check

- **File**: none (scratch check outside the repository)
- **Action**: none
- **Implement**: Run the steps of the End-to-End Verification section, then `npm run check`.
- **Validate**: `bash "$S/probe-spec.sh" "$S/work"` prints 12 `PASS` lines and `failed cases: 0`; `npm run check` exits 0; `git diff --stat -- eval/corpus eval/baseline.json eval/fixtures` prints nothing

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Eval gate (the three committed specs, unchanged, at 100%)
npm run eval

# Everything CI runs: typecheck → lint → build → eval (no verify.sh instance may be up)
npm run check

# The cast is gone (prints 1 on main, 0 after the change)
grep -c "as ExpectedSpec" eval/run.ts

# The corpus, the baseline and the fixtures are untouched (prints nothing)
git diff --stat -- eval/corpus eval/baseline.json eval/fixtures
```

## End-to-End Verification

`npm run eval` reads only the three committed specs, which are valid, so it cannot show that an unknown key fails. The scratch check below does: it edits a disposable copy of the project, never the checkout (it refuses a directory that has `.git`).

`S` is the session's scratch directory, outside the repository.

### 1. Save the script as `$S/probe-spec.sh`

```bash
#!/usr/bin/env bash
# probe-spec.sh <tree>
# <tree> is a DISPOSABLE copy of the project (eval/, lib/, package.json,
# tsconfig.json and a node_modules link), never the checkout. The script
# misspells one key of <tree>/eval/corpus/clean-light/expected.yaml at a time
# and runs `npm run eval` there. A case passes when the run exits non-zero AND
# its output names the misspelt key. No misspelling is a substring of a valid
# key, so a message that names the right key cannot satisfy the grep.
set -u
tree="$(cd "$1" && pwd)"
if [ -e "$tree/.git" ]; then echo "refusing: $tree is a git checkout, pass a disposable copy"; exit 2; fi
spec="$tree/eval/corpus/clean-light/expected.yaml"
pristine="$(mktemp)"
cp "$spec" "$pristine"
fails=0

run_case() { # <label> <misspelt key> <sed expression>
  local label="$1" key="$2" expr="$3" out code
  cp "$pristine" "$spec"
  sed -i "$expr" "$spec"
  if cmp -s "$pristine" "$spec"; then echo "FAIL $label: the edit changed nothing"; fails=$((fails+1)); return; fi
  out="$(cd "$tree" && npm run eval 2>&1)"; code=$?
  if [ "$code" -ne 0 ] && printf '%s' "$out" | grep -q -- "$key"; then
    echo "PASS $label: exit $code, output names \"$key\""
    printf '%s\n' "$out" | grep -B1 -A1 -- "$key" | head -4 | sed 's/^/       | /'
  else
    echo "FAIL $label: exit $code, lines that name \"$key\": $(printf '%s\n' "$out" | grep -c -- "$key")"
    printf '%s\n' "$out" | tail -2 | sed 's/^/       | /'
    fails=$((fails+1))
  fi
}

run_case "top-level typography"         "typograhpy"        's/^typography:/typograhpy:/'
run_case "top-level structure"          "structrue"         's/^structure:/structrue:/'
run_case "top-level extra key"          "reviewedBy"        '$a reviewedBy: nobody'
run_case "typography.bodyFamily"        "bodyFamly"         's/^  bodyFamily:/  bodyFamly:/'
run_case "typography.scale"             "scael"             's/^  scale:/  scael:/'
run_case "structure.expectedSections"   "expectedSectoins"  's/^  expectedSections:/  expectedSectoins:/'
run_case "structure.expectedRegions"    "expectedRegoins"   's/^  expectedRegions:/  expectedRegoins:/'
run_case "structure.expectedComponents" "expectedComponets" 's/^  expectedComponents:/  expectedComponets:/'
run_case "section entry"                "instanses"         's/- { name: Hero }/- { name: Hero, instanses: 1 }/'
run_case "component entry"              "cuont"             's/SectionCard: { count: 6 }/SectionCard: { cuont: 6 }/'

# An invalid spec must stop the run before UPDATE_BASELINE writes a baseline.
cp "$pristine" "$spec"
sed -i 's/^structure:/structrue:/' "$spec"
out="$(cd "$tree" && UPDATE_BASELINE=1 npm run eval 2>&1)"; code=$?
if [ "$code" -ne 0 ] && ! printf '%s' "$out" | grep -q "baseline updated"; then
  echo "PASS UPDATE_BASELINE with an invalid spec: exit $code, no baseline written"
else
  echo "FAIL UPDATE_BASELINE with an invalid spec: exit $code, 'baseline updated' printed: $(printf '%s\n' "$out" | grep -c "baseline updated")"
  fails=$((fails+1))
fi

# Control: the unchanged spec passes the gate.
cp "$pristine" "$spec"
out="$(cd "$tree" && npm run eval 2>&1)"; code=$?
if [ "$code" -eq 0 ] && printf '%s' "$out" | grep -q "all gates passed"; then
  echo "PASS control: unchanged spec, exit 0, all gates passed"
else
  echo "FAIL control: unchanged spec, exit $code"; printf '%s\n' "$out" | tail -6 | sed 's/^/       | /'; fails=$((fails+1))
fi
rm -f "$pristine"
echo "failed cases: $fails"
[ "$fails" -eq 0 ]
```

### 2. Red on the unchanged code (measured while planning)

```bash
mkdir -p "$S/head" && git archive main | tar -x -C "$S/head"
ln -s "$PWD/node_modules" "$S/head/node_modules"
bash "$S/probe-spec.sh" "$S/head"
```

Result on `main` at `43f524b`: 11 `FAIL` lines (each of the ten misspellings: `exit 0`, key named on 0 lines; `UPDATE_BASELINE with an invalid spec: exit 0, 'baseline updated' printed: 1`), `PASS control`, `failed cases: 11`, script exit 1. `git archive` reads the committed tree and writes outside the repository, so it does not touch the working tree or the owner's stash.

### 3. Green after the change (second acceptance criterion)

```bash
mkdir -p "$S/work" && cp -r eval lib package.json tsconfig.json "$S/work/"
ln -s "$PWD/node_modules" "$S/work/node_modules"
bash "$S/probe-spec.sh" "$S/work"
```

Expected: 12 `PASS` lines, `failed cases: 0`, script exit 0. Each of the ten misspelling lines is followed by the quoted lines of the run that name the key, e.g. `Unrecognized key: "typograhpy"`, and for a nested key the path line (`→ at structure.expectedComponents.SectionCard`).

### 4. The committed specs still pass, unchanged (first and third acceptance criteria)

```bash
npm run eval                                   # three sites at combined 100%, ✓ all gates passed
grep -c "as ExpectedSpec" eval/run.ts          # 0
git diff --stat -- eval/corpus eval/baseline.json eval/fixtures   # prints nothing
npm run check                                  # exits 0
```

### 5. Clean up

```bash
rm -rf "$S/head" "$S/work" "$S/probe-spec.sh"
```

## Acceptance Criteria

- [ ] `expected.yaml` is parsed with a strict Zod schema at load, and `as ExpectedSpec` is gone (`grep -c "as ExpectedSpec" eval/run.ts` prints 0).
- [ ] A spec with an unknown key fails `npm run eval` with a message that names the key (`probe-spec.sh` on a copy of the changed tree: 12 `PASS`, `failed cases: 0`).
- [ ] `npm run eval` passes with the three committed specs unchanged (`git diff --stat -- eval/corpus eval/baseline.json eval/fixtures` prints nothing).
- [ ] An invalid spec cannot refresh the baseline (the `UPDATE_BASELINE` case of `probe-spec.sh`).
- [ ] `npm run check` exits 0.
- [ ] `AGENTS.md` and `README.md` say that the spec is validated.
