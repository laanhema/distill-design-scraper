# Plan: #209: Make the interpretation lane repeat its reading on the default model `google/gemini-3.5-flash`

## Summary

On the code-default model `google/gemini-3.5-flash`, `npm run eval:ai` (`eval/stability.ts`) fails its floors in some runs even with the #200 pin `TEMPERATURE = 0` (`lib/interpret.ts:44`). The cause was measured while planning. It is **none of the three candidates that the issue lists on its own**:

1. **No `seed` is sent.** Gemini 3.5 Flash does not repeat its reply to one request at temperature 0. Each call takes a different thinking path (390–1,420 reasoning tokens for the same request), and the answer differs with it. With `seed` set, Google AI Studio returned the same reply, byte for byte with the same reasoning-token count, on 6 of 6 calls (probe C12), and again on every call of the prototype runs.
2. **OpenRouter splits the calls between two Google endpoints**, Google Vertex (`provider: "Google"`) and Google AI Studio. The two give different readings of the same request, and Vertex does not honour `seed`: under a seed it still cycled through 3 replies (C14). The split changes from run to run (3 of 6 calls on AI Studio in C0, 5 of 6 in C2), which is why the failure is intermittent: the #200 review saw 2 failing runs out of 2, and this plan saw 2 passing runs on HEAD before reproducing the failure with 6 calls per site.

`google/gemini-2.5-flash` is stable at temperature 0 alone because it spends 0 reasoning tokens on this lane and every call went to one endpoint (C8). That is why #200 measured a pass there.

The three issue candidates, measured one variable at a time on `dark-mode` (the site that failed most often), with 6 calls each (15 pairs, a sharper estimate than the check's 3):

- **Temperature for the Gemini 3 family: ruled out.** The provider default (1.0) scored worse than 0 (0.31 / 0.22 against 0.44 / 0.24). Under a seed on AI Studio, temperature 1.0 and temperature 0 returned the identical reply. All calls ended with `finish_reason: stop`, so the looping that Google warns about at low temperature was not seen.
- **Reasoning cap: ruled out as the cause.** `reasoning: { effort: "minimal" }` dropped the reasoning tokens to 0 and left the score at 0.51 / 0.24. On Vertex only, it reached 0.82 / 0.54, still with 3 distinct replies.
- **The prompt: a contributor, not the cause.** Synonyms such as `developer-first` / `developer-centric` / `developer-focused` count as different words in the Jaccard. A tighter prompt (single-word adjectives, a closed set of 12 brand archetypes, and a descriptor taken from the adjectives) lifted `dark-mode` to 0.72 / 0.56. The full 3-site run with that prompt still failed (`clean-light` adjectives 0.45, `adversarial-shell` 0.39), because the calls still split between endpoints.

**The fix**, prototyped and saved as a patch, adds an optional `ModelCall.seed` to `lib/aiLane.ts`. When it is set, `callModel` sends `seed` and an OpenRouter provider preference, `provider: { order: ["google-ai-studio"] }`. Fallbacks stay allowed, so an outage, or a model that AI Studio does not serve, routes as before. The interpretation lane sets `SEED = 7` next to `TEMPERATURE = 0`. The prompt, the floors, `RUNS` and the measure are unchanged. With the patch, `npm run eval:ai` scored 1.00 / 1.00 on all three sites with `OPENROUTER_MODEL` unset, in 2 of 2 runs. On `google/gemini-2.5-flash` it scored 1.00 / 1.00, 1.00 / 1.00 and 0.89 / 0.70 in 2 of 2 runs.

Decisions:

- **Seed plus provider preference, not either one alone.** Seed alone (C3) still split between endpoints, and Vertex ignores the seed (C14, archetype 0.34 against a floor of 0.3). Provider order alone without a seed (C13: Vertex first) failed: OpenRouter still sent 3 of 9 calls to AI Studio, and `dark-mode` scored 0.23. AI Studio alone without a seed (C11) varied on every call (0.52 / 0.33). Only the pair gave identical replies.
- **AI Studio, not Vertex, is the preferred provider**, because it is the endpoint that honoured the seed (C12 against C14).
- **The preference is tied to `seed` inside `lib/aiLane.ts`.** It is a fact about providers: the endpoint that honours a seed. `lib/aiLane.ts` is the only file allowed to know about providers (`docs/architecture/orchestration.md:7`). A lane only says "seed this call". The structure lanes set no seed, so their requests are byte-identical to HEAD. The offline probe checks that.
- **No model gate.** A one-call probe with `OPENROUTER_MODEL=openai/gpt-4.1-mini` and the same preference routed to Azure and returned a valid reply. With fallbacks allowed, OpenRouter skips a provider that does not serve the model, so `callModel` needs no `google/` branch.
- **Keep `TEMPERATURE = 0`.** It is still what makes `google/gemini-2.5-flash` stable (#200). On Gemini 3.5 Flash it measured no worse than the default and caused no looping (see Open Questions).
- **The prompt stays unchanged.** It is not needed once the replies repeat, and a closed archetype vocabulary would change the report's content, which the owner has to decide on.
- **Plan file name.** #209 has no TODO number, so the name follows `issue-200-…` in `.agents/plans/completed/`.

Every `file:line` in this plan is a line of HEAD (`3d5b129`) before the patch.

## User Story

As the maintainer of Distill
I want the interpretation lane to give the same reading of the same page on every run, on the code-default model as well as on 2.5 Flash
So that `npm run eval:ai` is a gate I can rely on whatever model the deployment leaves at its default

## Metadata

| Field | Value |
|-------|-------|
| Type | BUG_FIX |
| Complexity | LOW |
| Systems Affected | `lib/aiLane.ts`, `lib/interpret.ts`, `eval/stability.ts` (comment and failure hint), `docs/architecture/orchestration.md` |
| GitHub Issue | #209 (related: #200) |
| PRD Phase | N/A |
| Prototype Patch | `.agents/plans/issue-209-seed-interpretation-lane-prototype.patch` |

---

## Environment Findings

| Probe | Result |
|-------|--------|
| Tree | `main` at `3d5b129` (merge of #200), clean. No `verify.sh` instance (`.verify/current.env` absent) |
| Toolchain | Node v22.23.1 |
| Baseline | `npm run check` exits 0 on HEAD. The eval is at 100% for `clean-light`, `dark-mode` and `adversarial-shell`, and `stripe`, `linear` and `vercel` are skipped. Start green, stay green |
| How `eval:ai` gets its key | `eval/stability.ts` does **not** load `.env.local` (`tsx` loads no env file). `.env.local` holds `OPENROUTER_API_KEY` and `OPENROUTER_MODEL` (plus an unread `GEMINI_API_KEY`). Run `set -a; . ./.env.local; set +a; OPENROUTER_MODEL= npm run eval:ai` for the code default (`lib/aiLane.ts:64` uses `process.env.OPENROUTER_MODEL \|\| "google/gemini-3.5-flash"`, so empty means default). Run `set -a; . ./.env.local; set +a; OPENROUTER_MODEL=google/gemini-2.5-flash npm run eval:ai` for 2.5 Flash. Key values were never printed |
| OpenRouter parameters | `/api/v1/models`: both models list `seed`, `temperature` and `reasoning` in `supported_parameters`. `/api/v1/models/google/gemini-3.5-flash/endpoints` lists Google Vertex (`google-vertex`, `/global`, `/us`, `/flex`, `/priority`) and Google AI Studio (`google-ai-studio`, `/flex`, `/priority`) endpoints, and each one lists `seed` |
| Coverage of the gates | `npm run eval` never calls `interpret` (it runs the measured lane with `forceHeuristicNaming`), and CI has no key. Only the offline probe and the live `npm run eval:ai` exercise this change |
| Forward references to #209 | `eval/stability.ts:17-21` ("still fail at temperature 0 (#209)", "the known gap of #209") and `docs/architecture/orchestration.md:9` ("still fails its floors at temperature 0 (#209)"). Tasks 1 and 2 replace both |
| Issue-stated numbers, re-measured | `TEMPERATURE = 0` (`lib/interpret.ts:44`), `MAX_TOKENS = 2048` (`lib/interpret.ts:38`), `RUNS = 3` and the floors 0.5 / 0.3 (`eval/stability.ts:31-33`) match. "`ModelCall` has no reasoning-cap field" matches (`lib/aiLane.ts:20-39`). The largest measured completion was 1,543 tokens, which fits in 2,048 (no `finish_reason: length` in any call) |
| Live calls spent while planning | 158: about 17 runs' worth of 9 calls, spread over 14 probe configurations, 2 `eval:ai` runs on HEAD and 4 on the prototype, and 1 call on a non-Google model. There was 1 retry (a 503 "high demand" from AI Studio, with a 504 from Vertex before it, in C10) |

## Evidence

**Feedback loop.** The live loop is `scratch/stability-probe.mts` (verbatim in End-to-End Verification, step 3). It runs the real `interpret` through a `fetch` wrapper. The wrapper merges `BODY_PATCH` into each request, so a probe changes one request variable without editing the lane. It logs each reply's provider, reasoning tokens and finish reason, and scores like `eval/stability.ts`. `SITES=dark-mode RUNS=6` (6 calls, 15 pairs) gives a sharper estimate per configuration than the check's 3 calls. Two `npm run eval:ai`-equivalent runs on HEAD passed (`clean-light` 1.00 / 1.00, `dark-mode` 0.78 / 0.40, `adversarial-shell` 0.62 / 0.37, then 1.00 / 0.53, 0.58 / 0.63, 1.00 / 0.81). The 6-call loop on HEAD went red on the first try.

**Reproduction on HEAD (C0), `OPENROUTER_MODEL` unset, `SITES=dark-mode RUNS=6`, exit 1:**

```
dark-mode 0: [Google temp=0 rt=1108 ...]           [nocturnal, precise, technical, minimalist, focused] "The Night Owl — technical, high-contrast, distraction-free"
dark-mode 1: [Google temp=0 rt=737 ...]            [technical, focused, nocturnal, precise, minimalist] "The Developer — precise, dark-mode native"
dark-mode 2: [Google AI Studio temp=0 rt=860 ...]  [dark, technical, developer-focused, minimal, sleek] "The Terminal — dark-mode, code-centric UI"
dark-mode 3: [Google AI Studio temp=0 rt=753 ...]  [dark, focused, technical, sleek, precise] "The Technologist — crisp, code-first dark interface"
dark-mode 4: [Google temp=0 rt=737 ...]            [technical, focused, nocturnal, precise, minimalist] "The Developer — precise, dark-mode native"
dark-mode 5: [Google AI Studio temp=0 rt=454 ...]  [dark, developer-focused, technical, crisp, focused, minimal] "The Architect — dark-default, precision developer tool"
✗ dark-mode          adjectives 0.44  archetype 0.24
```

Calls with the same reasoning-token count returned the same reply (1 and 4). Calls with a different count, or on the other endpoint, did not.

**Configurations** (`dark-mode`, 6 calls each, `OPENROUTER_MODEL` unset, unless stated). Scores are adjectives / archetype against floors of 0.5 / 0.3:

| # | Change from HEAD | Endpoints (AI Studio / Vertex) | Reasoning tokens | Score |
|---|------------------|---------------------------------|------------------|-------|
| C0 | none | 3 / 3 | 454–1108 | **0.44 / 0.24** ✗ |
| C1 | `temperature` removed (provider default 1.0) | 2 / 4 | 742–1076 | 0.31 / 0.22 ✗ |
| C2 | `reasoning: {effort: "minimal"}` | 5 / 1 | 0 | 0.51 / 0.24 ✗ |
| C3 | `seed: 7` | 1 / 5 | 558–1096 | 0.81 / 0.43 |
| C4 | prompt: single-word adjectives, 12 brand archetypes | 4 / 2 | 869–1148 | 0.66 / 0.31 |
| C5 | prompt C4 plus descriptor = first three adjectives | 2 / 4 | 819–1422 | 0.72 / 0.56 |
| C6 | `provider: {order: ["google-vertex"]}` | 1 / 5 | 737–859 | 0.68 / 0.67 |
| C9 | minimal reasoning, Vertex only (`allow_fallbacks: false`) | 0 / 6 | 0 | 0.82 / 0.54 (3 distinct replies) |
| C10 | minimal reasoning plus prompt C5 | 4 / 2 (1 retry after a 503) | 0 | 0.54 / 0.56 |
| C11 | AI Studio only, no seed | 6 / 0 | 393–874 | 0.52 / 0.33 (6 distinct replies) |
| **C12** | **`seed: 7`, AI Studio only** | **6 / 0** | **558 on all 6** | **1.00 / 1.00 (6 identical replies)** |
| C14 | `seed: 7`, Vertex only | 0 / 6 | 737–1108 | 0.89 / 0.34 (3 distinct replies) |
| C15 | `seed: 7`, AI Studio preferred, `temperature` removed (3 calls) | 3 / 0 | 558 on all 3 | 1.00 / 1.00, the same reply as C12 |

**3-site runs** (9 calls each):

| # | Model | Change | Result |
|---|-------|--------|--------|
| C7 | default | prompt C5 | ✗ `clean-light` 0.45 / 0.59, `dark-mode` 0.69 / 0.45, `adversarial-shell` 0.39 / 0.78 (exit 1) |
| C8 | 2.5 Flash | prompt C5 | ✓ 1.00 / 1.00, 0.78 / 1.00, 1.00 / 1.00. All on Vertex, 0 reasoning tokens |
| C13 | default | `provider: {order: ["google-vertex"]}` (fallbacks allowed) | ✗ `dark-mode` 0.23 / 0.50, with 3 of 9 calls on AI Studio (exit 1) |
| P1 | default | **prototype** (probe) | ✓ 1.00 / 1.00 on all three. All on AI Studio, each site's 3 replies identical |
| P2 | 2.5 Flash | **prototype** (probe) | ✓ 1.00 / 1.00, 1.00 / 1.00, 0.89 / 0.70. All on AI Studio, 0 reasoning tokens |
| E1 | default | **prototype**, `npm run eval:ai` | ✓ 1.00 / 1.00 on all three, `✓ AI lane stable` |
| E2 | 2.5 Flash | **prototype**, `npm run eval:ai` | ✓ 1.00 / 1.00, 1.00 / 1.00, 0.89 / 0.70, `✓ AI lane stable` |
| G1 | `openai/gpt-4.1-mini` (1 call) | `seed` plus AI Studio preference | Routed to Azure, valid reply: the preference does not block a model that AI Studio does not serve |

**Hypotheses** (the issue's three candidates plus two from the data):

| # | Hypothesis | Prediction | Probe | Result |
|---|------------|------------|-------|--------|
| H1 | Temperature 0 is the wrong value for the Gemini 3 family | The default 1.0 is more stable than 0 | C1 against C0; C15 against C12 | **Ruled out.** 1.0 scored lower (0.31 / 0.22). Under a seed, 1.0 and 0 gave the identical reply. No looping was seen (every `finish_reason` was `stop`) |
| H2 | No reasoning cap: the varying thinking varies the answer | Minimal reasoning makes replies repeat | C2, C9, C10 | **Ruled out as the cause.** 0 reasoning tokens still gave distinct replies on both endpoints. The thinking path does carry the variance, but a seed fixes it without a cap (C12: 558 tokens on every call) |
| H3 | The prompt is too open (synonyms, a free-form archetype) | A tighter prompt passes | C4, C5, C7 | **Contributor, not the cause.** `dark-mode` rose to 0.72 / 0.56, but the 3-site run failed |
| H4 | OpenRouter splits calls between Google endpoints that read the request differently | One endpoint only gives repeatable replies | C6, C11, C13, C9 | **Confirmed in part.** Endpoints differ, and the per-run split explains the intermittent failures. One endpoint alone still varies without a seed (C11, C9) |
| H5 | No `seed`: Gemini 3.5 Flash is not deterministic at temperature 0 | A seed makes replies repeat | C3, C12, C14 | **Confirmed, with H4.** AI Studio plus seed gave identical replies (6 / 6). Vertex ignores the seed (C14) |

**Named cause (first acceptance criterion):** the interpretation request sends no `seed`, and OpenRouter spreads the calls over Google AI Studio and Google Vertex. Of those two endpoints, only AI Studio honours a seed. Gemini 3.5 Flash thinks before it answers and does not repeat a reply at temperature 0 without a seed, so the readings vary per call and per endpoint. Of the issue's three candidates, the temperature value and the reasoning cap are ruled out, and the prompt only widens the spread. Task 3 posts this as an issue comment.

---

## Patterns to Follow

### An optional request field: a conditional spread in the request body

```ts
// SOURCE: lib/aiLane.ts:106-111
    body: JSON.stringify({
      model,
      messages,
      max_tokens: opts.maxOutputTokens,
      ...(opts.temperature !== undefined ? { temperature: opts.temperature } : {}),
      ...(opts.jsonSchema
```

### A request field's doc comment on `ModelCall` says what is sent and when

```ts
// SOURCE: lib/aiLane.ts:33-38
  /**
   * Sent as `temperature` when set; omitted, the routed model samples at its
   * own default (1.0 on Gemini). A lane whose answer should not change between
   * identical requests sets it low.
   */
  temperature?: number;
```

### A lane's request constant: a named module constant with a comment that gives the reason and the issue

```ts
// SOURCE: lib/interpret.ts:40-44
// The same page should read the same way on every run: the identity is a
// reading of measured tokens and one screenshot, not a creative draft. Without
// it, the routed model samples at its default (1.0 on Gemini) and words the
// same reading differently each time, which `npm run eval:ai` measures (#200).
const TEMPERATURE = 0;
```

### Error handling: a lane never throws; a failure is logged by lane name and the lane returns null

```ts
// SOURCE: lib/interpret.ts:178-182
  // One repair retry (§6), then graceful fallback.
  const ai = await retryOnce(
    () => requestOnce(screenshots, summary),
    (err, attempt) => warnAiFailure("AI Interpretation lane", attempt, err),
  );
```

### Tests: no unit-test framework; a scratch script calls the real entry point on a committed capture

```ts
// SOURCE: eval/stability.ts:71-81
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
| `lib/aiLane.ts` | UPDATE | Optional `ModelCall.seed`. When it is set, `callModel` sends `seed` and `provider: { order: [SEEDED_PROVIDER] }`, where `SEEDED_PROVIDER = "google-ai-studio"` is a commented constant | Yes |
| `lib/interpret.ts` | UPDATE | `SEED = 7` constant with its reason (#209), passed in `requestOnce` next to `temperature` | Yes |
| `eval/stability.ts` | UPDATE | The doc comment at lines 14-21 names the seed and the provider preference, and drops "the known gap of #209". The failure hint at line 131 adds "seed". Floors and `RUNS` are unchanged | No: Task 1 |
| `docs/architecture/orchestration.md` | UPDATE | Line 9: replace the "still fails … (#209)" sentence with the seed and provider preference | No: Task 2 |
| `scratch/seed-probe.mts` | CREATE, then DELETE | Offline reproduction probe; never committed | No: Task 4 |
| `scratch/stability-probe.mts` | CREATE, then DELETE | Live diagnostic loop, used only if a live run fails (Task 5) | No |

---

## Tasks

`/implement` applies the prototype patch before Task 1.

### Task 1: Update the stability check's notes and failure hint

- **File**: `eval/stability.ts`
- **Action**: UPDATE
- **Implement**: Rewrite the paragraph at `eval/stability.ts:14-21`. It should say that the interpretation lane pins its temperature (`TEMPERATURE`) and its seed (`SEED` in `lib/interpret.ts`). At the provider default, the routed model words the same reading differently on each run (#200). On the code default `google/gemini-3.5-flash`, temperature 0 alone still did not repeat a reply until a seed was sent, and the seed holds only on Google AI Studio, which `callModel` therefore prefers for a seeded call (#209). A failure here therefore first means that the pin or the seed was lost, or that OpenRouter routed the calls past AI Studio (an outage falls back to another endpoint). Drop "the known gap of #209". At line 131, change the hint to `check temperature/seed/prompt`. Also change line 11 from "temperature/prompt regressions" to "temperature/seed/prompt regressions". Leave `RUNS`, both floors and the measure unchanged.
- **Mirror**: the `(#200)` reference style at `eval/stability.ts:17`
- **Validate**: `npm run typecheck && npm run lint && grep -n "known gap\|#209\|seed" eval/stability.ts` (no "known gap" line; the seed is named)

### Task 2: Correct the orchestration write-up

- **File**: `docs/architecture/orchestration.md`
- **Action**: UPDATE
- **Implement**: In `docs/architecture/orchestration.md:9`, replace "That pin was measured stable on `google/gemini-2.5-flash` only: on the code default `google/gemini-3.5-flash`, `npm run eval:ai` still fails its floors at temperature 0 (#209)." with two points:
  - `ModelCall.seed` is optional. When a lane sets it, `callModel` sends `seed` and prefers the `google-ai-studio` provider, with fallbacks allowed, because the code default `google/gemini-3.5-flash` repeats its reply only under a seed, and of its two Google endpoints only AI Studio honours one (#209).
  - The interpretation lane sends both `0` and a seed. The structure lanes send neither, so the provider default and OpenRouter's default routing apply to them.

  Keep the existing "There is no thinking cap" sentence: it is still true.
- **Mirror**: the `(#199)` and `(#200)` reference style in the same paragraph
- **Validate**: `grep -n "seed\|#209" docs/architecture/orchestration.md` (shows the new sentence; no "still fails its floors" left)

### Task 3: Record the named cause on the issue

- **File**: none (GitHub issue #209)
- **Action**: comment
- **Implement**: Post the "Named cause" paragraph and the Configurations table of this plan's Evidence section as a comment on #209 (`gh issue comment 209 --body-file <file in the scratch directory>`). This meets the first acceptance criterion on the issue itself, and it says that the measured cause is a fourth one, beside the three candidates. `/implement` posts its own implementation comment as well, so this one may be folded into that comment instead.
- **Validate**: `gh issue view 209 --json comments --jq '.comments[-1].body' | head -5`

### Task 4: Run the reproduction probe red on the base commit and green on the patched tree

- **File**: `scratch/seed-probe.mts` (scratch only; also in a detached worktree of the base commit)
- **Action**: CREATE, then DELETE
- **Implement**:
  1. Red run on the unchanged code: `git worktree add --detach <scratchpad>/base 3d5b129` and `ln -s "$PWD/node_modules" <scratchpad>/base/node_modules`. Write the probe of End-to-End Verification step 1 to `<scratchpad>/base/scratch/seed-probe.mts` and run `cd <scratchpad>/base && npx tsx scratch/seed-probe.mts`. Expect exit 1 with `FAIL interpretation request sends a numeric seed` and `FAIL interpretation request prefers google-ai-studio, fallbacks allowed` (measured while planning). Remove the worktree with `git worktree remove --force <scratchpad>/base`.
  2. Green run: write the same script to `scratch/seed-probe.mts` in the repository and run it from the project root. Expect exit 0 and five `ok` lines (measured on the prototype).
  3. Delete `scratch/` from the repository.
- **Mirror**: `eval/stability.ts:71-81` (capture → `extractFromCapture` → `interpret`)
- **Validate**: `npx tsx scratch/seed-probe.mts` (exit 0), then `rm -rf scratch && git status --short` (lists no `scratch/`)

### Task 5: Live acceptance: 5 consecutive `npm run eval:ai` passes on each model

- **File**: none (live check)
- **Action**: RUN
- **Implement**: Run End-to-End Verification step 2, first with `OPENROUTER_MODEL` unset and then with `google/gemini-2.5-flash`. This is 90 live calls (2 × 5 runs × 9), and it is the check that the second and third acceptance criteria name. If a run fails, stop: do not re-run until 5 passes accumulate, and do not touch a floor or the prompt. Rerun the failing site with `scratch/stability-probe.mts` (step 3, `SITES=<site> RUNS=3`, 3 calls). Its provider column shows whether the calls left AI Studio. Record the outputs, and treat the failure as a finding (see Risks).
- **Validate**: each of the 10 outputs has three `✓` lines, `✓ AI lane stable`, and no `AI Interpretation lane failed` line

### Task 6: Full gate

- **File**: none
- **Action**: RUN
- **Implement**: `test ! -e .verify/current.env && npm run check`
- **Validate**: exit 0, with the eval at 100% for the three required fixtures. `git status --short` lists only `lib/aiLane.ts`, `lib/interpret.ts`, `eval/stability.ts`, `docs/architecture/orchestration.md` and the plan files

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Measured-lane eval (does not exercise this change, must stay at 100%)
npm run eval

# Full gate (typecheck → lint → build → eval), the CI command; CI has no key
npm run check

# Reproduction: red on the base commit (exit 1, "FAIL interpretation request sends a numeric seed"),
# green after the patch (exit 0). Run from the project root; script in End-to-End Verification step 1.
npx tsx scratch/seed-probe.mts

# Live acceptance (needs the key; never print it)
set -a; . ./.env.local; set +a; OPENROUTER_MODEL= npm run eval:ai
set -a; . ./.env.local; set +a; OPENROUTER_MODEL=google/gemini-2.5-flash npm run eval:ai
```

## End-to-End Verification

### 1. Offline: the interpretation request carries `seed` and the AI Studio preference, and other calls carry neither

The script needs no network and no key: it sets a dummy key and stubs `fetch`. Write it to `scratch/seed-probe.mts` inside the project (tsx resolves `node_modules` from the script's own location) and run `npx tsx scratch/seed-probe.mts` from the project root. On HEAD (`3d5b129`, measured), it exits 1 with the two `FAIL` lines named in Task 4. After the patch (measured on the prototype), it exits 0 with five `ok` lines. Delete `scratch/` afterwards.

```ts
// Offline probe for #209: no network, no key. Stubs fetch, records each request body.
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
const order = (interpretBody?.provider as { order?: unknown } | undefined)?.order;
const checks = [
  ["interpret returned a value", out !== null],
  ["interpretation request keeps temperature 0", interpretBody?.temperature === 0],
  ["interpretation request sends a numeric seed", typeof interpretBody?.seed === "number"],
  ["interpretation request prefers google-ai-studio, fallbacks allowed",
    Array.isArray(order) && order[0] === "google-ai-studio" &&
    (interpretBody?.provider as { allow_fallbacks?: unknown }).allow_fallbacks !== false],
  ["a call without a seed sends no seed and no provider key",
    otherBody !== undefined && !("seed" in otherBody) && !("provider" in otherBody)],
] as const;
let failed = false;
for (const [name, ok] of checks) {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) failed = true;
}
process.exit(failed ? 1 : 0);
```

### 2. Live: `npm run eval:ai`, 5 consecutive runs per model (second and third acceptance criteria)

This step runs live because only real requests show that the routed model repeats its reply under the seed, and that OpenRouter honours the provider preference. Each run costs 9 calls, so 5 runs on each of 2 models cost 90 calls, plus any retries. Run it from the project root with the host's `.env.local`, and redact the key:

```bash
for model in "" google/gemini-2.5-flash; do
  for i in 1 2 3 4 5; do
    echo "=== model=${model:-default} run $i"
    ( set -a; . ./.env.local; set +a; export OPENROUTER_MODEL="$model"
      npm run eval:ai 2>&1 | sed "s/${OPENROUTER_API_KEY}/<REDACTED>/g"; exit "${PIPESTATUS[0]}" ) || { echo "run $i exit $?"; break 2; }
  done
done
```

Each run must exit 0 and print three `✓` lines (`clean-light`, `dark-mode`, `adversarial-shell`) and `✓ AI lane stable`, with **no** `AI Interpretation lane failed` line. Exit 0 alone is not a pass: `eval/stability.ts:82` skips a site whose `interpret` returns `null`, and with all three sites skipped the run prints `(no captures with a live interpretation to score)` and exits 0. A provider that rejected `seed` or `provider` would look exactly like that. On the prototype, the code default scored 1.00 / 1.00 on every site, and 2.5 Flash scored at least 0.89 / 0.70.

### 3. Live diagnostic loop (only if a step-2 run fails)

`scratch/stability-probe.mts` runs the real `interpret` and logs, per reply, the provider, the temperature, the reasoning tokens (`rt`) and the finish reason. `BODY_PATCH` (JSON) is merged into each request, and a `null` value deletes the key. Run it from the project root, for example `set -a; . ./.env.local; set +a; OPENROUTER_MODEL= SITES=dark-mode RUNS=3 npx tsx scratch/stability-probe.mts`, which costs `RUNS` calls per site. Delete `scratch/` afterwards.

```ts
// Live probe for #209. Runs the real `interpret` on committed captures, RUNS times per site,
// scores them like eval/stability.ts, and logs each reply's provider, reasoning tokens and
// finish reason. BODY_PATCH (JSON) is merged into every request body; a null value deletes
// the key, so one variable changes at a time without editing the lane. SYSTEM_SUFFIX is
// appended to the system prompt. Never prints the key.
import { readFileSync } from "node:fs";
import { extractFromCapture, type Capture } from "@/lib/analyze";
import { interpret } from "@/lib/interpret";

const SITES = (process.env.SITES ?? "clean-light,dark-mode,adversarial-shell").split(",");
const RUNS = Number(process.env.RUNS ?? 3);
const patch: Record<string, unknown> = JSON.parse(process.env.BODY_PATCH ?? "{}");
const suffix = process.env.SYSTEM_SUFFIX ?? "";
const realFetch = globalThis.fetch;
let lastMeta = "";

globalThis.fetch = (async (url: string, init: RequestInit) => {
  const body = JSON.parse(String(init.body));
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) delete body[k];
    else body[k] = v;
  }
  if (suffix && body.messages[0]?.role === "system") body.messages[0].content += suffix;
  const res = await realFetch(url, { ...init, body: JSON.stringify(body) });
  const json = await res.clone().json().catch(() => null);
  const u = json?.usage ?? {};
  lastMeta = `[${json?.provider ?? "?"} temp=${body.temperature ?? "-"} reasoning=${JSON.stringify(body.reasoning ?? null)} rt=${u.completion_tokens_details?.reasoning_tokens ?? "?"} ct=${u.completion_tokens ?? "?"} fin=${json?.choices?.[0]?.finish_reason ?? res.status}]`;
  return res;
}) as typeof fetch;

const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
function jaccard(sets: string[][]): number {
  const u = sets.map((s) => new Set(s));
  let sum = 0, n = 0;
  for (let i = 0; i < u.length; i++) for (let j = i + 1; j < u.length; j++) {
    const inter = [...u[i]].filter((x) => u[j].has(x)).length;
    const uni = new Set([...u[i], ...u[j]]).size;
    sum += uni === 0 ? 1 : inter / uni; n++;
  }
  return n === 0 ? 1 : sum / n;
}

console.log(`model=${process.env.OPENROUTER_MODEL || "google/gemini-3.5-flash (default)"} patch=${JSON.stringify(patch)} suffix=${suffix ? "yes" : "no"}`);
let fail = false;
for (const slug of SITES) {
  const capture = JSON.parse(readFileSync(`eval/corpus/${slug}/capture.json`, "utf8")) as Capture;
  const { report } = await extractFromCapture(capture);
  const adj: string[][] = [], arch: string[][] = [];
  for (let i = 0; i < RUNS; i++) {
    const r = await interpret({ screenshotsPngBase64: [capture.viewportShot], palette: report.palette, typography: report.typography });
    if (!r) { console.log(`  ${slug} ${i}: NULL ${lastMeta}`); fail = true; continue; }
    const a = r.identity.adjectives.map((x) => x.toLowerCase().trim());
    adj.push(a); arch.push(normalize(r.identity.archetype));
    console.log(`  ${slug} ${i}: ${lastMeta} [${a.join(", ")}] "${r.identity.archetype}"`);
  }
  const aj = jaccard(adj), rj = jaccard(arch);
  const ok = aj >= 0.5 && rj >= 0.3;
  if (!ok) fail = true;
  console.log(`${ok ? "✓" : "✗"} ${slug.padEnd(18)} adjectives ${aj.toFixed(2)}  archetype ${rj.toFixed(2)}`);
}
process.exit(fail ? 1 : 0);
```

### 4. Full gate

`test ! -e .verify/current.env && npm run check` exits 0. CI runs the same command without a key, and the change does not touch the measured lane.

## Risks

| Risk | Mitigation |
|------|------------|
| AI Studio is down or rate-limited (one 503 "high demand" was seen while planning), so OpenRouter falls back to Vertex, where the seed does not hold, and a run fails | Fallbacks are kept on purpose: in production a varied reading is better than no reading. In the live check, a failure whose probe shows non-AI-Studio providers is an availability event, not a regression: record it and rerun once. **In scope**: say so in the `eval/stability.ts` comment (Task 1). Setting `allow_fallbacks: false` would turn every AI Studio outage into a dropped lane, which is **out of scope** |
| At temperature 0 with a seed, `retryOnce` resends an identical request, so a reply that fails Zod repeats and the repair retry adds nothing on AI Studio | Not observed: no `lane failed` line in any of the 158 calls, apart from the 503 above. **Out of scope**: flag it in the implementation report. A retry with a different seed is a separate change |
| A later Gemini 3.x default, or a change on Google's side, stops honouring `seed` on AI Studio | Step 2's 5-run check, and the probe's provider and `rt` columns, show it at once. **Out of scope** beyond the comment |
| The provider slug `google-ai-studio` is renamed on OpenRouter | The preference silently stops applying (fallbacks are allowed) and stability drops back to the HEAD state. The offline probe pins the slug that is sent; only a live run catches a rename. **Out of scope**: the doc comment on `SEEDED_PROVIDER` names it as an OpenRouter provider slug |
| The 2.5 Flash calls now go to AI Studio instead of Vertex (C8 against P2) | Measured stable on both runs (minimum 0.89 / 0.70), and Task 5 re-checks 5 runs. **In scope** (Task 5) |
| The structure lanes keep varying between runs | They send no seed, so their requests are unchanged (the offline probe checks this), and no stability check measures them. **Out of scope**, as in #200 |
| The first acceptance criterion offers three causes, and the measured cause is a fourth | The plan names the measured cause and rules out the three with data (Evidence, Task 3). See Open Questions |

## Open Questions

- **The first acceptance criterion lists three candidate causes; the measured cause is the missing seed plus OpenRouter's endpoint split.** Proposed default: accept the measured cause, recorded on the issue (Task 3), because the criterion asks for the cause to be named and its three options were each probed and ruled out or shown to be partial. The same goes for the second criterion, which names "a tighter prompt, a reasoning cap, or a per-model temperature" as the routes: the fix is a seed with a provider preference, which none of those three covers.
- **Keep temperature 0 on Gemini 3, against Google's advice to leave it at 1.0?** Proposed default: keep the single `TEMPERATURE = 0` and add no per-model temperature. Under a seed on AI Studio, 0 and 1.0 gave the identical reply (C15), no call looped (every `finish_reason` was `stop`), and 0 is what keeps 2.5 Flash stable (#200). A per-model branch would add code without a measured effect.
- **Tighten the prompt anyway (single-word adjectives, a closed set of brand archetypes)?** Proposed default: no. It is not needed once the replies repeat, and it would change what the report says (the archetype line), which is a product decision for the owner. The C4 and C5 measurements are recorded here if the owner wants it later.

## Acceptance Criteria

- [ ] The cause of the variance on `google/gemini-3.5-flash` is named (Evidence, and Task 3 on the issue)
- [ ] `npm run eval:ai` passes 5 consecutive runs with `OPENROUTER_MODEL` unset (Task 5)
- [ ] `npm run eval:ai` passes 5 consecutive runs with `OPENROUTER_MODEL=google/gemini-2.5-flash` (Task 5)
- [ ] No threshold is lowered: `RUNS = 3`, `ADJECTIVE_JACCARD_FLOOR = 0.5` and `ARCHETYPE_JACCARD_FLOOR = 0.3` are unchanged
- [ ] The #209 notes in `eval/stability.ts` and `docs/architecture/orchestration.md` are updated (Tasks 1 and 2)
- [ ] The offline probe is red on `3d5b129` and green after the patch (Task 4)
- [ ] `npm run typecheck`, `npm run lint` and `npm run check` pass (Task 6)
- [ ] Follows existing patterns (conditional spread in `callModel`, a named lane constant with its reason)
