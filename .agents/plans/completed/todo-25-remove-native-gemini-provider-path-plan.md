# Plan: TODO-25: Remove the native Gemini provider path and run the AI lane over OpenRouter only

## Summary

`callModel` (`lib/aiLane.ts:211-216`) has two provider paths. It takes the OpenRouter one whenever `OPENROUTER_API_KEY` is set, which is how the owner runs the app, so the native Gemini path (`callGeminiModel`, `lib/aiLane.ts:176-202`) is never taken there. Keeping it costs a second path to verify, a Gemini-only `thinkingLevel` knob that the OpenRouter path ignores with a warning (`lib/aiLane.ts:91-97`), and the `@google/genai` dependency. This plan (GitHub issue #199) removes the path, the knob, the two `GEMINI_*` variables and the dependency, so that the AI lane has one provider, OpenRouter, which still routes to Gemini models by default (`google/gemini-3.5-flash`, `lib/aiLane.ts:89`).

The code change was prototyped while planning and is saved as a patch (see Metadata). The patch covers every file that is compiled or executed: the seam, the three callers, the messages, the comments, the verify script, `package.json` and the lockfile. The tasks below cover what the patch leaves: syncing `node_modules`, the docs, the verify skill's Markdown, and the checks.

Measured while planning, on `main` at `00aaea0`:

- **The request that reaches OpenRouter does not change.** The offline probe of the End-to-End Verification section records the sha256 of each lane's request body. The three hashes are the same on `main` and on the prototype, so with an OpenRouter key the app sends the same bytes before and after.
- **The probe shows the change.** On `main` it exits 1 with 2 failed checks (`aiLaneAvailable()` is true with only `GEMINI_API_KEY`; one `thinkingLevel` warning is logged). On the prototype every check prints `ok`.
- **The prototype is green.** In the prototype worktree `npm run typecheck`, `npm run lint`, `npm run build` and `npm run eval` exit 0, with eval at 100% for `clean-light`, `dark-mode` and `adversarial-shell`. The built `.next/server` and `.next/static` hold no reference to `google/genai`.
- **All three lanes answer over OpenRouter today.** A cut-down live baseline on `main` (3 calls, one per lane) returned HTTP 200 and a Zod-validated reply for each lane (Environment Findings).
- `npm run eval` passes `forceHeuristicNaming` (`eval/run.ts:60-66`) and never calls `callModel`, so the eval gate cannot see this change. The probe, `npm run eval:ai` and the verify run can.

Decisions:

- **`callOpenRouterModel` becomes `callModel`.** One exported function, no one-line wrapper around a private one, so "one path" is also one function. The patch does this.
- **No replacement for the thinking cap.** OpenRouter has its own reasoning parameter, but the issue asks for the knob to go, and the app has run without a cap over OpenRouter since #94. The live baseline measured 0 reasoning tokens, and no lane used more than about a third of its `max_tokens` budget. A cap over OpenRouter would be a new feature; see Risks.
- **`warnAiFailure` keeps its `RESOURCE_EXHAUSTED`, `Quota` and `INVALID_ARGUMENT` markers** (`lib/aiLane.ts:272-283`). The thrown error carries OpenRouter's response body (`lib/aiLane.ts:163-166`), which can relay the upstream provider's status text, and the issue does not name them.
- **The setup hint links to `https://openrouter.ai/keys`.** It answered 307 to the key page's redirect while planning.
- **The PRD's current-state lines are rewritten; its delivery records are not.** A record of a past phase that names Gemini stays true as history. Two struck records and one risk row get a dated closure note, as `.agents/PRDs/PRD.md:65` already does.
- **No migration message** (owner approved, issue notes): a setup that has only `GEMINI_API_KEY` behaves as a setup with no key.

## User Story

As the maintainer of Distill
I want the AI lane to have one provider path, OpenRouter
So that there is one path to verify, no knob that one path ignores, and no model SDK in the dependencies

## Metadata

| Field | Value |
|-------|-------|
| Type | REFACTOR |
| Complexity | MEDIUM |
| Systems Affected | `lib/aiLane.ts`, the three AI callers, `lib/analyze.ts`, `app/page.tsx`, `eval/stability.ts`, `eval/run.ts`, `package.json` and the lockfile, the verify skill, `README.md`, `techstack.md`, `docs/architecture/orchestration.md`, `.agents/PRDs/PRD.md` |
| GitHub Issue | #199 (TODO-25; related: #177, #158) |
| PRD Phase | N/A |
| Prototype Patch | `.agents/plans/todo-25-remove-native-gemini-provider-path-prototype.patch` |

---

## Environment Findings

| Probe | Result |
|-------|--------|
| Tree | `main` at `00aaea0`, clean. No `verify.sh` instance is up (`.verify/current.env` is absent) |
| Toolchain | Node v22.23.1, npm 10.9.8 |
| Baseline | `npm run check` passes on `main` with eval at 100% on the three required fixtures (run by the orchestrator before this plan). Start green, stay green |
| Importers of the SDK | One: `lib/aiLane.ts:10`. `@google/genai` 2.13.0 is the only package that needs its 36 transitive dependencies |
| Lockfile after `npm uninstall @google/genai` | 37 packages leave (`@google/genai`, `google-auth-library`, `protobufjs`, `ws`, `node-fetch`, `gaxios` and 31 more). 4 packages that stay flip to `"dev": true` because only the SDK needed them at runtime: `@types/node`, `debug`, `ms`, `undici-types`. A second `npm install --package-lock-only` on the patched tree changes nothing |
| Offline probe on `main` | exit 1, 2 failed checks: `A: aiLaneAvailable() with only GEMINI_API_KEY: true`, `B: thinkingLevel warnings logged: 1` |
| Offline probe on the prototype | exit 0, `all checks ok`; the three request-body hashes equal those of `main` |
| Leftover-reference greps on `main` | code grep: 44 matching lines; docs grep: 14; PRD grep: 21 (End-to-End Verification, step 2, has the commands) |
| Keys on this host | `.env.local` defines `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` and `GEMINI_API_KEY`. Values were never printed |
| Live baseline on `main`, 3 calls | interpretation: HTTP 200, validated, 195 of 2048 tokens. Structure Stage 7: HTTP 200, `naming ai`, 1159 of 4000. Image structure: HTTP 200, validated, `fidelity inferred`, 1323 of 4096. Each: `finish_reason stop`, 0 reasoning tokens, routed model `google/gemini-2.5-flash` (the host's `OPENROUTER_MODEL`), provider Google |
| The default model id | `google/gemini-3.5-flash` is in OpenRouter's public model list with image input, `structured_outputs` and `reasoning` among its supported parameters. It was not called live, because the host overrides it |
| Forward references to #199 | Only the story itself, `.agents/issues/todo-issues.md:976-1008`. None in the source, the docs or earlier plans |

Issue-stated line numbers, re-measured:

- The `README.md` numbers of the issue notes (`68-92`, `:155`) are stale: commit `00aaea0` rewrote the file. The lines are `README.md:65-69` (the provider list), `:79-89` (the `.env.local` options) and `:131-133` (the `docker run` example).
- Every other number of the issue notes matches the tree.
- Places that the issue notes do not name and the change still has to touch: the header comment of `lib/aiLane.ts:1-8`, `lib/aiLane.ts:33` and `:41` (the SDK client and the warning flag), `techstack.md:18` (the count "9 total" becomes 8) and `:55-56`, and `.agents/PRDs/PRD.md:428` and `:438`.

---

## Patterns to Follow

### The key check of the seam

```ts
// SOURCE: lib/aiLane.ts:83-87
async function callOpenRouterModel(opts: ModelCall): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set — AI lane called without an available key.");
  }
```

### Error handling: a lane never throws, and a failure is logged by lane name

```ts
// SOURCE: lib/extract/structureFromImage.ts:170-174
  const aiRoot = await retryOnce(
    () => requestOnce(imageBlocks),
    (err, attempt) => warnAiFailure("Vision structure inference", attempt, err),
  );
  if (!aiRoot) return null;
```

The three lane names in the log are `AI Interpretation lane` (`lib/interpret.ts:180`), `AI Structure Labeller` (`lib/extract/structure/structureAI.ts:207`) and `Vision structure inference` (`lib/extract/structureFromImage.ts:172`). A lane with no key returns before any call (`lib/interpret.ts:171`).

### Tests: no unit-test framework; a scratch script calls the real entry points on a committed capture

```ts
// SOURCE: eval/stability.ts:62-72
  const capture = JSON.parse(readFileSync(capturePath, "utf8")) as Capture;
  const { report } = await extractFromCapture(capture);
  ...
    const interpretation = await interpret({
      screenshotsPngBase64: [capture.viewportShot],
      palette: report.palette,
      typography: report.typography,
    });
```

### A PRD record that later work overturned: strike nothing new, append a dated note

```markdown
<!-- SOURCE: .agents/PRDs/PRD.md:65 -->
- [x] ~~**Regression:** that seam is no longer single-provider. …~~ — **closed 2026-07-29 (DIST-056).** `jsonSchema` now sends …
```

---

## Files to Change

| File | Action | In the patch | Purpose |
|------|--------|--------------|---------|
| `lib/aiLane.ts` | UPDATE | yes | Drop the SDK import, `ThinkingLevel`, `AI_MODEL`, the SDK client, the warning flag and `callGeminiModel`; `aiLaneAvailable` reads only `OPENROUTER_API_KEY`; `callOpenRouterModel` becomes the exported `callModel`; `ModelCall` loses `thinkingLevel` |
| `lib/interpret.ts` | UPDATE | yes | Drop `thinkingLevel` and the import; rewrite the comments of lines 32-39 and 60-66 |
| `lib/extract/structure/structureAI.ts` | UPDATE | yes | Drop `thinkingLevel` and the import; the comment of line 184 names `OPENROUTER_API_KEY` |
| `lib/extract/structureFromImage.ts` | UPDATE | yes | Drop `thinkingLevel` and the import; the comment of line 16 names `OPENROUTER_API_KEY` |
| `lib/analyze.ts` | UPDATE | yes | The no-key message of line 279 names only `OPENROUTER_API_KEY` |
| `lib/extract/imageMediaType.ts` | UPDATE | yes | Comment of line 18 |
| `app/page.tsx` | UPDATE | yes | The setup hint of lines 428-436 names only `OPENROUTER_API_KEY` and links to `openrouter.ai/keys` |
| `eval/stability.ts` | UPDATE | yes | The comment of line 16 and the skip message of line 93 |
| `eval/run.ts` | UPDATE | yes | Comment of line 62 |
| `.claude/skills/verify/scripts/verify.sh` | UPDATE | yes | Line 79 sets only `OPENROUTER_API_KEY=` empty |
| `package.json`, `package-lock.json` | UPDATE | yes | `@google/genai` and its 36 transitive packages removed |
| `README.md` | UPDATE | no | Task 2 |
| `techstack.md` | UPDATE | no | Task 3 |
| `docs/architecture/orchestration.md` | UPDATE | no | Task 4 |
| `.agents/PRDs/PRD.md` | UPDATE | no | Task 5 |
| `.claude/skills/verify/SKILL.md`, `.claude/skills/verify/features/analyze-images.md` | UPDATE | no | Task 6 |

No change: `AGENTS.md` (it names no provider and no key variable), `Dockerfile`, `.github/workflows/ci.yml`, `next.config.mjs`, `.claude/skills/verify/scripts/drive.ts` (it reads the banner text from the API response, lines 305-307), `eval/baseline.json`, `eval/corpus/*`, the plans, reports and reviews under `.agents/` (history), `.agents/issues/todo-issues.md` and the git-ignored `TODO.md` (`/update-issues` and `/update-todo` own them), and the owner's `.env.local`.

---

## Tasks

Execute in order. Each task is atomic and verifiable. The patch is applied before Task 1 (the Metadata row), so no task writes the code that the patch holds.

### Task 1: Sync `node_modules` with the patched lockfile

- **File**: `package.json`, `package-lock.json` (patched), `node_modules/`
- **Action**: UPDATE (install only; edit neither file by hand)
- **Implement**: Run `npm install` in the project root. It removes the 37 packages that the lockfile no longer lists, and its `postinstall` runs `playwright install chromium`, which finds the browser already installed. Do not run `npm ci`: it would download every package again. If `npm install` changes `package-lock.json` beyond the patch, stop and report the diff.
- **Mirror**: `package.json:18` (`postinstall`)
- **Validate**: `test ! -e node_modules/@google/genai && git apply --check -R .agents/plans/todo-25-remove-native-gemini-provider-path-prototype.patch && npm run typecheck && npm run lint` (the reverse check passes only while the tree still holds exactly what the patch wrote)

### Task 2: Name OpenRouter as the only provider in the README

- **File**: `README.md`
- **Action**: UPDATE
- **Implement**:
  - Lines 65-69: replace the bullet, its two sub-bullets and the paragraph under them with one bullet and one paragraph. The bullet: an OpenRouter API key is optional; the AI lane needs one (keep the parenthesis that lists `identity`, `imageMood`, semantic structural refinement and vision-inferred structure from images); without a key, deterministic token extraction works fully offline; OpenRouter is the only provider: set `OPENROUTER_API_KEY`, and choose the model with `OPENROUTER_MODEL` (it defaults to `google/gemini-3.5-flash`). The paragraph: structured output is requested with a real (non-strict) `response_format: json_schema`; support for it varies by the routed model, and Zod is the real shape gate either way. Say nothing about `thinkingLevel`, a second provider, or which key wins.
  - Lines 79-88: end the sentence of line 79 at "to enable the AI interpretation lane:" (drop "Pick one provider"). The `env` block holds three lines: `# .env.local`, `OPENROUTER_API_KEY=...`, and `OPENROUTER_MODEL=google/gemini-3.5-flash   # optional; this is the default`. Line 89 stays as it is.
  - Lines 131-133: one `docker run` line, `docker run -p 3000:3000 -e OPENROUTER_API_KEY="..." distill`; drop the Gemini line and the comment "or with OpenRouter instead".
  - Keep the README's plain voice: full sentences, no new headings.
- **Mirror**: `README.md:93-97` (a sentence, then a short `env` block)
- **Validate**: `! grep -nE "GEMINI|aistudio|thinkingLevel|[Bb]oth (keys|paths)|Two providers" README.md && grep -c "OPENROUTER_API_KEY" README.md` (the count must be 3)

### Task 3: Correct the tech-stack write-up

- **File**: `techstack.md`
- **Action**: UPDATE
- **Implement**:
  - Line 18: "9 total" becomes "8 total".
  - Line 28: delete the `@google/genai` row.
  - Lines 55-60: rewrite the paragraph under a new lead "**One AI provider, no SDK.**": `lib/aiLane.ts` speaks to OpenRouter over plain `fetch` (`/chat/completions`), so no model SDK is a dependency; the model defaults to `google/gemini-3.5-flash` and `OPENROUTER_MODEL` overrides it; no other file is allowed to call a model provider, inline a model id, or scrape JSON out of a model response.
- **Mirror**: `techstack.md:62-64` (a bold lead sentence, then the constraint it carries)
- **Validate**: `! grep -nE "genai|GEMINI|Gemini SDK|Two AI providers" techstack.md && grep -n "8 total" techstack.md`

### Task 4: Correct the orchestration write-up

- **File**: `docs/architecture/orchestration.md`
- **Action**: UPDATE
- **Implement**:
  - Line 7, first sentence: `lib/aiLane.ts` is "the only file allowed to call a model provider" (not "import a model-provider SDK"), and it owns "the default model id" (not "the pinned `AI_MODEL`"). Leave the rest of the list of what it owns.
  - Line 7, the sentence that starts "Told is not enforced, though:": replace it with one that says the schema is sent non-strict, so the routed model may ignore a bound, and Zod stays the only gate. Remove the mention of the `@google/genai` doc comment and of the native Gemini path. Keep the last sentence ("Don't inline a model id, …").
  - Line 9: rewrite the paragraph under the lead "**One provider, one seam.**": `callModel` sends every round-trip to OpenRouter's `/chat/completions` (model from `OPENROUTER_MODEL`, default `google/gemini-3.5-flash`; images as `data:` URLs; `jsonSchema` sends a real, non-strict `response_format: json_schema`, and keep the existing reason why it is not `strict: true`); `aiLaneAvailable()` is true only when `OPENROUTER_API_KEY` is set, and a `GEMINI_API_KEY` is not read (#199); there is no thinking cap: `ModelCall` has no such field and the request carries only `max_tokens`, so a lane's `maxOutputTokens` has to hold the routed model's thinking prelude and its answer; Zod remains the shape gate, since `parseJsonLoose` never validates shape.
- **Mirror**: `docs/architecture/orchestration.md:5` (dense paragraph, symbols in backticks)
- **Validate**: `! grep -nE "AI_MODEL|GEMINI_MODEL|genai|thinkingLevel|Two providers|SDK" docs/architecture/orchestration.md && grep -c "GEMINI_API_KEY" docs/architecture/orchestration.md` (the count must be 1, the "is not read" sentence)

### Task 5: Bring the PRD's current-state lines in line

- **File**: `.agents/PRDs/PRD.md`
- **Action**: UPDATE
- **Implement** (line numbers are those of `main`; work from the bottom of the file upward so that they stay valid):
  - Line 459, key dependencies: the AI lane's dependency is `[OpenRouter](https://openrouter.ai)` (key: `https://openrouter.ai/keys`); drop Google Gen AI and the aistudio link.
  - Line 448, the risk row "Provider-specific capability gaps…": append to its mitigation cell "**Closed (#199):** the native Gemini path and `thinkingLevel` were removed, so there is one request builder."
  - Line 439: remove "`thinkingLevel: MEDIUM` on the vision lane; " from the mitigation cell.
  - Line 438: the risk becomes "**AI-lane screenshots pass through OpenRouter and the provider that it routes to**"; the mitigation: documented in §9; operators decide before they point Distill at sensitive properties. Drop the free-tier wording.
  - Line 437: the risk becomes "**Provider rate limits (429)**" with the same sentence about two AI calls and up to four images; the mitigation keeps the cache and the server-console check, and its last clause becomes "raise the OpenRouter limit if it binds". State no rate figure.
  - Line 428: "if rate limits or the provider's data-use terms become binding constraints, change the OpenRouter model or account"; keep the clause that this is not an argument for a multi-provider abstraction layer.
  - Line 232, data-handling note: AI-lane inputs are screenshots of third-party sites; they go to OpenRouter, a data processor with its own retention terms, which routes them to the model's provider (Google for the default model); the request sends an identifying `HTTP-Referer`/`X-Title` pair; operators who point Distill at sensitive or internal properties should check both sets of terms first. Drop the free-tier sentence.
  - Lines 214-217, the env table: delete the `GEMINI_API_KEY` and `GEMINI_MODEL` rows; `OPENROUTER_API_KEY`: "Enables the AI lane. Read server-side only"; `OPENROUTER_MODEL`: "Model id (default `google/gemini-3.5-flash`)".
  - Line 202, the AI lane row: first cell "OpenRouter over plain `fetch` (no model SDK), gated on `OPENROUTER_API_KEY`; model from `OPENROUTER_MODEL` (default `google/gemini-3.5-flash`)"; second cell: vision interpretation and semantic naming; fails open; sends a real non-strict `response_format: json_schema`; no thinking cap is sent; the native Gemini SDK path of Phase 5 was removed (#199).
  - Line 102: append "**Reverted (#199):** the native Gemini path was removed, so the AI lane has one provider, OpenRouter, and one code path again."
  - Line 65: append "**Superseded (#199):** the native Gemini path, `GEMINI_MODEL` and `thinkingLevel` were removed; the seam is single-provider again."
  - Line 4: set `Last Updated:` to the date of the change.
  - Do not edit the delivery records of past phases: lines 77, 79, 287, 336-344, 377-379 and 456.
- **Mirror**: `.agents/PRDs/PRD.md:65` (a record plus a dated closure note)
- **Validate**: `grep -cE 'GEMINI_API_KEY|GEMINI_MODEL|@google/genai|thinkingLevel|aistudio|[Ff]ree.tier|Google Gen AI' .agents/PRDs/PRD.md` (must print 11; it prints 21 on `main`; step 2 of End-to-End Verification names the 11 lines)

### Task 6: Correct the verify skill's Markdown

- **File**: `.claude/skills/verify/SKILL.md`, `.claude/skills/verify/features/analyze-images.md`
- **Action**: UPDATE
- **Implement**:
  - `SKILL.md:28`: "`OPENROUTER_API_KEY=` set empty, so the AI lane is **off**. Next never overrides an env var that is already defined, so the `.env.local` key is ignored." Keep the two sentences that follow, with "keys" in the singular ("to keep the `.env.local` key").
  - `features/analyze-images.md:11`: the banner text becomes `Structure inference for images requires an AI key — set OPENROUTER_API_KEY.`, which is the string of `lib/analyze.ts:279` after the patch.
- **Mirror**: `.claude/skills/verify/SKILL.md:27` (a bullet that names the env var and what it causes)
- **Validate**: `! grep -rn "GEMINI" .claude/skills/verify && grep -c "set OPENROUTER_API_KEY\." .claude/skills/verify/features/analyze-images.md lib/analyze.ts`

### Task 7: Run the offline probe and the leftover-reference greps, then delete the scratch file

- **File**: `scratch/openrouter-only-probe.mts` (scratch, never committed)
- **Action**: CREATE, run, DELETE
- **Implement**: Follow steps 1 and 2 of End-to-End Verification. The scratch script runs from the project root (`AGENTS.md`, "Manually verifying extraction changes"). Delete `scratch/` afterwards.
- **Mirror**: `eval/stability.ts:59-72` (load a committed capture, extract, call `interpret`)
- **Validate**: `npx tsx scratch/openrouter-only-probe.mts && rm -r scratch && git status --short`

### Task 8: Run the live checks, then the full gate

- **File**: `.verify/` (git-ignored evidence; no tracked file changes)
- **Action**: run
- **Implement**: Follow steps 3 to 6 of End-to-End Verification. Never print, log or write a key value. If a live call cannot run (quota, network, a provider error), report that check as PENDING with the verbatim error line, not as passed. Run `verify.sh down` before `npm run check`.
- **Mirror**: `.claude/skills/verify/features/analyze-url.md:23-26`, `.claude/skills/verify/features/analyze-images.md:24-26`
- **Validate**: `test ! -e .verify/current.env && npm run check`

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Eval gate (must print 100% for each of the three fixtures and "all gates passed")
npm run eval

# Everything CI runs: typecheck → lint → build → eval (no verify.sh instance may be up)
npm run check
```

`npm run eval` does not exercise the changed code, and CI has no key, so nothing in `npm run check` reaches a provider. The checks that exercise the change are the steps below.

## End-to-End Verification

`V=.claude/skills/verify/scripts/verify.sh` below. All commands run from the project root.

### 1. Offline: one provider, the same request (first and second acceptance criteria)

No network and no real key. The script calls the real entry points of the three lanes on the committed `clean-light` capture with `fetch` replaced by a stub. It sets and unsets the key variables itself, so the shell's environment does not matter. On `main` it exits 1 with 2 failed checks; after the change every check must print `ok` and it must exit 0.

`mkdir -p scratch`, create `scratch/openrouter-only-probe.mts` with this content, and run `npx tsx scratch/openrouter-only-probe.mts`:

````typescript
// Offline check for #199. Scratch only: run from the project root with
//   npx tsx scratch/openrouter-only-probe.mts
// and delete it afterwards. No network and no real key: `fetch` is replaced by
// a stub that answers OpenRouter requests and fails every other URL.
//
// Part A: a setup that has only GEMINI_API_KEY is a no-key setup.
// Part B: with an OpenRouter key, each of the three AI lanes sends exactly one
//         request to OpenRouter, gets a validated reply, logs no thinkingLevel
//         warning, and sends the same request bytes as before the change.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { extractFromCapture, extractStructureFromCapture, type Capture } from "@/lib/analyze";
import { aiLaneAvailable, interpret } from "@/lib/interpret";
import { structureFromImages } from "@/lib/extract/structureFromImage";

// sha256 of the request body of each lane, measured on `main` at 00aaea0 with
// OPENROUTER_API_KEY set to a dummy value and OPENROUTER_MODEL unset.
const BODY_SHA256_ON_MAIN: Record<string, string> = {
  interpretation: "fe2946a0d44b07e935851b9cd69d2447715564f935a03ef72bfef5df9c859179",
  "structure stage 7": "58125332923ec628ae82392573951d06da68f5d98705e6f6ea0529b5e3e935ef",
  "image structure": "c9850b8bf946578294bbe45537d9fbe9f140719e097b041f17c87bafef495e77",
};

const REPLIES: Record<string, unknown> = {
  interpretation: {
    identity: { adjectives: ["calm", "clean", "quiet"], archetype: "The Sage", description: "Quiet." },
    imageMood: { hero: ["soft morning light interior"], texture: ["paper grain"] },
    roleRefinements: [],
  },
  "structure stage 7": { nodeUpdates: [], componentDefinitions: {}, sectionDescriptions: {} },
  "image structure": { root: { componentName: "MainContent", type: "region" } },
};

interface Sent {
  url: string;
  body: string;
}
let sent: Sent[] = [];
let lane = "";

globalThis.fetch = (async (url: unknown, init?: { body?: unknown }) => {
  sent.push({ url: String(url), body: String(init?.body ?? "") });
  if (!String(url).startsWith("https://openrouter.ai/")) {
    throw new Error(`unexpected fetch: ${String(url)}`);
  }
  return new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(REPLIES[lane]) } }] }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}) as typeof fetch;

const warnings: string[] = [];
console.warn = (...args: unknown[]) => {
  warnings.push(args.map(String).join(" "));
};

let failed = 0;
function check(name: string, actual: unknown, expected: unknown) {
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`);
}

async function main() {
  const capture = JSON.parse(readFileSync("eval/corpus/clean-light/capture.json", "utf8")) as Capture;
  const { report } = await extractFromCapture(capture);
  const interpretInput = {
    screenshotsPngBase64: [capture.viewportShot],
    palette: report.palette,
    typography: report.typography,
  };
  const imageInput = {
    imagesPngBase64: [capture.viewportShot],
    sourceRef: "probe.png",
    capturedAt: "2026-01-01T00:00:00.000Z",
  };

  // ---- Part A: only GEMINI_API_KEY is set -------------------------------
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_MODEL;
  delete process.env.GEMINI_MODEL;
  process.env.GEMINI_API_KEY = "offline-dummy-key";
  const availableWithGeminiOnly = aiLaneAvailable();
  check("A: aiLaneAvailable() with only GEMINI_API_KEY", availableWithGeminiOnly, false);
  if (!availableWithGeminiOnly) {
    // Only reached once the Gemini key is ignored, so no lane can reach a provider SDK here.
    check("A: interpret() returns null", await interpret(interpretInput), null);
    check("A: structureFromImages() returns null", await structureFromImages(imageInput), null);
    const stage7 = await extractStructureFromCapture(capture);
    check("A: structure naming is heuristic", stage7.header.naming, "heuristic");
    check("A: no request left the process", sent.length, 0);
  }

  // ---- Part B: an OpenRouter key is set ---------------------------------
  process.env.OPENROUTER_API_KEY = "offline-dummy-key";
  delete process.env.GEMINI_API_KEY;

  const lanes: [string, () => Promise<boolean>][] = [
    ["interpretation", async () => (await interpret(interpretInput)) !== null],
    ["structure stage 7", async () => (await extractStructureFromCapture(capture)).header.naming === "ai"],
    ["image structure", async () => (await structureFromImages(imageInput)) !== null],
  ];
  for (const [name, run] of lanes) {
    lane = name;
    sent = [];
    const validated = await run();
    check(`B ${name}: a validated reply came back`, validated, true);
    check(`B ${name}: requests sent`, sent.length, 1);
    const first = sent[0];
    check(`B ${name}: request went to OpenRouter`, first?.url, "https://openrouter.ai/api/v1/chat/completions");
    const body = JSON.parse(first?.body || "{}") as Record<string, unknown>;
    check(`B ${name}: model`, body.model, "google/gemini-3.5-flash");
    const extraKeys = Object.keys(body).filter(
      (k) => !["model", "messages", "max_tokens", "response_format"].includes(k),
    );
    check(`B ${name}: no other top-level request field`, extraKeys.join(","), "");
    const sha = createHash("sha256").update(first?.body ?? "").digest("hex");
    check(`B ${name}: request body sha256 as on main`, sha, BODY_SHA256_ON_MAIN[name]);
  }
  check("B: thinkingLevel warnings logged", warnings.filter((w) => w.includes("thinkingLevel")).length, 0);
  check("B: AI failure warnings logged", warnings.filter((w) => w.includes("failed (")).length, 0);

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

A changed hash means that a request body changed. This plan changes no prompt, schema or budget, so treat a changed hash as a defect of the implementation unless a task of this plan explains it.

### 2. Static: nothing names the removed path (first, second and third acceptance criteria)

```bash
# Code, tooling and manifests: must print nothing (44 lines on main).
git grep -nE 'GEMINI_API_KEY|GEMINI_MODEL|callGeminiModel|\bAI_MODEL\b|thinkingLevel|ThinkingLevel|@google/genai|GoogleGenAI|aistudio' \
  -- lib app eval scripts package.json package-lock.json .claude/skills/verify/scripts

# Docs and the verify skill's Markdown: must print one line, the "is not read"
# sentence of docs/architecture/orchestration.md (14 lines on main).
git grep -nE 'GEMINI_API_KEY|GEMINI_MODEL|\bAI_MODEL\b|thinkingLevel|@google/genai|aistudio|Gemini SDK|[Tt]wo (AI )?providers|both (keys|paths|providers)' \
  -- README.md techstack.md docs AGENTS.md .claude/skills/verify/SKILL.md .claude/skills/verify/features

# The PRD: must print 11 lines (21 on main).
grep -nE 'GEMINI_API_KEY|GEMINI_MODEL|@google/genai|thinkingLevel|aistudio|[Ff]ree.tier|Google Gen AI' .agents/PRDs/PRD.md | cut -c1-120

# The dependency is gone from disk.
test ! -e node_modules/@google/genai && echo "sdk removed"
```

`git grep` reads the working tree, so it sees uncommitted edits. The 11 PRD lines must each be a record of past work: the struck DIST-056 record and the struck multi-provider record of §4 (each now ends with a #199 note), the Phase 5 records of §4 and §12 (6 lines), the two Phase 7 P2 records ("broke the one pinned model invariant", "Setup hint names only `GEMINI_API_KEY`"), and the risk row that Task 5 closed. A line that describes the current state must not be among them.

### 3. Live: `npm run eval:ai` (fourth acceptance criterion, the interpretation lane)

Live because the criterion asks for a validated reply over OpenRouter. It runs once: 3 committed captures × 3 runs = 9 model calls, at most 18 if every first attempt is retried.

`eval/stability.ts` reads its key from `process.env` and does not load `.env.local`, so load the file for this run. The `sed` filter keeps the key out of the log even if an error message were to carry it:

```bash
( set -a; . ./.env.local; set +a
  npm run eval:ai 2>&1 | sed "s/${OPENROUTER_API_KEY}/<redacted>/g"; exit "${PIPESTATUS[0]}" )
```

Read the result with care: `scoreSite` returns `null` when `interpret` fails (`eval/stability.ts:73`), so a rejected request makes the script skip the site and still exit 0. The check passes only when all of these hold:

- three lines with `✓` (`clean-light`, `dark-mode`, `adversarial-shell`), then `✓ AI lane stable`, and exit 0;
- no line `AI Interpretation lane failed (...)` and no line that contains `thinkingLevel` in the output.

A `✗` line with no failure line means that the model's answers varied between runs. Step 1 shows that the request did not change, so report the scores verbatim and run the command once more before calling it a failure.

### 4. App, AI lane off: a `GEMINI_API_KEY` alone is no key (first and third acceptance criteria)

No model calls. On this host `.env.local` still defines `GEMINI_API_KEY`, and after the patch `verify.sh up` empties only `OPENROUTER_API_KEY`, so the app starts with a Gemini key and no OpenRouter key. If the owner has removed the Gemini key from `.env.local` by then, the run still has to pass, and step 1, Part A, is the proof for the Gemini-only case.

```bash
$V up && $V doctor                 # doctor must print "ai-lane off" and every line "ok"
$V drive analyze-url               # expect: "meta.aiOutcome is no-key", "AI lane meta reads skipped (no key)"
$V drive analyze-images            # expect: "structure-unavailable banner is shown", "no structure tab without a key"
source .verify/current.env
grep -h '"structureUnavailableReason"' "$RUN_DIR"/evidence/analyze-images-*/response.json
grep -h -A8 "Setup Hint" "$RUN_DIR"/evidence/analyze-url-*/*result-preview.aria.yaml
$V down
```

The first `grep` must print `Structure inference for images requires an AI key — set OPENROUTER_API_KEY.` The second must show `- code: OPENROUTER_API_KEY` right after `- text: Set`, and a link named `openrouter.ai/keys`, with no `GEMINI_API_KEY` and no `aistudio` (on `main` the lines read `- code: GEMINI_API_KEY`, `- text: or`, `- code: OPENROUTER_API_KEY`). Open `*result-preview.png` of the `analyze-url` evidence and confirm that the hint reads as one sentence with a working link style.

### 5. App, AI lane on: all three lanes over OpenRouter (fourth acceptance criterion)

Live because the criterion asks for an applied interpretation for a URL and an inferred structure for an image in the running app. It runs once: `analyze-url` makes 2 model calls (interpretation and structure Stage 7) and `analyze-images` makes 2 (interpretation and vision structure), so 4 calls, at most 8 with retries. The fixtures are local pages, so only the model calls leave the machine.

```bash
VERIFY_AI=1 $V up && $V doctor     # doctor must print "ai-lane on" and every line "ok"
$V drive analyze-url               # expect: "meta.aiOutcome is applied", "AI lane meta reads applied"
$V drive analyze-images            # expect: "meta.aiOutcome is applied", "inferred structure tab is shown"
source .verify/current.env
grep -h "^naming:" "$RUN_DIR"/evidence/analyze-url-*/structure.md       # must print: naming:    ai
grep -h "^fidelity:" "$RUN_DIR"/evidence/analyze-images-*/structure.md  # must print: fidelity:  inferred
grep -nE "(AI Interpretation lane|AI Structure Labeller|Vision structure inference) failed|thinkingLevel" "$RUN_DIR/logs/next.log"  # must print nothing
$V down
```

`naming: ai` is the proof for the Stage 7 lane, which no scenario check names: the structure report says `heuristic` whenever that call fails (`lib/extract/structure/structureAI.ts:209-211`). Cite `GIT_HEAD` and `ai-lane on` from `doctor` with the proof. A failure line with a 429 or a network error is PENDING, not a failure of the change; quote it verbatim.

### 6. Full gate (fifth acceptance criterion)

With no instance up (`test ! -e .verify/current.env`), `npm run check` must exit 0 with the eval scores of the baseline (100% for each fixture, `✓ all gates passed`). `git status --short` must list only the files of the Files to Change table, this plan, its patch and the report.

## Risks

| Risk | Mitigation |
|------|------------|
| A person whose setup has only `GEMINI_API_KEY` loses the AI lane without a message, and the README's free-key option goes away | Owner approved (issue notes). In scope: the UI hint, the banner and the README name `OPENROUTER_API_KEY`. Out of scope: a migration message, and the distribution question of #158 |
| With no thinking cap, a routed model that thinks spends `max_tokens` on the prelude and truncates the JSON | Not new: the OpenRouter path has never sent a cap. Measured on this host: 0 reasoning tokens, and 195 of 2048, 1159 of 4000 and 1323 of 4096 tokens used. A truncated reply fails Zod and shows up as a `failed` line or a `null` lane, which steps 3 and 5 would catch. Out of scope: a cap over OpenRouter's own reasoning parameter; flag it if a live check shows `finish_reason: length` |
| The live checks run against the model that `.env.local` selects (`google/gemini-2.5-flash` on this host), not the default `google/gemini-3.5-flash` | The default id exists in OpenRouter's model list with image input and structured outputs. Step 1 proves that the default id is what an unset `OPENROUTER_MODEL` sends. Out of scope unless the owner answers the open question otherwise |
| `npm install` after the patch changes the lockfile further | Measured: a second resolve of the patched lockfile with npm 10.9.8 changes nothing. Task 1 stops and reports if it does |
| `@types/node`, `debug`, `ms` and `undici-types` become dev-only in the lockfile | The `Dockerfile` and CI run `npm ci` with dev dependencies, and the runner stage copies the whole `node_modules`; the prototype build passed. In scope: nothing to do. A deployment that installs with `--omit=dev` is not something this repo has |
| `warnAiFailure` still looks for Google status strings (`RESOURCE_EXHAUSTED`, `INVALID_ARGUMENT`) that OpenRouter may never relay | Harmless: the `429` and `400` checks beside them match OpenRouter's own error text (`lib/aiLane.ts:165`). Out of scope; flag only |
| Another edit to `README.md` or the PRD lands before `/implement` runs, so the line numbers of Tasks 2 and 5 drift | Each task names the content of the lines as well as their numbers; find by content. The patch touches neither file |
| `npm run check` is started while a verify instance is up | `scripts/guard-build.mjs` blocks the build; steps 4 and 5 end with `$V down`, and Task 8's validation tests for it first |
| A key value is printed by a live check | The commands of steps 3 to 5 print no header and no env; step 3 pipes through a `sed` redaction. Never `cat` or `grep` the values of `.env.local` |

## Open Questions

- **Should the README say that `GEMINI_API_KEY` is no longer read?** Proposed default: no. The owner approved "no migration message", and the README then names one provider and one key, as the third criterion asks. `docs/architecture/orchestration.md` (Task 4) carries the one sentence for maintainers.
- **Should the live checks also run once with `OPENROUTER_MODEL` unset, so that the default model is exercised?** Proposed default: no. The criterion asks for a validated reply over OpenRouter, the owner's configuration is the one that runs, and an extra pass costs 13 more calls. If the owner wants it, prefix the commands of steps 3 and 5 so that the variable is empty for that run and report the routed model from the evidence.
- **Should the owner's `.env.local` lose its `GEMINI_API_KEY` line?** Proposed default: the plan does not touch it; the report tells the owner that the line is now unused. Step 4 uses it as the Gemini-only case while it is there.

## Acceptance Criteria

- [ ] All tasks completed
- [ ] `callModel` has one path, OpenRouter: `callGeminiModel`, `AI_MODEL`, and every read of `GEMINI_API_KEY` and `GEMINI_MODEL` are gone from the code, and `@google/genai` is removed from `package.json` and the lockfile (step 2, first command; step 1, Part A)
- [ ] `ModelCall` has no `thinkingLevel` field, the three callers do not pass one, and the once-per-process warning about it is gone (step 1, Part B; step 2)
- [ ] The tooling and the docs name OpenRouter as the only provider: the README, `techstack.md`, `docs/architecture/orchestration.md`, the PRD, the verify skill, the skip message of `npm run eval:ai`, and the setup hint in the UI (step 2; step 4)
- [ ] All three AI lanes still return a validated reply over OpenRouter: `npm run eval:ai` passes (step 3), and a `VERIFY_AI=1` run of the verify skill shows an applied interpretation for a URL and an inferred structure for an image (step 5)
- [ ] `npm run check` passes with unchanged eval scores (step 6)
- [ ] The request bodies of the three lanes have the hashes that `main` has (step 1)
- [ ] No key value appears in the plan, the report, the issue comment or any committed file
