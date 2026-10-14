# Code Review: feature/todo-20-make-corpus-entry-a-union

**Scope**: branch `feature/todo-20-make-corpus-entry-a-union` vs `main` (merge base `ac00d9b`, branch tip equals `main`; all work is uncommitted in the working tree: `AGENTS.md`, `eval/capture.ts`, `eval/corpus.ts`, plus the untracked plan and implementation report under `.agents/`), checked against issue #184
**Recommendation**: APPROVE WITH NITS

## Summary

The change replaces the `CorpusEntry` interface's two optional source fields with an unexported `CorpusEntryBase` joined to a `{ fixture: string } | { url: string }` union, narrows with `"fixture" in entry` in `eval/capture.ts` (one narrowing yields both the render target and `source.ref`), and adds one Rules & Enforcements row to `AGENTS.md`. The refactor is small and behaviour-preserving for every entry that exists: for a fixture entry `ref` was `entry.url ?? entry.fixture!` = fixture and is now fixture; for a URL entry both were and are the URL. The only other `CORPUS` consumers, `eval/run.ts:145` and `eval/stability.ts:102`, read only `slug` and `optional`, so they are unaffected. All three files were reviewed in full.

Acceptance criteria:

- **An entry has either `fixture` or `url`; one with neither does not compile** — met. An independent type probe in the scratchpad (`@ts-expect-error` on `{ slug, bucket }` typed `CorpusEntry`) compiles with exit 0 against the branch's `eval/corpus.ts` and fails against `main`'s with `TS2578: Unused '@ts-expect-error' directive`.
- **`eval/capture.ts` narrows with `in` and has no `!` on `entry.url` or `entry.fixture`** — met. `eval/capture.ts:24` and `:71` use `"fixture" in …`; `grep -cE 'entry\.(url|fixture)!' eval/capture.ts` prints `0` (prints `2` on `main`). The same probe's `"fixture" in e ? e.fixture : e.url` returns `string` on the branch and fails on `main` with two `TS2322`.
- **`npm run eval` passes** — met. `npm run check` (whose last step is `npm run eval`) exits 0: `clean-light`, `dark-mode`, `adversarial-shell` at combined 100%, `✓ all gates passed`. `git diff --stat main -- eval/corpus eval/baseline.json eval/fixtures` is empty.

## Issues Found

### Critical
None

### High Priority
None

### Medium Priority
None

### Suggestions (Low)

- **L1** `eval/corpus.ts:27` — The doc comment on the union says "Exactly one source", but the type accepts an entry that sets both `fixture` and `url` (the probe's `{ …, fixture: "a.html", url: "https://a" }` compiles), and `captureEntry` then silently uses the fixture. **Why:** a reader trusting the comment will believe the compiler enforces exactly-one, which it does not; the plan records this limit but the code does not. **Fix:** reword it to what the type enforces, e.g. `/** One source: a committed local fixture, or a live URL. An entry with neither does not compile; with both, capture uses the fixture. */`.

**Noted, not a finding**: Rejecting an entry that sets both fields at compile time is not done. Criterion 1's "either … or" could be read as exactly-one, but the issue's own second criterion requires narrowing with `in`, and the run's reason holds: adding `url?: never` / `fixture?: never` makes `"fixture" in e` keep both members in the true branch, so `e.fixture` stays `string | undefined` (recorded in the plan and in the implementation comment on #184 with TypeScript 5.9.3). No entry sets both today. Left for the owner to decide whether exactly-one needs a separate check on the `CORPUS` literal.

## Validation Results

| Check | Status | Notes |
|-------|--------|-------|
| Build / Type Check | PASS | `npm run check` (typecheck → lint → build → eval), the command CI runs; host, exit 0. `tsc --noEmit` and `next build` steps clean. No `verify.sh` instance was running. |
| Warnings | NONE | No `error`/`warn` lines in the full `npm run check` log. |
| Lint | PASS | `eslint .` step of `npm run check`; host. |
| Tests | PASS | `npm run eval` step of `npm run check`; host: 3 required fixtures scored at combined 100%; 3 optional live entries (`stripe`, `linear`, `vercel`) skipped by design (`optional: true`, no committed capture). The eval gate does not import `eval/capture.ts`, so the changed narrowing is covered by the type probe above (red on `main`, green on the branch), not by eval. The URL branch of `captureEntry` was not executed (live capture needs the network). |
| UI verification | N/A | No UI change; the change touches only the offline eval harness types and capture script. |

## What's Good

- One narrowing produces both `target` and `ref`, which removes both non-null assertions without duplicating the branch.
- `CorpusEntry` keeps its name and export, so `eval/run.ts` and `eval/stability.ts` need no edit.
- The default filter `"fixture" in e` is a real type-level check rather than a truthiness test on a string.
- The plan and implementation comment state the both-fields trade-off with evidence instead of hiding it.

## Recommendation

Mergeable as is; optionally apply L1 (`/fix-findings .agents/reviews/feature-todo-20-make-corpus-entry-a-union-review.md L1`) so the comment matches what the type enforces.
