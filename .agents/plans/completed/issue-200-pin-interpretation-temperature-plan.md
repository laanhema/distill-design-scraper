# Plan: #200: Pin the interpretation lane's temperature so `npm run eval:ai` is stable

## Summary

`npm run eval:ai` (`eval/stability.ts`) fails its stability floors on unchanged `main` because **the interpretation request sends no `temperature`**. The routed model therefore samples at its default (1.0 on Gemini) and words the same reading differently on each run. The replies are on topic every time ("clean", "calm", "professional", "The Architect"), but the adjective lists and archetype lines differ word for word, and the score is a word-level Jaccard. No `temperature` has been sent since the project began (`git log -S temperature -- lib`). The floors (`eval/stability.ts:22-24`) date from the first commit (`4936522`), when the lane targeted `claude-opus-4-8`, and that lane never ran live (`.agents/PRDs/PRD.md:331`). So no live model at its default temperature was ever used to calibrate them.

The fix adds an optional `temperature` field to `ModelCall`, which `callModel` sends only when a lane sets it. The interpretation lane sets it to `0` through a named constant. The structure lanes are unchanged. The floors, `RUNS`, the prompt and the measure are unchanged, which meets the issue's third acceptance criterion: no threshold is lowered.

The code change was prototyped while planning and saved as a patch (see Metadata). The patch covers `lib/aiLane.ts` and `lib/interpret.ts`. The tasks below cover what the patch leaves: the reproduction probe, the comment in `eval/stability.ts`, the orchestration write-up, and the live and full-gate checks. Every `file:line` in this plan is a line of HEAD (`e7f8d9a`) before the patch.

Measured while planning (outputs in Environment Findings and Evidence):

- **Reproduced on HEAD.** One `npm run eval:ai` run as written exited 1, with `clean-light` 0.35 / 0.42 and `dark-mode` 0.28 / 0.29 (adjectives / archetype). Together with the three runs reported in #200, the last 4 runs on `main` all failed.
- **The prototype passes, twice.** With `temperature: 0` on the interpretation lane, two runs exited 0. The lowest scores across both runs were 0.79 for adjectives and 0.63 for archetype, against floors of 0.5 and 0.3.
- **An offline probe shows the change in the request body.** It stubs `fetch`, needs no key and no network, exits 1 on HEAD and exits 0 on the prototype.
- **Both the configured model and the default model accept `temperature`.** OpenRouter's public model list lists `temperature` in `supported_parameters` for `google/gemini-2.5-flash` (this host's `OPENROUTER_MODEL`) and for `google/gemini-3.5-flash` (the code default).

Decisions:

- **Temperature 0, not a small non-zero value.** The identity is a reading of measured tokens and one screenshot, not a creative draft. Determinism is what the stability check asks for, and 0 measured well clear of both floors. See the Open Question for the alternative.
- **Interpretation lane only.** `npm run eval:ai` measures only this lane, and #200 is about this lane. The two structure lanes have no stability check, and changing them without one would be an unmeasured change (see Risks).
- **The field is optional and omitted when unset**, using the same conditional spread as `jsonSchema` (`lib/aiLane.ts:104`). The structure lanes therefore send byte-identical requests, and the offline probe checks that a call without `temperature` sends no `temperature` key.
- **The check itself is not changed.** The issue's second acceptance criterion offers two routes, and this plan takes the first: 5 consecutive passes with the configured model. `eval/stability.ts` gets a comment that names the pin, so a later failure points to it.
- **Plan file name.** #200 has no TODO number (`.agents/issues/todo-issues.md` ends at TODO-25 / #199), so the plan uses the issue number instead of the `todo-N` prefix of earlier plans.

## User Story

As the maintainer of Distill
I want the interpretation lane to give the same reading of the same page on every run
So that `npm run eval:ai` is a gate I can rely on, and a failure means a real regression

## Metadata

| Field | Value |
|-------|-------|
| Type | BUG_FIX |
| Complexity | LOW |
| Systems Affected | `lib/aiLane.ts`, `lib/interpret.ts`, `eval/stability.ts` (comment only), `docs/architecture/orchestration.md` |
| GitHub Issue | #200 (related: #199, #177) |
| PRD Phase | N/A |
| Prototype Patch | `.agents/plans/issue-200-pin-interpretation-temperature-prototype.patch` |

---

## Environment Findings

| Probe | Result |
|-------|--------|
| Tree | `main` at `e7f8d9a` ("uppercase": `techstack.md` renamed to `TECHSTACK.md`, no code change since `c9bd1e6`), clean. No `verify.sh` instance (`.verify/current.env` absent) |
| Toolchain | Node v22.23.1 |
| Baseline | `npm run check` exits 0 on HEAD; eval at 100% for `clean-light`, `dark-mode` and `adversarial-shell`. Start green, stay green |
| How `eval:ai` gets its key | `eval/stability.ts` does **not** load `.env.local` (`tsx` loads no env file), and `aiLaneAvailable()` reads `process.env.OPENROUTER_API_KEY` (`lib/aiLane.ts:15-17`). Run it as `( set -a; . ./.env.local; set +a; npm run eval:ai )`, the form that earlier reports used |
| Configured model | `.env.local` sets `OPENROUTER_MODEL=google/gemini-2.5-flash`; the code default is `google/gemini-3.5-flash` (`lib/aiLane.ts:58`). Key values were never printed |
| `temperature` support | OpenRouter `/api/v1/models`: `temperature` is in `supported_parameters` for both `google/gemini-2.5-flash` and `google/gemini-3.5-flash` |
| Coverage of the gates | `npm run eval` never calls `interpret` (it runs the measured lane, with `forceHeuristicNaming`), and CI has no key. Only the offline probe and the live `npm run eval:ai` exercise this change |
| Forward references to #200 | None in the source, the docs or earlier plans. `.agents/reports/todo-25-remove-native-gemini-provider-path-plan-report.md:99` asks for "a lower temperature, a tighter prompt, or another model" |
| Live calls spent while planning | 27 (3 `eval:ai` runs × 9), within the budget of 3 runs |

Issue-stated numbers, re-measured: `RUNS = 3`, `ADJECTIVE_JACCARD_FLOOR = 0.5` and `ARCHETYPE_JACCARD_FLOOR = 0.3` match `eval/stability.ts:22-24`. Each run makes 9 calls (3 sites × 3 runs), and a run makes more only when a call fails and `retryOnce` repeats it. The issue's "`00aaea0`" is an older `main`; the request bytes are the same on HEAD (#199's probe).

## Evidence

All three live runs were made in a scratch worktree with the host's `.env.local`. The only change from the code under test was one tagged `console.log` that printed each reply's adjectives and archetype, which does not touch the request.

**Run 1: HEAD as written (no `temperature`). Exit 1.**

```
clean-light  0: [clean, professional, minimalist, trustworthy, calm, accessible]  "The Architect — precise, structured, and clear."
clean-light  1: [clean, calm, efficient, measured, content-forward]               "The Analyst — precise, understated, and trustworthy"
clean-light  2: [clean, professional, straightforward, trustworthy, calm]         "The Architect — structured, clear, and functional"
  ✗ clean-light    adjectives 0.35  archetype 0.42
dark-mode    0: [dark, modern, technical, efficient, minimalist, professional]    "The Developer's Companion — sleek, high-contrast, and function-first."
dark-mode    1: [dark, modern, developer-centric, clean, calm]                    "The Developer — functional, efficient, and direct"
dark-mode    2: [sleek, modern, technical, calm, professional]                    "The Developer's Den – focused, efficient, and quietly powerful"
  ✗ dark-mode      adjectives 0.28  archetype 0.29
adversarial-shell ...
  ✓ adversarial-shell adjectives 0.52  archetype 0.40

  thresholds: adjectives ≥ 0.5, archetype ≥ 0.3
  ✗ AI lane unstable — check temperature/prompt
```

**Run 2: prototype (`temperature: 0`). Exit 0.**

```
  ✓ clean-light    adjectives 0.89  archetype 0.81
  ✓ dark-mode      adjectives 0.79  archetype 1.00
  ✓ adversarial-shell adjectives 0.89  archetype 0.75
  ✓ AI lane stable
```

**Run 3: prototype again. Exit 0.**

```
  ✓ clean-light    adjectives 1.00  archetype 1.00
  ✓ dark-mode      adjectives 1.00  archetype 1.00
  ✓ adversarial-shell adjectives 0.89  archetype 0.63
  ✓ AI lane stable
```

In runs 2 and 3, `clean-light` returned `[clean, professional, minimalist, trustworthy, calm, functional]` / "The Architect — precise, structured, and reliable" in 5 of 6 replies. Temperature 0 on Gemini is near-deterministic, not exact: `adversarial-shell` run 3 still varied one archetype line.

**Hypotheses** (the issue's candidates plus the history):

| # | Hypothesis | Prediction | Probe | Result |
|---|------------|------------|-------|--------|
| H1 | The model samples at its default temperature because none is sent | Sending `temperature: 0` alone, with the same prompt and floors, lifts every site above both floors | Runs 2 and 3 vs run 1 | **Confirmed.** Lowest adjective score 0.28 → 0.79; lowest archetype score 0.29 → 0.63 |
| H2 | Floors that 3 runs per site cannot meet reliably | Even a near-deterministic model stays near the floors | Runs 2 and 3 | Ruled out: lowest scores 0.79 / 0.63, against floors of 0.5 / 0.3 |
| H3 | The prompt is too open (free adjective vocabulary, a free-form archetype line) | Only a prompt change fixes it | Same prompt in runs 2 and 3 | Not needed: it passes unchanged. The prompt does widen the spread at temperature 1 (the archetype's descriptor half varies most), but it is not the cause |
| H4 | No reasoning cap over OpenRouter, so thinking varies the answer | A cap is needed | Runs 2 and 3 send no cap and pass; #199's planning baseline measured 0 reasoning tokens on this lane with `google/gemini-2.5-flash` | Ruled out for the configured model |
| H5 | The model or its routing changed after the 2026-10-14 02:33 pass (#177) | Old runs passed consistently, new runs fail | 4 of the last 4 runs on `main` failed; the floors were never calibrated live (`4936522`, `.agents/PRDs/PRD.md:331`) | Ruled out: the 02:33 pass was the outlier of a check that sat around its floors |

---

## Patterns to Follow

### An optional request field: a conditional spread in the request body

```ts
// SOURCE: lib/aiLane.ts:100-105
    body: JSON.stringify({
      model,
      messages,
      max_tokens: opts.maxOutputTokens,
      ...(opts.jsonSchema
        ? {
```

### A lane's request constant: a named module constant with a comment that says why

```ts
// SOURCE: lib/interpret.ts:32-38
// This lane is grounded on tokens that were already measured, so its job is to
// read the feel — not to reason hard. ...
const MAX_TOKENS = 2048;
```

### Error handling: a lane never throws; a failure is logged by lane name and the lane returns null

```ts
// SOURCE: lib/interpret.ts:172-176
  const ai = await retryOnce(
    () => requestOnce(screenshots, summary),
    (err, attempt) => warnAiFailure("AI Interpretation lane", attempt, err),
  );
  if (!ai) return null;
```

### Tests: no unit-test framework; a scratch script calls the real entry point on a committed capture

```ts
// SOURCE: eval/stability.ts:62-72
  const capture = JSON.parse(readFileSync(capturePath, "utf8")) as Capture;
  const { report } = await extractFromCapture(capture);
  ...
    const interpretation = await interpret({
      screenshotsPngBase64: [capture.viewportShot],
```

`AGENTS.md` ("Manually verifying extraction changes"): run scratch scripts with `npx tsx` **from inside the project**, and delete them after use.

---

## Files to Change

| File | Action | Purpose | Covered by the patch |
|------|--------|---------|----------------------|
| `lib/aiLane.ts` | UPDATE | Optional `ModelCall.temperature`, sent only when set | Yes |
| `lib/interpret.ts` | UPDATE | `TEMPERATURE = 0` constant with its reason, passed in `requestOnce` | Yes |
| `eval/stability.ts` | UPDATE | Doc comment names the pin and its reason (#200), as the second acceptance criterion asks; floors unchanged | No: Task 2 |
| `docs/architecture/orchestration.md` | UPDATE | Line 9 says the request "carries only `max_tokens`", which becomes false | No: Task 3 |
| `scratch/temperature-probe.mts` | CREATE, then DELETE | Offline reproduction probe; never committed | No: Task 1 |

---

## Tasks

`/implement` applies the prototype patch before Task 1.

### Task 1: Run the reproduction probe red on the base commit and green on the patched tree

- **File**: `scratch/temperature-probe.mts` (scratch only; also in a detached worktree of the base commit)
- **Action**: CREATE, then DELETE
- **Implement**:
  1. Red run on the unchanged code: `git worktree add --detach <scratchpad>/base e7f8d9a`, `ln -s "$PWD/node_modules" <scratchpad>/base/node_modules`, write the probe script of End-to-End Verification step 1 to `<scratchpad>/base/scratch/temperature-probe.mts`, then run `cd <scratchpad>/base && npx tsx scratch/temperature-probe.mts`. Expect exit 1 and `FAIL interpretation request sends temperature 0`. Remove the worktree with `git worktree remove --force <scratchpad>/base`.
  2. Green run: write the same script to `scratch/temperature-probe.mts` in the repository and run it from the project root. Expect exit 0 and three `ok` lines.
  3. Delete `scratch/` from the repository.
- **Mirror**: `eval/stability.ts:62-72` (capture → `extractFromCapture` → `interpret`)
- **Validate**: `npx tsx scratch/temperature-probe.mts` (exit 0), then `test ! -e scratch && git status --short` (lists no `scratch/`)

### Task 2: Record the pin and its reason in `eval/stability.ts`

- **File**: `eval/stability.ts`
- **Action**: UPDATE
- **Implement**: In the doc comment at `eval/stability.ts:8-18`, add 2–3 sentences after "This catches temperature/prompt regressions without a 'correct' answer." Say that the interpretation lane pins its temperature (`TEMPERATURE` in `lib/interpret.ts`) because, at the provider default, the routed model words the same reading differently on each run, and these floors failed on 4 of 4 runs that way (#200). Say also that a failure therefore first means the pin was lost or the routed model ignores it. Leave `RUNS`, both floors, the measure and the failure message (`eval/stability.ts:122`, which already says "check temperature/prompt") unchanged.
- **Mirror**: the `(#177)` issue reference style of `lib/interpret.ts:51-57`
- **Validate**: `npm run typecheck && npm run lint`

### Task 3: Correct the orchestration write-up

- **File**: `docs/architecture/orchestration.md`
- **Action**: UPDATE
- **Implement**: In `docs/architecture/orchestration.md:9`, the sentence "There is no thinking cap: `ModelCall` has no such field and the request carries only `max_tokens`, …" becomes false. Keep the thinking-cap point and add that `ModelCall.temperature` is optional and sent only when a lane sets it. The interpretation lane sends `0` so that `npm run eval:ai` measures a stable reading (#200), and the structure lanes send none, so the provider default applies to them.
- **Mirror**: the `(#199)` reference style in the same paragraph
- **Validate**: `grep -n "temperature" docs/architecture/orchestration.md` (shows the new sentence; no "carries only `max_tokens`" left)

### Task 4: Live acceptance: 5 consecutive `npm run eval:ai` passes

- **File**: none (live check)
- **Action**: RUN
- **Implement**: Run End-to-End Verification step 2. It makes 45 live calls (5 runs × 9) and is the check that the issue's second acceptance criterion names. If one run fails, stop: do not re-run until 5 passes accumulate, and do not touch a floor. Record all outputs and treat the failure as a finding (see Risks).
- **Validate**: each of the 5 outputs has three `✓` lines, `✓ AI lane stable`, and no `AI Interpretation lane failed` line

### Task 5: Full gate

- **File**: none
- **Action**: RUN
- **Implement**: `test ! -e .verify/current.env && npm run check`
- **Validate**: exit 0, eval at 100% for the three required fixtures; `git status --short` lists only `lib/aiLane.ts`, `lib/interpret.ts`, `eval/stability.ts`, `docs/architecture/orchestration.md` and the plan files

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Measured-lane eval (does not exercise this change, must stay at 100%)
npm run eval

# Full gate (typecheck → lint → build → eval), the CI command
npm run check

# Reproduction: red on the base commit (exit 1, "FAIL interpretation request sends temperature 0"),
# green after the patch (exit 0). Run from the project root; script in End-to-End Verification step 1.
npx tsx scratch/temperature-probe.mts
```

## End-to-End Verification

### 1. Offline: the interpretation request carries `temperature: 0` and other calls carry none

No network and no key: the script sets a dummy key and stubs `fetch`. Write it to `scratch/temperature-probe.mts` inside the project (tsx resolves `node_modules` from the script's own location) and run `npx tsx scratch/temperature-probe.mts` from the project root. Expected output on HEAD (`e7f8d9a`, measured): exit 1, with `FAIL interpretation request sends temperature 0`. Expected after the patch (measured on the prototype): exit 0, three `ok` lines. Delete `scratch/` afterwards.

```ts
// Offline probe for #200: no network, no key. Stubs fetch, records each request body.
import { readFileSync } from "node:fs";
import { extractFromCapture, type Capture } from "@/lib/analyze";
import { interpret } from "@/lib/interpret";
import { callModel } from "@/lib/aiLane";

process.env.OPENROUTER_API_KEY = "offline-probe";
const bodies: Record<string, unknown>[] = [];
const reply = {
  identity: { adjectives: ["clean", "calm", "precise"], archetype: "The Architect", description: "Probe." },
  imageMood: { hero: ["soft morning light interior"], texture: ["linen paper"] },
  roleRefinements: [],
};
globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
  bodies.push(JSON.parse(init?.body ?? "{}"));
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }), { status: 200 });
}) as typeof fetch;

const capture = JSON.parse(readFileSync("eval/corpus/clean-light/capture.json", "utf8")) as Capture;
const { report } = await extractFromCapture(capture);
const out = await interpret({ screenshotsPngBase64: [capture.viewportShot], palette: report.palette, typography: report.typography });
await callModel({ user: "other lane", maxOutputTokens: 16 });

const [interpretBody, otherBody] = bodies;
const checks = [
  ["interpret returned a value", out !== null],
  ["interpretation request sends temperature 0", interpretBody?.temperature === 0],
  ["a call without temperature sends no temperature key", otherBody !== undefined && !("temperature" in otherBody)],
] as const;
let failed = false;
for (const [name, ok] of checks) {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) failed = true;
}
process.exit(failed ? 1 : 0);
```

### 2. Live: `npm run eval:ai`, 5 consecutive runs (second acceptance criterion)

Why live: only a real request shows whether the routed model honours `temperature` and whether the answers become stable. Cost: 5 runs × 9 calls = 45 calls, more only if a call is retried. Run from the project root with the host's `.env.local` (`OPENROUTER_MODEL=google/gemini-2.5-flash`), redacting the key:

```bash
for i in 1 2 3 4 5; do
  echo "=== run $i"
  ( set -a; . ./.env.local; set +a; npm run eval:ai 2>&1 | sed "s/${OPENROUTER_API_KEY}/<REDACTED>/g"; exit "${PIPESTATUS[0]}" ) || { echo "run $i exit $?"; break; }
done
```

Expected for each run: exit 0, three `✓` lines (`clean-light`, `dark-mode`, `adversarial-shell`), `✓ AI lane stable`, and **no** `AI Interpretation lane failed` line. Exit 0 alone is not a pass: `eval/stability.ts:73` skips a site whose `interpret` returns `null`, and with all three skipped the run prints `(no captures with a live interpretation to score)` and exits 0. A provider that rejected `temperature` would look exactly like that.

### 3. Full gate

`test ! -e .verify/current.env && npm run check` exits 0 with eval at 100%.

## Risks

| Risk | Mitigation | Scope |
|------|------------|-------|
| A provider that rejects `temperature` gets a 400, which `retryOnce` swallows, so the lane silently returns `null`. This is the failure class of `.agents/PRDs/PRD.md:331` | OpenRouter lists `temperature` as supported for both the configured and the default model, and E2E step 2 fails on any `AI Interpretation lane failed` line. A custom `OPENROUTER_MODEL` that rejects it still surfaces through `warnAiFailure`, as with `response_format` (`lib/aiLane.ts:44-48`) | In scope: checked live on the configured model only |
| `eval:ai` reports a false green when every interpretation fails (it skips the site and exits 0) | E2E step 2 asserts three `✓` lines and no failure line instead of trusting the exit code. Making `stability.ts` fail on a skipped site is a separate change | Out of scope: flag only |
| Temperature 0 on Gemini is near-deterministic, not exact. One of 5 runs could still dip | Measured margins are wide (lowest scores 0.79 / 0.63 against floors of 0.5 / 0.3). If a run fails, Task 4 stops and reports it; floors are not touched | In scope |
| The default model `google/gemini-3.5-flash` was not run live | Its model-list entry supports `temperature`. The acceptance criterion names the configured model, which is the one checked | Out of scope: note in the report |
| `imageMood` queries and role refinements become repeatable as well (same call) | Intended: the same page should give the same report, and the response cache already serves repeated URLs | In scope |
| The structure lanes still sample at the provider default | No stability check measures them, and #200 is about the interpretation lane. A follow-up could pin them with a measurement | Out of scope: flag only |

## Open Questions

- **Temperature value: 0, or a small non-zero value such as 0.2?** This changes an observable result: how much the identity and the image-mood queries vary between two analyses of the same page. Proposed default: **0**. Determinism matches the stability gate's intent and the "measured, never faked" tone of the report, it was the only value measured, and its margins are wide. A non-zero value would need its own live runs to show it clears the floors.

## Acceptance Criteria

- [ ] All tasks completed
- [ ] The cause is named in the PR and in `eval/stability.ts`: the interpretation request sent no `temperature`, so the routed model sampled at its default and reworded the same reading on each run
- [ ] The reproduction probe exits 1 on `e7f8d9a` and 0 after the change
- [ ] `npm run eval:ai` passes 5 consecutive runs with the configured model (`google/gemini-2.5-flash`), with no `AI Interpretation lane failed` line
- [ ] `RUNS`, `ADJECTIVE_JACCARD_FLOOR` and `ARCHETYPE_JACCARD_FLOOR` are unchanged
- [ ] Type check, lint and `npm run check` pass; eval stays at 100%
- [ ] Follows existing patterns (the conditional-spread optional field, a named lane constant with its reason)
