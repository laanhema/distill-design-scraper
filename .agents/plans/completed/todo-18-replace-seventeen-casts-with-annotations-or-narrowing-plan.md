# Plan: TODO-18: Replace seventeen casts with annotations or narrowing

## Summary

Finding L3 of `.agents/reviews/codebase-analysis-review.md:34` (GitHub issue #182) names seventeen type assertions that a type annotation or a narrowing check replaces. Fifteen of them still exist on `main`; the other two were removed by #172. This plan replaces the fifteen, in eleven files, and changes no result: each site gets a declared type and an annotation, a `typeof` test, an `in` test, or a wider parameter type. The change was built and proved in a scratch worktree while planning and is saved as the prototype patch that the Metadata names, so `/implement` applies it and then proves it with the scratch check and the verify skill below. Every `file:line` in this plan is a line of `main` at `a61cfd5`, before the patch.

Measured while planning, on `main` at `a61cfd5`:

- `npm run eval` exits 0: `clean-light`, `dark-mode` and `adversarial-shell` at `combined 100%`, `aggregate combined: 100%`, `✓ all gates passed`. Start green, stay green.
- The issue's numbers have moved. The trial rule (`npx eslint . --rule '{"@typescript-eslint/consistent-type-assertions":["error",{"assertionStyle":"never"}]}'`) reports 38 assertions today, where the issue states 39. `getCache` still has one caller, now at `app/api/analyze/route.ts:155` (the issue states `:123`), and it still passes `unknown`. The two casts that the issue leaves out of scope by line are now at `lib/interpret.ts:223` and `lib/extract/styleDump.ts:325`.
- The seventeen casts, found by content:

  | Issue's reference | On `main` today | What replaces it |
  |---|---|---|
  | `lib/analyze.ts:242` (`[] as RefinementChange[]`) | gone: removed by #172 (`db78ebd`), which moved the fallback into `enrichWithAI` | nothing to do |
  | `lib/analyze.ts:359` (`[] as RefinementChange[]`) | gone: removed by #172 (`db78ebd`) | nothing to do |
  | `lib/analyze.ts:264` | `lib/analyze.ts:273` | the declared type `ImageStructureOutcome`, as an annotation on each of the four arms of the image path's structure lane |
  | `lib/analyze.ts:270` | `lib/analyze.ts:279` | the same annotation |
  | `lib/analyze.ts:275` | `lib/analyze.ts:284` | the same annotation |
  | `lib/analyze.ts:276` | `lib/analyze.ts:285` | the same annotation |
  | `lib/extract/imagePalette.ts:142` | `lib/extract/imagePalette.ts:142` | the declared type `QuantizedImage`, as the return type of `quantizeImage` and of the `catch` callback |
  | `app/page.tsx:54` | `app/page.tsx:33` | a `typeof` test of `reader.result` in `readFileAsDataURL` |
  | `lib/color.ts:55` | `lib/color.ts:50` | a `typeof` test in `hue` |
  | `lib/extract/styleDump.ts:351` | `lib/extract/styleDump.ts:393` | an `in` test in `isInteractive` (see Open Question 1) |
  | `lib/extract/structure/harvester.ts:52` | `lib/extract/structure/harvester.ts:52` | `collectVisibleText` takes a `Node` and reads `nodeName` (see Open Question 1) |
  | `lib/extract/structure/harvester.ts:54` | `lib/extract/structure/harvester.ts:54` | the same |
  | `lib/extract/states.ts:73` | `lib/extract/states.ts:73` | the bucket of `buildStates` holds `target` and `state` next to its tallies (`StateBucket`) |
  | `lib/cache.ts:89` | `lib/cache.ts:89` | `getCache` is not generic and returns `unknown` |
  | `eval/score.ts:49` | `eval/score.ts:49` | `byRole` has explicit type arguments with a string key |
  | `eval/score.ts:99` | `eval/score.ts:99` | `gotByToken` is a `Map<string, number>` |
  | `lib/aiLane.ts:168` | `lib/aiLane.ts:129` | `callModel` reads the reply as `unknown`, and the new `firstChoiceText` narrows it step by step |

- With the patch, the trial rule reports 23 assertions: the 38 of today less these fifteen, and no new one. The 23 are the sixteen of `.claude/skills/verify/scripts/drive.ts`, `eval/run.ts:49` and `:50`, `eval/stability.ts:62`, `lib/api.ts:55`, the two of the `__name` shim at `lib/extract/styleDump.ts:325`, and `lib/interpret.ts:223`. None is in scope: the issue excludes the shim and the type guard, #183 owns the casts of `eval/run.ts`, and the review named none of the others.
- `npm run typecheck`, `npm run lint` and `npm run eval` read all eleven files, but they execute only four of the changed sites (`hue`, `buildStates`, `scorePalette`, `scoreTypography`), and eval scores neither states nor hue. The image path, the cache, the provider reply and the two in-page walkers are never executed by `npm run check`. The scratch check of the End-to-End Verification section executes all of them and compares 61 recorded outputs before and after.
- That check, run on `main` against its own snapshot, prints `ok` for its four identity lines and `FAIL the trial lint rule finds exactly the 23 assertions that #182 leaves in place: 38 found, 15 not expected, 0 expected and gone`, and exits 1. Run in the prototype worktree against the snapshot of `main`, it prints five `ok` lines and `all checks ok`. So it shows the change, and it shows that the change alters no recorded output.
- In the prototype worktree, `npm run check` exits 0 with the same eval scores, and the verify scenarios `analyze-url`, `analyze-images`, `tabs-downloads` and `error` print `all checks passed` (13, 18, 22 and 5 checks, AI lane off). The cache recipe answers `200` twice, in 3.4 s and then 0.019 s, with byte-identical bodies.
- `instanceof` is not equivalent to the casts at the two in-page sites. In headless Chromium, an element that a script creates in an `<iframe>`'s document and moves into the page has `nodeType === Node.ELEMENT_NODE` and `tagName === "INPUT"`, and is no instance of the page's `Element` or `HTMLInputElement`. With `instanceof` at the three sites, the check's synthetic page loses the moved submit input from the interactive nodes (and its `:hover` state with it), and loses the moved text from two `textSnippet` values (`section: Moved in from a framemoved lead moved…` becomes `section: Moved in from a frame`). The patch therefore narrows without `instanceof` there. Open Question 1 puts this to the owner.

Decisions (none changes a result; each is covered by the scratch check):

- **`byRole` is a `Map<string | undefined, string>`.** `Swatch.role` is optional (`lib/schema.ts:55`), so a `Map<string, string>` would not accept the entries without a filter. The explicit type arguments are the annotation that the issue asks for: a role name read from `expected.yaml` is a `string`, and it now looks itself up without `as never`. A swatch without a role sits under the `undefined` key, as it does today, and no lookup reaches it.
- **The arms of the image path keep their place inside `Promise.all`.** The annotation goes on the two callbacks and on the two `Promise.resolve` calls, as an explicit type argument. Moving the lane into a local or a helper would start the vision call before `enrichWithAI`, which is an order that the code does not have today.
- **`readFileAsDataURL` rejects when `reader.result` is not a string.** `readAsDataURL` always leaves a string, so the new branch cannot run. It rejects with the message that the `onerror` line beside it already uses.
- **`setCache<T>` keeps its type parameter.** It holds no cast, and the issue names only `getCache`.

## User Story

As a maintainer of Distill
I want the compiler to check what fifteen type assertions only claim
So that a later change to one of these types fails the type check and does not pass on the word of a cast

## Metadata

| Field | Value |
|-------|-------|
| Type | REFACTOR |
| Complexity | MEDIUM |
| Systems Affected | `lib/analyze.ts`, `lib/aiLane.ts`, `lib/cache.ts`, `lib/color.ts`, `lib/extract/imagePalette.ts`, `lib/extract/states.ts`, `lib/extract/styleDump.ts`, `lib/extract/structure/harvester.ts`, `app/page.tsx`, `app/api/analyze/route.ts`, `eval/score.ts` |
| GitHub Issue | #182 (finding L3 of `.agents/reviews/codebase-analysis-review.md:34`) |
| PRD Phase | N/A |
| Prototype Patch | `.agents/plans/todo-18-replace-seventeen-casts-with-annotations-or-narrowing-prototype.patch` |

---

## Patterns to Follow

The snippets quote lines that the patch leaves unchanged.

### Naming

A declared outcome type next to the function whose results it annotates:

```ts
// SOURCE: lib/analyze.ts:132-135
export type EnrichWithAiResult = AnalyzeResult & {
  refinements: RefinementChange[];
  outcome: AiOutcome;
};
```

Narrowing with `typeof`, and with `in` on an `unknown` value:

```ts
// SOURCE: lib/analyze.ts:241-243
  const screenshotsBase64 = images.map((img) =>
    typeof img.data === "string" ? img.data : img.data.toString("base64"),
  );
```

```ts
// SOURCE: lib/api.ts:51-54
  return (
    typeof data === "object" &&
    data !== null &&
    "ok" in data &&
```

### Error Handling

`callModel` throws on a failed call and returns `null` only for a reply without usable text. `retryOnce`'s `onError` logs what it throws through `warnAiFailure`, which reads the error's message to choose a `detail` word:

```ts
// SOURCE: lib/aiLane.ts:124-127
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error (${response.status} ${response.statusText}): ${errorText}`);
  }
```

```ts
// SOURCE: lib/aiLane.ts:189-204
  const msg = err instanceof Error ? err.message : String(err);
  let detail = "error";
  if (
    msg.includes("429") ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.includes("Quota") ||
    msg.includes("rate limit")
  ) {
    detail = "429 Rate Limit / Quota Exceeded";
  } else if (
    msg.includes("400") ||
    msg.includes("INVALID_ARGUMENT") ||
    msg.includes("BadRequest")
  ) {
    detail = "400 Bad Request";
  }
```

So a message that `firstChoiceText` throws must hold none of these words, or the logged `detail` changes from `error`.

### Tests

There is no unit test framework. `npm run eval` replays the committed captures, and anything else is proved by a scratch script that calls the real entry points:

```ts
// SOURCE: eval/run.ts:49-52
  const capture = JSON.parse(readFileSync(capturePath, "utf8")) as Capture;
  const expected = yamlLoad(readFileSync(expectedPath, "utf8")) as ExpectedSpec;

  const { report } = await extractFromCapture(capture);
```

---

## Files to Change

| File | Action | Purpose | In the patch |
|------|--------|---------|--------------|
| `lib/analyze.ts` | UPDATE | Declare `ImageStructureOutcome` after `ImageInput`; annotate the four arms of the structure lane in `analyzeImages` with it; drop four casts | yes |
| `lib/extract/imagePalette.ts` | UPDATE | Declare `QuantizedImage`; use it as the return type of `quantizeImage` and of the `catch` callback in `extractImagePalette`; drop one cast | yes |
| `app/page.tsx` | UPDATE | `readFileAsDataURL` tests `reader.result` with `typeof`; drop one cast | yes |
| `lib/color.ts` | UPDATE | `hue` tests `h` with `typeof`; drop one cast | yes |
| `lib/extract/styleDump.ts` | UPDATE | `isInteractive` (inside `collectStyleDump`) narrows the input element with `in`; drop one cast | yes |
| `lib/extract/structure/harvester.ts` | UPDATE | `collectVisibleText` (inside `harvestDomTree`) takes a `Node` and reads `nodeName`; drop two casts | yes |
| `lib/extract/states.ts` | UPDATE | Declare `StateBucket`; `buildStates` stores `target` and `state` in the bucket and reads them back from it; drop one cast | yes |
| `lib/cache.ts` | UPDATE | `getCache` loses its type parameter and returns `unknown`; drop one cast | yes |
| `app/api/analyze/route.ts` | UPDATE | The one caller of `getCache` drops its `<unknown>` type argument | yes |
| `eval/score.ts` | UPDATE | Explicit type arguments on `byRole` (`scorePalette`) and `gotByToken` (`scoreTypography`); drop two `as never` | yes |
| `lib/aiLane.ts` | UPDATE | `callModel` reads the reply as `unknown`; new private `firstChoiceText` narrows it; drop one cast | yes |

No change: `lib/api.ts`, `lib/interpret.ts`, `eval/run.ts`, `eval/stability.ts`, `.claude/skills/verify/scripts/drive.ts` (their casts are out of scope), `eslint.config.mjs` (the trial rule stays a trial: 23 assertions remain), `eval/baseline.json`, `eval/corpus/*`, `docs/architecture/*`, `AGENTS.md` and `README.md` (none of them names the changed symbols: `grep -rn "getCache\|collectVisibleText\|HTMLInputElement\|as never" docs AGENTS.md README.md .claude/skills/verify --include=*.md` prints nothing).

---

## Tasks

Execute in order. Each task is atomic and verifiable. `/implement` applies the prototype patch before Task 1, so Tasks 2 and 3 verify code that is already in place. If the patch does not apply because `main` has moved, write the change from the table of the Summary and the notes of Task 2, and record that as a deviation.

### Task 1: Take the snapshot of the unchanged code

- **File**: `$SCRATCH/casts-check.mts` and `$SCRATCH/base` (scratch, outside the repository, never committed)
- **Action**: CREATE, run
- **Implement**: Follow the setup and step 1 of the End-to-End Verification section. The snapshot comes from a detached worktree of the commit that the branch started from, so it does not matter that the patch is already applied in the repository.
- **Mirror**: `eval/run.ts:49-52` (load a committed capture and call `extractFromCapture`); `eval/capture.ts:27-44` (drive Playwright directly and call `capturePage`)
- **Validate**: `(cd "$SCRATCH/base" && npx tsx "$SCRATCH/casts-check.mts" snapshot "$SCRATCH/before.json")` prints `info the trial lint rule finds 38 assertions` and `snapshot written: … (61 cases)`, and exits 0

### Task 2: Check the patched code against the issue, site by site

- **File**: the eleven files of the Files to Change table
- **Action**: UPDATE (already applied by the patch; read each site and correct it only if it departs from these notes)
- **Implement**:
  - `lib/analyze.ts`: `ImageStructureOutcome` is a private interface with two required fields, each of which may be `undefined`, so the object that `analyzeImages` returns keeps both keys, as it does today. The `then` and `catch` callbacks carry it as their return type, and the two `Promise.resolve` calls carry it as their type argument. The DIST-050 comment inside the no-key arm stays where it is. Nothing moves out of the `Promise.all` array.
  - `lib/extract/imagePalette.ts`: `QuantizedImage` is declared once, after `ImageColorCluster`, and used in two places.
  - `app/page.tsx`: `readFileAsDataURL` resolves when `reader.result` is a string and rejects otherwise, and the `onerror` line is unchanged.
  - `lib/color.ts`: `hue` still returns `0` for a hue that is `undefined` or not finite.
  - `lib/extract/styleDump.ts`: `isInteractive` keeps the `tagName === "INPUT"` test and adds an `in` test for `type`, which narrows the element so that `type` can be read. Its comment says why it is not `instanceof HTMLInputElement`. It defines no new function, so the `__name` shim of `lib/extract/styleDump.ts:319-327` needs no change.
  - `lib/extract/structure/harvester.ts`: `collectVisibleText` takes a `Node`, keeps both `nodeType` tests, and reads `nodeName`, which for an element equals `tagName`. Its comment says why no child is narrowed to `Element`. The call in `harvestNode` (`lib/extract/structure/harvester.ts:123`) is unchanged.
  - `lib/extract/states.ts`: the map of `buildStates` is still keyed by the string of role and state, so the entries come out in the order of first appearance, as today. The second loop reads `target`, `state` and the tallies from the bucket and no longer splits the key.
  - `lib/cache.ts` and `app/api/analyze/route.ts`: `getCache` has no type parameter and returns `unknown`. The route passes what it gets to `NextResponse.json`, as today.
  - `eval/score.ts`: only the two `Map` constructions and the two lookups change.
  - `lib/aiLane.ts`: `firstChoiceText` is private and sits right after `callModel`. It reads `choices`, index `0`, `message` and `content` behind one `typeof` and one `in` test each. It throws for a `null` reply and for a `content` that is truthy and not a string, which are the two shapes on which today's code throws a `TypeError`, and it returns `null` for every other reply without text. Neither message holds a word that `warnAiFailure` reads (`lib/aiLane.ts:189-204`). See Open Question 2.
  - Run the trial rule and read its output: `npx eslint . --rule '{"@typescript-eslint/consistent-type-assertions":["error",{"assertionStyle":"never"}]}'` must end with `✖ 23 problems (23 errors, 0 warnings)` and list no line of the eleven files except the two of the `__name` shim.
- **Mirror**: `lib/analyze.ts:132-135` (a declared outcome type); `lib/api.ts:51-54` (`in` on `unknown`); `lib/aiLane.ts:124-127` (an error that `callModel` throws)
- **Validate**: `npm run typecheck && npm run lint && npm run eval`

### Task 3: Prove that no result changed

- **File**: `$SCRATCH/casts-check.mts` (scratch)
- **Action**: run
- **Implement**: Follow steps 2 and 3 of the End-to-End Verification section.
- **Mirror**: N/A (scratch)
- **Validate**: `npx tsx "$SCRATCH/casts-check.mts" compare "$SCRATCH/before.json"` prints `all checks ok` and exits 0

### Task 4: Drive the real app

- **File**: none
- **Action**: run
- **Implement**: Follow step 4 of the End-to-End Verification section, with the AI lane off, and stop the instance at the end.
- **Mirror**: `.claude/skills/verify/SKILL.md`; `.claude/skills/verify/features/analyze-api.md:22` (the cache recipe)
- **Validate**: each `verify.sh drive` prints `all checks passed`; `cmp` of the two cache bodies prints nothing; `.claude/skills/verify/scripts/verify.sh down` has run

### Task 5: Run the full gate

- **File**: none
- **Action**: run
- **Implement**: Follow step 5 of the End-to-End Verification section.
- **Mirror**: N/A
- **Validate**: `npm run check && git status --short`

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Eval gate (must print the same scores: combined 100% for each fixture, aggregate 100%; never set UPDATE_BASELINE)
npm run eval

# Everything CI runs: typecheck → lint → build → eval (no verify.sh instance may be up)
npm run check
```

These four commands compile every changed line and execute four of the fifteen sites. The scratch check and the verify run below execute the rest.

## End-to-End Verification

The change must leave every result as it is, so the proof has two parts. A scratch script calls the real entry points on the unchanged and on the changed code and compares what they return: `extractFromCapture`, `buildStates`, `scorePalette`, `scoreTypography`, `hue`, `analyzeImages`, `callModel`, and `capturePage` in headless Chromium. Then the verify skill drives the running app, which is the only place where `readFileAsDataURL` and `getCache` run.

The script makes no network request and no model call. It replaces `fetch` for the whole run with a stub that answers only the OpenRouter address, from canned replies, and throws for any other address. It deletes `OPENROUTER_API_KEY` from its own environment and sets a dummy value for the stubbed calls. It loads its pages from `file://`. Chromium runs headless.

Set up the scratch directory outside the repository. The script's own imports (`sharp`, `playwright`, `js-yaml`) resolve from the script's location, so the directory needs a link to the project's `node_modules`; `@/` and `eval/...` resolve from the working directory, which must be the root of the checkout under test:

```bash
SCRATCH="$(mktemp -d)"        # or the session's scratch directory
ln -sfn "$PWD/node_modules" "$SCRATCH/node_modules"
```

Create `$SCRATCH/casts-check.mts` with this content:

````typescript
// Scratch check for #182 (replace seventeen casts with annotations or narrowing).
// Never committed. It lives in a scratch directory outside the repository that
// holds a `node_modules` symlink to the project's, and runs with a checkout's
// root as the working directory (so `@/` resolves through that checkout's
// tsconfig.json and `eval/...` resolves from the cwd):
//
//   cd <unchanged checkout> && npx tsx "$SCRATCH/casts-check.mts" snapshot "$SCRATCH/before.json"
//   cd <changed checkout>   && npx tsx "$SCRATCH/casts-check.mts" compare  "$SCRATCH/before.json"
//
// `compare` exits 1 unless (a) every recorded output of the changed code is
// identical to the snapshot and (b) the trial lint rule finds exactly the
// assertions that #182 leaves in place. Run against its own snapshot on
// unchanged code, (a) holds and (b) fails, so the check shows the change.
//
// No network: `fetch` is replaced for the whole run, the pages are `file://`
// documents, and no API key is read (a dummy one is set for the stubbed calls).
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import { load as yamlLoad } from "js-yaml";
import { chromium } from "playwright";
import { analyzeImages, extractFromCapture, type Capture } from "@/lib/analyze";
import { callModel, warnAiFailure } from "@/lib/aiLane";
import { hue, parseColor } from "@/lib/color";
import { capturePage } from "@/lib/ingest";
import { buildStates } from "@/lib/extract/states";
import type { NodeStyle, StyleDump } from "@/lib/extract/styleDump";
import { scorePalette, scoreTypography, type ExpectedSpec } from "@/eval/score";

const SLUGS = ["clean-light", "dark-mode", "adversarial-shell"] as const;

/** The assertions that #182 leaves in place, as `file :: source line`. A line
 *  that holds two assertions is listed twice. */
const EXPECTED_REMAINING = [
  ".claude/skills/verify/scripts/drive.ts :: const meta = (body.meta ?? {}) as Record<string, unknown>;",
  ".claude/skills/verify/scripts/drive.ts :: .evaluateAll((els) => els.map((el) => (el as HTMLImageElement).src));",
  ".claude/skills/verify/scripts/drive.ts :: const body = (await response.json()) as Record<string, unknown>;",
  ".claude/skills/verify/scripts/drive.ts :: const structure = body.structureReport as { markdown?: string } | null;",
  ".claude/skills/verify/scripts/drive.ts :: const report = a.body.report as { reportKind?: string; source?: { ref?: string } } | undefined;",
  ".claude/skills/verify/scripts/drive.ts :: (a.body.meta as { aiOutcome?: string } | undefined)?.aiOutcome === expectedOutcome,",
  ".claude/skills/verify/scripts/drive.ts :: (a.body.meta as { aiOutcome?: string } | undefined)?.aiOutcome,",
  ".claude/skills/verify/scripts/drive.ts :: const meta = (a.body.meta ?? {}) as Record<string, unknown>;",
  ".claude/skills/verify/scripts/drive.ts :: const shots = (meta.viewportShots as string[] | undefined) ?? [];",
  ".claude/skills/verify/scripts/drive.ts :: const structureMd = (a.body.structureReport as { markdown?: string } | null)?.markdown ?? \"\";",
  ".claude/skills/verify/scripts/drive.ts :: .reduce((sum, k) => sum + parseFloat(cs[k as \"paddingTop\"]), 0);",
  ".claude/skills/verify/scripts/drive.ts :: label: (el as HTMLElement).innerText,",
  ".claude/skills/verify/scripts/drive.ts :: const report = a.body.report as { reportKind?: string } | undefined;",
  ".claude/skills/verify/scripts/drive.ts :: const meta = (a.body.meta ?? {}) as Record<string, unknown>;",
  ".claude/skills/verify/scripts/drive.ts :: (a.body.meta as { aiOutcome?: string } | undefined)?.aiOutcome === expectedOutcome,",
  ".claude/skills/verify/scripts/drive.ts :: (a.body.meta as { aiOutcome?: string } | undefined)?.aiOutcome,",
  "eval/run.ts :: const capture = JSON.parse(readFileSync(capturePath, \"utf8\")) as Capture;",
  "eval/run.ts :: const expected = yamlLoad(readFileSync(expectedPath, \"utf8\")) as ExpectedSpec;",
  "eval/stability.ts :: const capture = JSON.parse(readFileSync(capturePath, \"utf8\")) as Capture;",
  "lib/api.ts :: typeof (data as { ok: unknown }).ok === \"boolean\"",
  "lib/extract/styleDump.ts :: const g = globalThis as unknown as { __name?: (fn: unknown) => unknown };",
  "lib/extract/styleDump.ts :: const g = globalThis as unknown as { __name?: (fn: unknown) => unknown };",
  "lib/interpret.ts :: Boolean(role && (REFINABLE_COLOR_ROLES as readonly string[]).includes(role));",
];

interface Snapshot {
  /** Section name → one string per case (JSON or a SHA-256 of it). */
  sections: Record<string, Record<string, string>>;
}

const sha = (s: string) => createHash("sha256").update(s).digest("hex");

// --- no network ------------------------------------------------------------

type FetchStub = () => Promise<Response>;
let fetchStub: FetchStub | null = null;
globalThis.fetch = async (input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (fetchStub && url === "https://openrouter.ai/api/v1/chat/completions") return fetchStub();
  throw new Error(`casts-check: unexpected fetch of ${url}`);
};
delete process.env.OPENROUTER_API_KEY;
delete process.env.OPENROUTER_MODEL;

/** Run `fn` with a dummy key and every model call answered by `stub`. */
async function withStubbedModel<T>(stub: FetchStub, fn: () => Promise<T>): Promise<T> {
  process.env.OPENROUTER_API_KEY = "casts-check-dummy";
  fetchStub = stub;
  try {
    return await fn();
  } finally {
    fetchStub = null;
    delete process.env.OPENROUTER_API_KEY;
  }
}

const reply = (body: unknown) => async () =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

/** Collect what `fn` prints through `console.warn`, as one line per call. An
 *  Error is recorded by class name only, because #182 rewords two messages. */
async function captureWarnings<T>(fn: () => Promise<T>): Promise<{ value: T; warnings: string[] }> {
  const warnings: string[] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((a) => (a instanceof Error ? "<Error>" : String(a))).join(" "));
  };
  try {
    return { value: await fn(), warnings };
  } finally {
    console.warn = original;
  }
}

/** Deterministic PRNG (mulberry32), so both runs see the same inputs. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- 1. the measured lane over the committed captures (states.ts, color.ts) --

async function capturesSection(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const slug of SLUGS) {
    const capture = JSON.parse(readFileSync(`eval/corpus/${slug}/capture.json`, "utf8")) as Capture;
    const { report, markdown } = await extractFromCapture(capture);
    out[`${slug}: report and markdown`] = sha(JSON.stringify({ report, markdown }));

    // buildStates over the capture's own nodes, each given seeded state deltas,
    // so many (role, state) buckets, properties and from/to ties are exercised.
    const rand = prng(182 + slug.length);
    const pick = <T,>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
    const properties = ["background-color", "color", "border-color", "box-shadow", "opacity"] as const;
    const values = ["rgb(37, 99, 235)", "rgb(29, 78, 216)", "#111827", "rgba(0, 0, 0, 0.5)", "none", "0.8"] as const;
    const nodes: NodeStyle[] = capture.styleDump.nodes.slice(0, 400).map((node) => {
      if (rand() < 0.35) return { ...node, states: undefined };
      const kinds = rand() < 0.5 ? (["hover"] as const) : (["hover", "focus"] as const);
      return {
        ...node,
        states: kinds.map((state) => ({
          state,
          changes: Array.from({ length: 1 + Math.floor(rand() * 3) }, () => ({
            property: pick(properties),
            from: pick(values),
            to: pick(values),
          })),
        })),
      };
    });
    const dump: StyleDump = { ...capture.styleDump, nodes };
    const states = buildStates(dump, report.palette);
    out[`${slug}: buildStates over seeded deltas`] = JSON.stringify(states ?? null);
    console.log(`info ${slug}: ${states?.entries.length ?? 0} state entries from the seeded deltas`);

    // The eval scorers, with a spec that also misses on purpose.
    const expected = yamlLoad(readFileSync(`eval/corpus/${slug}/expected.yaml`, "utf8")) as ExpectedSpec;
    const firstRole = Object.keys(expected.palette)[0];
    const paletteMiss = { ...expected.palette, [firstRole]: "#010203", "no-such-role": "#123456" };
    const typographyMiss = expected.typography?.scale
      ? { ...expected.typography, scale: { ...expected.typography.scale, "no-such-token": 10 } }
      : expected.typography;
    out[`${slug}: scorePalette and scoreTypography`] = JSON.stringify([
      scorePalette(report.palette, expected.palette),
      scorePalette(report.palette, paletteMiss),
      scoreTypography(report.typography, expected.typography),
      scoreTypography(report.typography, typographyMiss),
    ]);
  }

  const colors = ["#808080", "#000", "#fff", "#7f7f80", "#ff0000", "#2563eb", "rgb(12, 200, 99)", "hsl(300 50% 50%)"];
  out["hue of greys and colors"] = JSON.stringify(
    colors.map((c) => {
      const parsed = parseColor(c);
      return parsed ? hue(parsed) : null;
    }),
  );
  return out;
}

// --- 2. the image path (analyze.ts, imagePalette.ts) -------------------------

async function bandsPng(bands: [number, number, number][], width = 64, height = 48): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y++) {
    const band = bands[Math.floor((y / height) * bands.length)];
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3;
      raw[i] = band[0];
      raw[i + 1] = band[1];
      raw[i + 2] = band[2];
    }
  }
  return sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

/** One `analyzeImages` call as a comparable string: its keys, its JSON with
 *  the timestamps and the duration blanked, and its warnings — or the error. */
async function imageCase(run: () => ReturnType<typeof analyzeImages>): Promise<string> {
  const { value, warnings } = await captureWarnings(async () => {
    try {
      const result = await run();
      return {
        keys: Object.keys(result).sort(),
        hasStructureReport: result.structureReport !== undefined,
        result: JSON.parse(
          JSON.stringify({ ...result, meta: { ...result.meta, elapsedMs: 0 } }).replace(
            /\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z/g,
            "<timestamp>",
          ),
        ),
      };
    } catch (err) {
      return { threw: err instanceof Error ? `${err.constructor.name}: ${err.message}` : String(err) };
    }
  });
  // Sorted: the two lanes run concurrently, so their warnings interleave.
  return JSON.stringify({ value, warnings: [...warnings].sort() });
}

async function imagesSection(): Promise<Record<string, string>> {
  const a = await bandsPng([[255, 255, 255], [37, 99, 235], [17, 24, 39]]);
  const b = await bandsPng([[246, 248, 250], [220, 38, 127], [17, 24, 39], [229, 231, 235]]);
  const c = await bandsPng([[12, 12, 14], [245, 158, 11]]);
  const garbage = Buffer.from("this is not an image");
  const visionReply = reply({
    choices: [
      {
        message: {
          content: JSON.stringify({
            root: {
              componentName: "MainContent",
              type: "region",
              layoutAnnotation: "flex · column",
              children: [
                { componentName: "Hero", type: "content-block", textSnippet: "Build faster" },
                { componentName: "FeatureCard", type: "content-block", instanceCount: 3 },
              ],
            },
          }),
        },
      },
    ],
  });

  const out: Record<string, string> = {};
  out["no key, tokens, one image"] = await imageCase(() => analyzeImages([{ data: a, name: "a.png" }], "tokens"));
  out["no key, structure, two images"] = await imageCase(() =>
    analyzeImages([{ data: a, name: "a.png" }, { data: b.toString("base64") }], "structure"),
  );
  out["no key, both, three images and one unreadable"] = await imageCase(() =>
    analyzeImages([{ data: a, name: "a.png" }, { data: garbage, name: "bad.png" }, { data: b }, { data: c }], "both"),
  );
  out["no key, tokens, only an unreadable image"] = await imageCase(() =>
    analyzeImages([{ data: garbage, name: "bad.png" }], "tokens"),
  );
  out["stubbed model, structure, a valid vision reply"] = await withStubbedModel(visionReply, () =>
    imageCase(() => analyzeImages([{ data: a, name: "a.png" }], "structure")),
  );
  out["stubbed model, both, a valid vision reply"] = await withStubbedModel(visionReply, () =>
    imageCase(() => analyzeImages([{ data: a, name: "a.png" }, { data: c, name: "c.png" }], "both")),
  );
  out["stubbed model, both, a reply without JSON"] = await withStubbedModel(
    reply({ choices: [{ message: { content: "Sorry, no JSON today." } }] }),
    () => imageCase(() => analyzeImages([{ data: a, name: "a.png" }], "both")),
  );
  out["stubbed model, both, the call fails"] = await withStubbedModel(
    async () => {
      throw new Error("casts-check: simulated network failure");
    },
    () => imageCase(() => analyzeImages([{ data: a, name: "a.png" }], "both")),
  );
  out["stubbed model, structure, one image unreadable"] = await withStubbedModel(visionReply, () =>
    imageCase(() => analyzeImages([{ data: a, name: "a.png" }, { data: garbage, name: "bad.png" }], "structure")),
  );
  return out;
}

// --- 3. the provider reply (aiLane.ts) ---------------------------------------

const message = (content: unknown) => ({ choices: [{ message: { content } }] });

const REPLY_SHAPES: [string, unknown][] = [
  ["null", null],
  ["a number", 5],
  ["a string", "text"],
  ["true", true],
  ["an empty array", []],
  ["an empty object", {}],
  ["choices: null", { choices: null }],
  ["choices: a string", { choices: "abc" }],
  ["choices: a number", { choices: 7 }],
  ["choices: []", { choices: [] }],
  ["choices: [null]", { choices: [null] }],
  ["choices: [5]", { choices: [5] }],
  ["choices: ['s']", { choices: ["s"] }],
  ["choices: [{}]", { choices: [{}] }],
  ["message: null", { choices: [{ message: null }] }],
  ["message: a string", { choices: [{ message: "m" }] }],
  ["message: []", { choices: [{ message: [] }] }],
  ["message: {}", { choices: [{ message: {} }] }],
  ["content: null", message(null)],
  ["content: ''", message("")],
  ["content: spaces", message("   ")],
  ["content: text", message("hello")],
  ["content: padded text", message("  padded  ")],
  ["content: 0", message(0)],
  ["content: false", message(false)],
  ["content: 5", message(5)],
  ["content: true", message(true)],
  ["content: []", message([])],
  ["content: parts", message([{ type: "text", text: "hi" }])],
  ["content: an object", message({ text: "hi" })],
  ["choices: an object with key 0", { choices: { 0: { message: { content: "array-like" } } } }],
  ["two choices, the first empty", { choices: [{ message: { content: "" } }, { message: { content: "second" } }] }],
  ["two choices, the second malformed", { choices: [{ message: { content: "first" } }, { message: { content: 5 } }] }],
  ["extra fields", { id: "x", usage: { total_tokens: 3 }, choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "ok", refusal: null } }] }],
];

async function replySection(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const stubs: [string, FetchStub][] = [
    ...REPLY_SHAPES.map(([name, body]): [string, FetchStub] => [name, reply(body)]),
    ["a body that is not JSON", async () => new Response("<html>bad gateway</html>", { status: 200 })],
    ["status 500", async () => new Response("upstream down", { status: 500, statusText: "Internal Server Error" })],
  ];
  for (const [name, stub] of stubs) {
    out[name] = await withStubbedModel(stub, async () => {
      try {
        const text = await callModel({ user: "x", maxOutputTokens: 1 });
        return JSON.stringify(text === null ? { returned: null } : { returned: text });
      } catch (err) {
        // The message is printed, not compared: #182 rewords it for two shapes.
        // What `warnAiFailure` makes of it (its `detail` word) is compared.
        const { warnings } = await captureWarnings(async () => warnAiFailure("Lane", 1, err));
        console.log(`info reply "${name}" throws: ${err instanceof Error ? err.message : String(err)}`);
        return JSON.stringify({ threw: true, warned: warnings });
      }
    });
  }
  return out;
}

// --- 4. the in-page walkers (styleDump.ts, harvester.ts) ----------------------

const PAGE_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>casts check</title>
<style>
  body { font: 16px/1.5 sans-serif; margin: 24px; color: #111827; background: #ffffff; }
  .btn { background: #2563eb; color: #ffffff; border: 1px solid #1d4ed8; padding: 8px 16px; }
  .btn:hover { background: #1d4ed8; }
  .btn:focus-visible { box-shadow: 0 0 0 3px #f59e0b; }
  input[type="submit"] { background: #16a34a; color: #ffffff; }
  input[type="submit"]:hover { background: #15803d; }
  input[type="button"]:hover { background: #e5e7eb; }
  input[type="text"]:hover { border-color: #2563eb; }
  input[type="reset"]:hover { background: #fecaca; }
  a:hover { color: #1d4ed8; }
</style>
</head>
<body>
<header><nav><a href="#a">Alpha</a> <a href="#b">Beta</a></nav></header>
<main>
  <h1>Casts <em>check</em> page</h1>
  <p id="mixed">Visible lead <script>var hidden = "script text";</script><style>.x { color: red; }</style><noscript>noscript text</noscript><template><b>template text</b></template><!-- a comment --><span>inner <strong>strong</strong></span> tail.</p>
  <form onsubmit="return false">
    <input type="text" value="text field">
    <input type="submit" value="Send">
    <input type="SUBMIT" value="Upper">
    <input type="button" value="Plain button">
    <input type="reset" value="Reset">
    <input type="checkbox">
    <input value="no type">
    <button class="btn" type="button">Real button</button>
    <div role="button" class="btn">Role button</div>
  </form>
  <svg width="160" height="40" viewBox="0 0 160 40"><style>.s { fill: red; }</style><text x="4" y="24">svg text</text></svg>
  <section id="host"><h2>Moved in from a frame</h2></section>
</main>
<iframe id="frame" srcdoc="<p>frame</p>" width="20" height="20"></iframe>
<script>
  // Elements that a script creates in another frame's document and moves into
  // the page are no instance of this window's Element or HTMLInputElement.
  window.addEventListener("load", function () {
    var d = document.getElementById("frame").contentDocument;
    var input = d.createElement("input");
    input.type = "submit";
    input.value = "Moved submit";
    var wrap = d.createElement("div");
    wrap.appendChild(d.createTextNode("moved lead "));
    var span = d.createElement("span");
    span.textContent = "moved span";
    wrap.appendChild(span);
    var style = d.createElement("style");
    style.textContent = ".moved { color: red; }";
    wrap.appendChild(style);
    wrap.appendChild(d.createTextNode(" moved tail"));
    document.getElementById("host").append(input, wrap);
    window.__castsReady = true;
  });
</script>
</body>
</html>`;

async function pagesSection(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const dir = mkdtempSync(path.join(tmpdir(), "casts-check-"));
  const syntheticPath = path.join(dir, "casts-page.html");
  writeFileSync(syntheticPath, PAGE_HTML);
  const pages: [string, string, boolean][] = [
    ["synthetic page", pathToFileURL(syntheticPath).href, true],
    ...SLUGS.map((slug): [string, string, boolean] => [
      `fixture ${slug}`,
      pathToFileURL(path.resolve(`eval/fixtures/${slug}.html`)).href,
      false,
    ]),
  ];

  const browser = await chromium.launch({ headless: true });
  try {
    for (const [name, url, waitForReady] of pages) {
      const context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: 1,
        colorScheme: "light",
      });
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "load", timeout: 30_000 });
      if (waitForReady) await page.waitForFunction("window.__castsReady === true");
      const { styleDump, rawHarvestNode, responsiveHarvests, darkCapture } = await capturePage(page);
      await context.close();

      const dom = { styleDump, rawHarvestNode, responsiveHarvests, darkStyleDump: darkCapture?.styleDump };
      out[`${name}: style dump and harvests`] = sha(JSON.stringify(dom));
      const interactive = styleDump.nodes.filter((n) => n.interactive).length;
      console.log(`info ${name}: ${styleDump.nodes.length} style nodes, ${interactive} interactive`);

      if (waitForReady) {
        // Readable copies of what the two rewritten walkers decide, so a
        // difference names itself instead of showing as a changed hash.
        out["synthetic page: interactive nodes"] = JSON.stringify(
          styleDump.nodes
            .filter((n) => n.interactive)
            .map((n) => `${n.tag} ${Math.round(n.rect.x)},${Math.round(n.rect.y)} states:${(n.states ?? []).map((s) => s.state).join("+")}`),
        );
        const snippets: string[] = [];
        const walk = (node: typeof rawHarvestNode) => {
          if (!node) return;
          if (node.textSnippet) snippets.push(`${node.tagName}: ${node.textSnippet}`);
          node.children.forEach(walk);
        };
        walk(rawHarvestNode);
        out["synthetic page: text snippets"] = JSON.stringify(snippets);
      }
    }
  } finally {
    await browser.close();
    rmSync(dir, { recursive: true, force: true });
  }
  return out;
}

// --- 5. the assertions that remain -------------------------------------------

function remainingAssertions(): string[] {
  const run = spawnSync(
    "npx",
    [
      "eslint",
      ".",
      "--format",
      "json",
      "--rule",
      '{"@typescript-eslint/consistent-type-assertions":["error",{"assertionStyle":"never"}]}',
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const results = JSON.parse(run.stdout) as {
    filePath: string;
    source?: string;
    messages: { ruleId: string | null; line: number }[];
  }[];
  const found: string[] = [];
  for (const file of results) {
    const lines = (file.source ?? "").split("\n");
    for (const m of file.messages) {
      const where = path.relative(process.cwd(), file.filePath);
      if (m.ruleId !== "@typescript-eslint/consistent-type-assertions") {
        found.push(`${where} :: UNEXPECTED ${m.ruleId} at line ${m.line}`);
      } else {
        found.push(`${where} :: ${lines[m.line - 1].trim()}`);
      }
    }
  }
  return found.sort();
}

// --- main --------------------------------------------------------------------

async function collect(): Promise<Snapshot> {
  return {
    sections: {
      "measured lane": await capturesSection(),
      "image path": await imagesSection(),
      "provider reply": await replySection(),
      "in-page walkers": await pagesSection(),
    },
  };
}

async function main() {
  const [mode, file] = process.argv.slice(2);
  if ((mode !== "snapshot" && mode !== "compare") || !file) {
    console.error("usage: casts-check.mts snapshot|compare <file>");
    process.exit(2);
  }
  const now = await collect();
  const remaining = remainingAssertions();
  console.log(`info the trial lint rule finds ${remaining.length} assertions in ${process.cwd()}`);

  if (mode === "snapshot") {
    writeFileSync(file, JSON.stringify(now));
    const cases = Object.values(now.sections).reduce((n, s) => n + Object.keys(s).length, 0);
    console.log(`\nsnapshot written: ${file} (${cases} cases)`);
    return;
  }

  const before = JSON.parse(readFileSync(file, "utf8")) as Snapshot;
  let failed = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `: ${detail}` : ""}`);
  };

  for (const [section, cases] of Object.entries(before.sections)) {
    const names = Object.keys(cases);
    const got = now.sections[section] ?? {};
    const differing = names.filter((name) => got[name] !== cases[name]);
    const sameNames = JSON.stringify(Object.keys(got)) === JSON.stringify(names);
    check(
      `${section}: ${names.length} cases identical to the snapshot`,
      differing.length === 0 && sameNames,
      differing.length ? `${differing.length} differ` : sameNames ? "" : "the case names differ",
    );
    for (const name of differing) {
      console.log(`     ${name}\n       before: ${cases[name].slice(0, 600)}\n       after:  ${(got[name] ?? "<missing>").slice(0, 600)}`);
    }
  }

  const expected = [...EXPECTED_REMAINING].sort();
  const unexpected = remaining.filter((line, i, all) => {
    const nth = all.slice(0, i).filter((l) => l === line).length;
    return expected.filter((l) => l === line).length <= nth;
  });
  const missing = expected.filter((line, i, all) => {
    const nth = all.slice(0, i).filter((l) => l === line).length;
    return remaining.filter((l) => l === line).length <= nth;
  });
  check(
    `the trial lint rule finds exactly the ${expected.length} assertions that #182 leaves in place`,
    unexpected.length === 0 && missing.length === 0,
    `${remaining.length} found, ${unexpected.length} not expected, ${missing.length} expected and gone`,
  );
  for (const line of unexpected) console.log(`     not expected: ${line}`);
  for (const line of missing) console.log(`     gone:         ${line}`);

  if (failed > 0) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
  }
  console.log("\nall checks ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
````

### 1. Snapshot of the unchanged code (Task 1)

The patch is already applied in the repository, so take the snapshot in a detached worktree of the commit that the branch started from:

```bash
git worktree add --detach "$SCRATCH/base" "$(git merge-base HEAD main)"
ln -s "$PWD/node_modules" "$SCRATCH/base/node_modules"
(cd "$SCRATCH/base" && npx tsx "$SCRATCH/casts-check.mts" snapshot "$SCRATCH/before.json")
```

Expected: `info` lines, among them `info the trial lint rule finds 38 assertions in …/base`, then `snapshot written: … (61 cases)`, exit 0. It takes about 20 seconds. The `info reply … throws` lines show today's messages: `Cannot read properties of null (reading 'choices')` for the `null` reply and `text.trim is not a function` for the five replies whose `content` is set and is no string.

Then show that the check fails on the unchanged code:

```bash
(cd "$SCRATCH/base" && npx tsx "$SCRATCH/casts-check.mts" compare "$SCRATCH/before.json")
```

Expected: `ok` for the four identity lines (`measured lane: 10 cases`, `image path: 9 cases`, `provider reply: 36 cases`, `in-page walkers: 6 cases`), then `FAIL the trial lint rule finds exactly the 23 assertions that #182 leaves in place: 38 found, 15 not expected, 0 expected and gone` with the fifteen lines listed, and exit 1. If an identity line fails here, the check is not deterministic on this machine: stop and report it, because step 2 would prove nothing.

### 2. Compare after the change (Task 3; all four acceptance criteria of the issue)

From the repository root, with the patch applied:

```bash
npx tsx "$SCRATCH/casts-check.mts" compare "$SCRATCH/before.json"
```

Expected: five `ok` lines, `all checks ok`, exit 0. What the lines cover:

- `measured lane`: for each committed capture, the whole report and its Markdown, `buildStates` over the capture's nodes with seeded `:hover` and `:focus` deltas (10 to 12 entries each), and `scorePalette` and `scoreTypography` with a spec that matches and one that misses on purpose; then `hue` of eight colors, three exact greys among them.
- `image path`: nine `analyzeImages` calls, compared by their keys, their JSON (timestamps and duration blanked) and their warnings. They reach three of the four arms of the structure lane: not requested, no key, and the `then` callback, both with a stubbed vision reply that gives a report and with a stubbed reply or a failed call that gives none. The fourth arm, the `catch` callback, runs only if `structureFromImages` throws, which its own comment rules out (`lib/extract/structureFromImage.ts:140-143`); there the change is the callback's return type alone, and the compiler checks it. Three of the calls hold an unreadable image, which reaches the `catch` callback of `extractImagePalette`.
- `provider reply`: 36 replies through `callModel`, from `null` and `{}` to well-formed ones, compared by what is returned, by whether the call throws, and by the line that `warnAiFailure` logs for the thrown error. The messages are printed as `info` and not compared: after the change they read `OpenRouter reply is null, not a JSON object.` and `OpenRouter reply's message content is not a string.`
- `in-page walkers`: the style dump, the DOM harvest, the responsive harvests and the dark style dump of the three fixture pages and of a synthetic page, which holds seven inputs (text, submit, an upper-case `SUBMIT`, button, reset, checkbox, and one without a type), text beside `script`, `style`, `noscript`, `template` and a comment, an inline SVG, and elements moved in from a frame's document.
- The last line: the trial rule finds the 23 assertions of `EXPECTED_REMAINING` and no other. If `main` has moved since this plan and another issue has removed one of the 23, the line reports it as `expected and gone`: take that line out of `EXPECTED_REMAINING` and run the step again. A `not expected` line is a cast that this change must still remove, or one that it added.

### 3. Show that the identity check can fail

An identity check that cannot fail proves nothing. In `lib/extract/structure/harvester.ts`, inside `collectVisibleText`, change the element test `child.nodeType === Node.ELEMENT_NODE` to `child instanceof Element`. Run the command of step 2 again.

Expected: `FAIL in-page walkers: 6 cases identical to the snapshot: 2 differ`, naming `synthetic page: style dump and harvests` and `synthetic page: text snippets`, and exit 1. Then restore the line, check that `git diff --stat` shows the eleven files again, and run step 2 once more: `all checks ok`.

### 4. The running app (Task 4)

Use the verify skill (`.claude/skills/verify/SKILL.md`). The AI lane stays off, which is the default of `verify.sh up`, so nothing reaches a model provider. Run `up` with its output unpiped.

```bash
V=.claude/skills/verify/scripts/verify.sh
$V up
$V doctor
$V drive analyze-url
$V drive analyze-images
$V drive tabs-downloads
$V drive error
source .verify/current.env
E=$RUN_DIR/evidence/api-$(date +%H%M%S); mkdir -p $E
for i in 1 2; do curl -s -o $E/url-$i.json -w "%{http_code} %{time_total}s\n" -X POST -H 'content-type: application/json' -d "{\"url\":\"$FIXTURE_URL/dark-mode.html\",\"mode\":\"tokens\"}" $APP_URL/api/analyze; done
cmp $E/url-1.json $E/url-2.json
$V down
```

Expected: every `doctor` line is `ok`, with `ai-lane off`. Each `drive` prints `all checks passed`. The `curl` loop prints `200` twice, the second time in milliseconds, and `cmp` prints nothing. Measured on the prototype: 13, 18, 22 and 5 checks, and 3.4 s then 0.019 s.

What each part proves:

- `analyze-images` uploads three PNGs through the file input, so `readFileAsDataURL` produces the thumbnails and the preview. Without a key it also takes the no-key arm of the structure lane and shows its reason.
- `analyze-url` and `tabs-downloads` render a fixture page, so `isInteractive` and `collectVisibleText` run in a real page, and the report and structure tabs show their output.
- The `curl` loop reads its second answer through `getCache`.
- `console-errors.txt` of the first three scenarios is empty.

Cite `GIT_HEAD` from `doctor` and the evidence directory in the report. Do not start `npm run check` before `$V down` has run.

### 5. Full gate (Task 5; fourth acceptance criterion of the issue)

```bash
git worktree remove --force "$SCRATCH/base"
rm -rf "$SCRATCH"
npm run check
git status --short
git diff --stat -- eval/baseline.json eval/corpus
git worktree list
```

Expected: `npm run check` exits 0, and its eval part prints `combined 100%` for `clean-light`, `dark-mode` and `adversarial-shell`, `aggregate combined: 100%` and `✓ all gates passed`, the same as on `main`. `git status --short` lists the eleven files of the Files to Change table and the plan, patch and report files only. The `git diff --stat` line prints nothing: the baseline and the corpus are untouched. `git worktree list` shows no worktree under the scratch directory.

## Risks

| Risk | Mitigation |
|------|------------|
| The issue's second criterion names `instanceof` for three sites, and `instanceof` changes results for elements that were moved in from another frame's document (measured, see the Summary). | In scope. The patch narrows with `in` (`isInteractive`) and with a wider parameter type (`collectVisibleText`), which give today's result for every node. Open Question 1 asks the owner to confirm this reading of the criterion. Step 3 shows the difference on demand. |
| `firstChoiceText` rewords the error that reaches the log for a `null` reply and for a `content` that is no string. | In scope, as Open Question 2. The check compares, for 36 replies, what is returned, whether the call throws, and the line that `warnAiFailure` logs. Only the wording of the `Error` differs. |
| The two in-page walkers are serialized into the page, where a mistake shows only in a browser. `npm run eval` replays frozen captures and never runs them. | In scope. The check renders four pages in headless Chromium and compares the style dump and the harvest, and step 4 runs both walkers in the real app. The patch adds no named function inside a browser callback, so the `__name` shim is not involved. |
| `main` moves before `/implement` runs, and the patch no longer applies. | `/implement` runs `git apply --check` first. On failure, write the change from the table of the Summary and the notes of Task 2. The check finds its casts by source text, not by line number. |
| #183 is still open and will change `eval/run.ts` and the `ExpectedSpec` type that `eval/score.ts` exports. | Out of scope here. This plan changes four lines of `eval/score.ts` (two `Map` constructions, two lookups) and nothing in `eval/run.ts`, so #183 can follow without a conflict in the lines that it owns. Flag only. |
| A verify instance left running makes `npm run build` and `npm run check` exit non-zero (`scripts/guard-build.mjs`). | In scope. Step 4 ends with `verify.sh down`, and step 5 runs after it. |
| The trial rule is not part of `eslint.config.mjs`, so a new cast in these files would pass `npm run lint` later. | Out of scope. 23 assertions remain, so the rule cannot be turned on in this issue. Flag only: after #183, the owner can decide on the rule with an allow-list. |
| `lib/api.ts:55` casts inside `isAnalyzeResponse` although the `in` test on the line above already narrows `data`. | Out of scope: the review did not name it, and the issue leaves casts inside a type guard alone. Flag only. |

## Open Questions

1. **`instanceof` at the in-page sites, or a narrowing that keeps every result?** The issue's second criterion says that `lib/extract/styleDump.ts:351` and `lib/extract/structure/harvester.ts:52`, `:54` (today `:393`, `:52`, `:54`) "narrow with `instanceof`", and its description says "no behaviour changes". The two conflict for an element that a script created in another frame's document and moved into the page: it fails `instanceof Element` and `instanceof HTMLInputElement` in the page's own window. Measured on the check's synthetic page, `instanceof` drops such a submit input from the interactive nodes and drops such an element's text from the `textSnippet` of its parent.
   - **Proposed default (in the patch):** keep every result. `isInteractive` narrows with an `in` test for `type`, and `collectVisibleText` takes a `Node` and reads `nodeName`. Both remove the casts, and `in` ranks above `instanceof` in the narrowing order that the finding cites (ts-best-practices: "discriminated union switch > `in` operator > typeof/instanceof > type guard > `as`"). The criterion is then met in its purpose and not in its wording.
   - **Alternative:** follow the wording. In `isInteractive`, test `el instanceof HTMLInputElement` in place of the `tagName` and `in` tests; in `collectVisibleText`, keep the `Element` parameter and test `child instanceof Element`. Then take the script block that moves elements in from the frame out of `PAGE_HTML` in the check, because the three synthetic-page cases differ by design, and say in the report that pages which move elements across frames lose those signals.
2. **A malformed provider reply: keep the throw, or return `null`?** Today a `null` reply and a `content` that is set and is no string (a number, `true`, an array of parts, an object) make `callModel` throw a `TypeError` by accident. `retryOnce` logs it through `warnAiFailure`, retries once, and the lane ends as failed.
   - **Proposed default (in the patch):** keep the throw for exactly these shapes, with a message that says what was wrong. The lane's outcome, the retry and the logged `detail` word stay the same, and only the wording of the error changes. This also keeps the rule of `callModel`'s comment (`lib/aiLane.ts:38-42`): `null` only for a call that succeeded and produced no usable text.
   - **Alternative:** return `null` for them. The outcome and the retry stay the same, and the two warning lines per failed lane no longer appear. Measured: 6 of the check's 36 replies then differ from the snapshot.

## Acceptance Criteria

- [ ] All tasks completed
- [ ] The four casts of `lib/analyze.ts` and the one of `lib/extract/imagePalette.ts` give way to one declared outcome type per file and annotations (Task 2). The issue's `lib/analyze.ts:242` and `:359` no longer exist: #172 removed them
- [ ] `readFileAsDataURL` and `hue` test with `typeof`; `isInteractive` and `collectVisibleText` hold no cast and give today's result for every node, with the form of the narrowing as Open Question 1 settles it (Task 2; the `in-page walkers` line of step 2)
- [ ] `buildStates` keeps `target` and `state` in the bucket; `getCache` returns `unknown`; the two maps of `eval/score.ts` take string keys; `callModel` reads the reply as `unknown` and narrows it (Task 2)
- [ ] The trial rule reports 23 assertions and none of the fifteen (the last line of step 2)
- [ ] The scratch check prints `all checks ok` against the snapshot of the unchanged code (step 2), and fails on a deliberately changed walker (step 3)
- [ ] The verify scenarios `analyze-url`, `analyze-images`, `tabs-downloads` and `error` pass with the AI lane off, the cache recipe returns a byte-identical second body, and no verify instance is left running (step 4)
- [ ] `npm run check` passes with the same eval scores, with `eval/baseline.json` and `eval/corpus/*` untouched (step 5)
- [ ] No paid model call was made, and no scratch file or worktree is left behind
