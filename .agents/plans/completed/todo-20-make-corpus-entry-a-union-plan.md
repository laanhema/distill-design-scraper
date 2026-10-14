# Plan: TODO-20: Make `CorpusEntry` a union of fixture and URL entries

## Summary

`CorpusEntry` (`eval/corpus.ts:14-29`) declares `fixture?` and `url?` as two optional fields although every entry needs one of them, so `eval/capture.ts` needs `entry.url!` (`:25`) and `entry.fixture!` (`:48`), and an entry with neither compiles and reaches `page.goto(undefined)`. This plan (GitHub issue #184, finding L5 of `.agents/reviews/codebase-analysis-review.md:36`) splits the type into a shared `CorpusEntryBase` (slug, bucket, optional) and the union `(CorpusEntryBase & { fixture: string }) | (CorpusEntryBase & { url: string })`, then narrows with `"fixture" in entry` at the three sites in `eval/capture.ts` that read the two fields: the render target, the capture's `source.ref`, and the default fixture-only filter in `selectEntries`.

Measured while planning, on `main` at `ac00d9b`:

- `npm run eval` exits 0: `clean-light`, `dark-mode`, `adversarial-shell` at `combined 100%`, `skipped (no capture/expected): stripe, linear, vercel`, `✓ all gates passed`. Start green, stay green. `eval/run.ts` and `eval/stability.ts` read only `entry.slug` and `entry.optional`, so the gate does not run the changed code: `eval/capture.ts` is run only by `npm run eval:capture`. The End-to-End Verification below adds a type-level probe and a scratch capture run that do run it.
- The issue's line numbers are a little stale: the second assertion is at `eval/capture.ts:48` (the issue says `:47`), and the `e.fixture` filter is at `:70`. `grep -cE 'entry\.(url|fixture)!' eval/capture.ts` prints `2` on `main`.
- TypeScript 5.9.3, probed in the scratch directory on both union shapes:
  - `(Base & { fixture: string }) | (Base & { url: string })`: an entry with neither field fails (`TS2322 ... Property 'url' is missing`), and `"fixture" in e ? e.fixture : e.url` narrows to `string` on both branches. An entry with both fields compiles.
  - The same with `url?: never` / `fixture?: never` added: an entry with both fields fails too, but `"fixture" in e` no longer narrows (an optional property keeps the member in both branches), so `e.fixture` stays `string | undefined` (`TS2322`). That breaks the second acceptance criterion.
- The type-level probe in End-to-End Verification step 1 fails on `main` with `TS2578: Unused '@ts-expect-error' directive` and two `TS2322: Type 'string | undefined' is not assignable to type 'string'`, so it shows the change.

Decisions:

- **The plain union, without `never` fields.** It is the shape the issue and the review name, and the only one of the two that `in` narrows. An entry that sets both fields still compiles. No acceptance criterion covers it, no entry does it, and `eval/capture.ts` keeps today's behaviour for it (the fixture wins).
- **`CorpusEntryBase` stays unexported**; `CorpusEntry` keeps its name and export, so `eval/run.ts` and `eval/stability.ts` do not change.
- **One Rules & Enforcements row in `AGENTS.md`**, as the earlier TODO plans did for a new type-level rule.

## Metadata

| Field | Value |
|-------|-------|
| Type | REFACTOR |
| Complexity | LOW |
| Systems Affected | `eval/corpus.ts`, `eval/capture.ts`, `AGENTS.md` |
| GitHub Issue | #184 (finding L5 of `.agents/reviews/codebase-analysis-review.md:36`) |
| PRD Phase | N/A |
| Prototype Patch | N/A |

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `eval/corpus.ts` | UPDATE | Replace the `CorpusEntry` interface with a shared base and a two-member union |
| `eval/capture.ts` | UPDATE | Narrow with `"fixture" in entry`; remove both `!` and the `e.fixture` truthiness filter |
| `AGENTS.md` | UPDATE | One row in Rules & Enforcements |

No change: `eval/run.ts`, `eval/stability.ts`, `eval/corpus/*`, `eval/baseline.json`, `eval/fixtures/*`, `lib/**`.

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Make `CorpusEntry` a union

- **File**: `eval/corpus.ts`
- **Action**: UPDATE
- **Implement**: Replace the interface at lines 14-29 with an unexported `interface CorpusEntryBase { slug; bucket; optional? }` (same fields, same `bucket` literals, keep the `optional` doc comment) and

  ```ts
  /** Exactly one source: a committed local fixture, or a live URL. */
  export type CorpusEntry =
    | (CorpusEntryBase & {
        /** Local fixture filename under eval/fixtures (offline, committed capture). */
        fixture: string;
      })
    | (CorpusEntryBase & {
        /** Live reference URL (captured on demand; capture git-ignored). */
        url: string;
      });
  ```

  Leave the header comment and the `CORPUS` array as they are (every entry already sets exactly one field).
- **Mirror**: the header comment of `eval/corpus.ts:5-11`, which already describes the two kinds of entry
- **Validate**: `npm run typecheck` (fails until Task 2 removes the `e.fixture` access on the union; that is expected)

### Task 2: Narrow with `in` in the capture script

- **File**: `eval/capture.ts`
- **Action**: UPDATE
- **Implement**:
  - In `captureEntry`, replace lines 23-25 with one narrowing that yields both values:

    ```ts
    const { target, ref } =
      "fixture" in entry
        ? { target: new URL(`fixtures/${entry.fixture}`, import.meta.url).href, ref: entry.fixture }
        : { target: entry.url, ref: entry.url };
    ```

    and change line 48 to `ref,`. `ref` keeps today's value: the fixture filename for a fixture entry, the URL for a URL entry.
  - In `selectEntries`, change line 70 to `return CORPUS.filter((e) => "fixture" in e);`.
- **Mirror**: `"fixture" in e ? e.fixture : e.url` as probed (see Summary)
- **Validate**: `npm run typecheck && npm run lint`, and `grep -cE 'entry\.(url|fixture)!' eval/capture.ts` prints `0`

### Task 3: Record the rule

- **File**: `AGENTS.md`
- **Action**: UPDATE
- **Implement**: In Rules & Enforcements, after the row "Verification and test automation scripts must be strictly typechecked", add: `| An eval corpus entry must name a local fixture or a live URL | `CorpusEntry` union in `eval/corpus.ts`, narrowed with `in` in `eval/capture.ts` | Types (Level 2) |`
- **Mirror**: `AGENTS.md:75` (the existing Types (Level 2) row)
- **Validate**: `npm run lint`

### Task 4: Prove it and run the full check

- **File**: none (scratch checks; see End-to-End Verification)
- **Action**: none
- **Implement**: Run End-to-End Verification steps 1-4, then `npm run check`.
- **Validate**: the probe exits 0; the scratch capture prints three `ok` lines; `npm run check` exits 0; `git diff --stat -- eval/corpus eval/baseline.json eval/fixtures` prints nothing

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Eval gate (unchanged, three sites at 100%)
npm run eval

# Everything CI runs (no verify.sh instance may be up)
npm run check

# The assertions are gone (prints 2 on main, 0 after)
grep -cE 'entry\.(url|fixture)!' eval/capture.ts

# Corpus, baseline and fixtures untouched (prints nothing)
git diff --stat -- eval/corpus eval/baseline.json eval/fixtures
```

## End-to-End Verification

`npm run eval` never imports `eval/capture.ts`, so these steps exercise it directly. `S` is the session's scratch directory, outside the repository.

### 1. Type-level probe (first and second acceptance criteria)

Save as `$S/typeprobe/probe-corpus-types.ts` (the import path is the checkout's absolute path):

```ts
// Type-level probe for #184. Compiles clean only when CorpusEntry is a union
// of a fixture entry and a URL entry that `in` narrows.
import type { CorpusEntry } from "/home/lauri/github/distill-design-scraper/eval/corpus";

// @ts-expect-error -- an entry with neither `fixture` nor `url` must not compile
export const neither: CorpusEntry = { slug: "x", bucket: "hostile" };

export const fixtureEntry: CorpusEntry = { slug: "x", bucket: "hostile", fixture: "x.html" };
export const urlEntry: CorpusEntry = { slug: "x", bucket: "hostile", url: "https://example.com" };

// `in` must narrow to a definite string on both branches.
export function target(e: CorpusEntry): string {
  return "fixture" in e ? e.fixture : e.url;
}
```

and `$S/typeprobe/probe-corpus-types.sh`:

```bash
#!/usr/bin/env bash
# probe-corpus-types.sh <repo> <probe.ts> — exit 0 when the union is in place.
set -u
"$1/node_modules/.bin/tsc" --noEmit --strict --skipLibCheck --target es2022 --module esnext --moduleResolution bundler "$2"
```

Run `bash $S/typeprobe/probe-corpus-types.sh "$PWD" $S/typeprobe/probe-corpus-types.ts`. On `main` (dry-run while planning): exit 2 with `TS2578: Unused '@ts-expect-error' directive` and two `TS2322`. After the change: no output, exit 0.

### 2. Scratch capture run (the script still works at runtime)

A scratch copy of the changed `eval/capture.ts` that writes to the scratch directory instead of `eval/corpus/`. It has to sit inside the project so that `tsx` resolves `node_modules` and the `@/` alias (AGENTS.md, "Manually verifying extraction changes"), and it is deleted right after:

```bash
sed 's#here(`corpus/${entry.slug}`)#`${process.env.PROBE_OUT}/${entry.slug}`#' eval/capture.ts > eval/capture-probe.scratch.ts
grep -c 'PROBE_OUT' eval/capture-probe.scratch.ts          # must print 1, else stop: the copy would write into eval/corpus
PROBE_OUT="$S/capout" npx tsx eval/capture-probe.scratch.ts  # no args: the default fixture-only selection
rm eval/capture-probe.scratch.ts
```

Expected: `Capturing clean-light… ok (N nodes)`, the same for `dark-mode` and `adversarial-shell`, and no live entry (the default filter now uses `"fixture" in e`). Headless Chromium on `file://` fixtures only, no network. Then check `$S/capout/clean-light/capture.json` has `source.ref` `clean-light.html` and a `finalUrl` ending in `eval/fixtures/clean-light.html`:

```bash
node -e 'const c=require(process.argv[1]);console.log(c.source.ref, c.finalUrl)' "$S/capout/clean-light/capture.json"
```

The URL branch is covered by step 1 only: capturing `stripe`, `linear` or `vercel` would hit the network.

### 3. Gate and corpus untouched (third acceptance criterion)

```bash
npm run eval                                                   # three sites at combined 100%, ✓ all gates passed
grep -cE 'entry\.(url|fixture)!' eval/capture.ts               # 0
git diff --stat -- eval/corpus eval/baseline.json eval/fixtures   # prints nothing
git status --short                                             # no capture-probe.scratch.ts
```

### 4. Clean up

```bash
rm -rf "$S/typeprobe" "$S/capout"
```

## Acceptance Criteria

- [ ] An entry has either `fixture` or `url`; one with neither does not compile (probe step 1 exits 0, its `@ts-expect-error` is used).
- [ ] `eval/capture.ts` narrows with `in` and has no `!` on `entry.url` or `entry.fixture` (`grep -cE 'entry\.(url|fixture)!' eval/capture.ts` prints 0).
- [ ] The scratch capture run captures the three fixtures and no live entry.
- [ ] `npm run eval` passes, and `eval/corpus`, `eval/baseline.json`, `eval/fixtures` are unchanged.
- [ ] `npm run check` exits 0.
