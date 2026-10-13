# Plan: TODO-13: Bring the AI lane's JSON Schema back in line with its Zod schema

## Summary

The interpretation lane sends `OUTPUT_SCHEMA` (`lib/interpret.ts:51-93`, used at `:169`) to the provider as the structured-output schema, and then gates the reply with `aiResponseSchema` (`lib/schema.ts:305-324`, checked at `lib/interpret.ts:180`). `OUTPUT_SCHEMA` is a hand-written copy that states none of Zod's bounds, so a reply that the provider accepts can fail Zod, and after two attempts `retryOnce` drops the whole lane. This plan (GitHub issue #177, finding M7 of `.agents/reviews/codebase-analysis-review.md:27`) replaces the literal with `z.toJSONSchema(aiResponseSchema)`, so the schema that is sent is generated from the schema that checks the reply and the two cannot drift again. Only the interpretation lane changes: the acceptance criteria name it alone, and `STRUCTURE_SCHEMA` (`lib/extract/structure/structureAI.ts:31`) is in sync today and stays as it is.

Measured while planning, on `main` at `e247fd7`:

- `npm run check` exits 0: typecheck and lint clean, build compiled, eval `aggregate combined: 100%`, `✓ all gates passed` (`clean-light`, `dark-mode`, `adversarial-shell` at 100% each). Start green, stay green.
- `z.toJSONSchema(aiResponseSchema)` (zod 4.4.3, default `io: "output"`) emits `minItems: 3` and `maxItems: 6` on `identity.adjectives`, `minLength: 1` on `archetype` and `description`, `minItems: 1` on `imageMood.hero` and `.texture`, `pattern: "^#[0-9a-fA-F]{6}$"` on the hex, the seven-role `enum`, `additionalProperties: false` on every object, and `required: ["identity", "imageMood", "roleRefinements"]`. That is the shape of today's literal plus the bounds. It also emits two keywords that the literal does not have: a top-level `$schema` and `default: []` on `roleRefinements`.
- The offline check of the End-to-End Verification section fails on `main` with 6 failed checks (every bound is `undefined` in the request body), so it does show the change.
- `npm run eval` passes `forceHeuristicNaming` and never calls `interpret`, so the eval gate cannot see this change. `npm run eval:ai` (`eval/stability.ts`) does call it, live.

Decisions:

- **Default `io: "output"`.** It keeps `roleRefinements` in `required`, as the literal has it today. Zod's `.default([])` also accepts a reply without the field, so there the sent schema is stricter than Zod and never looser, which is the direction that cannot cause a Zod rejection.
- **Send the schema as generated; strip a keyword only when a provider rejects it.** Whether Gemini's `responseJsonSchema` and OpenRouter accept `$schema`, `default`, `pattern`, `minLength`, `minItems` and `maxItems` is known only from a live call (issue notes). Task 4 holds the rule for a rejection.
- **`AGENTS.md` and `lib/aiLane.ts` do not change.** `ModelCall.jsonSchema` is typed `object` (`lib/aiLane.ts:66`) and both providers receive it unchanged (`:156`, `:195`).

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT |
| Complexity | LOW |
| Systems Affected | `lib/interpret.ts`, `lib/schema.ts` (comments), `docs/architecture/orchestration.md` |
| GitHub Issue | #177 (finding M7 of `.agents/reviews/codebase-analysis-review.md:27`) |
| PRD Phase | N/A |
| Prototype Patch | N/A |

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/interpret.ts` | UPDATE | Generate `OUTPUT_SCHEMA` from `aiResponseSchema` in place of the hand-written literal |
| `lib/schema.ts` | UPDATE | Comments only: lines 17-23 describe the old enum derivation, and the doc comment of `aiResponseSchema` (299-304) must say that the schema is also what is sent |
| `docs/architecture/orchestration.md` | UPDATE | Line 7 says "Zod stays the gate at each call site"; add where the interpretation lane's sent schema comes from |

No change: `lib/aiLane.ts`, `lib/extract/structure/structureAI.ts`, `eval/stability.ts`, `eval/corpus/*`, `eval/baseline.json`, `AGENTS.md`, `package.json`.

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Generate `OUTPUT_SCHEMA` from `aiResponseSchema`

- **File**: `lib/interpret.ts`
- **Action**: UPDATE
- **Implement**:
  - Add `import { z } from "zod";` above the `@/lib/schema` import.
  - Replace the literal of lines 52-93 with `const OUTPUT_SCHEMA = z.toJSONSchema(aiResponseSchema);`.
  - Rewrite the doc comment of line 51: the schema is generated from `aiResponseSchema`, so the provider is told every bound that the Zod gate below checks (3 to 6 adjectives, non-empty archetype and description, at least one hero and one texture query, the `#rrggbb` pattern, the refinable-role enum); a bound that is added to `aiResponseSchema` is sent on the next call and needs a live check on both providers (#177).
  - Keep the `REFINABLE_COLOR_ROLES` import: `applyRoleRefinements` still uses it (lines 248-249, 286-288).
- **Mirror**: `lib/interpret.ts:31-39` (a module constant with a comment that states why)
- **Validate**: `npm run typecheck && npm run lint`

### Task 2: Correct the two comments in `lib/schema.ts`

- **File**: `lib/schema.ts`
- **Action**: UPDATE
- **Implement**:
  - Lines 17-23: replace the sentence "`OUTPUT_SCHEMA` in `lib/interpret.ts` derives its enum from this same const so the two can't drift." with one that says `OUTPUT_SCHEMA` is generated from `aiResponseSchema`, whose `role` is `refinableColorRoleSchema`, so the enum that is sent is this const.
  - Lines 299-304: add one sentence to the doc comment of `aiResponseSchema`: `lib/interpret.ts` generates the JSON Schema that it sends to the provider from this schema, so a bound stated here is also stated to the model.
  - No code changes in this file.
- **Mirror**: `lib/schema.ts:299-304`
- **Validate**: `npm run typecheck && git diff --stat lib/schema.ts`

### Task 3: Say in the orchestration write-up where the sent schema comes from

- **File**: `docs/architecture/orchestration.md`
- **Action**: UPDATE
- **Implement**: After the sentence of line 7 that ends "Zod stays the gate at each call site)", add: the interpretation lane generates the schema that it sends from that same Zod schema (`OUTPUT_SCHEMA = z.toJSONSchema(aiResponseSchema)` in `lib/interpret.ts`), so the provider is told the bounds that the gate checks; `STRUCTURE_SCHEMA` in `structureAI.ts` is still a hand-written mirror of `aiStructureResponseSchema`. If Task 4 strips a keyword, name it here with the provider that rejected it.
- **Mirror**: `docs/architecture/orchestration.md:7-9` (dense paragraphs, symbols in backticks)
- **Validate**: `grep -n "toJSONSchema" docs/architecture/orchestration.md`

### Task 4: Run the offline check and the two live checks, then delete the scratch files

- **File**: `scratch/sent-schema-probe.mts`, `scratch/openrouter-accept-probe.mts` (scratch, never committed)
- **Action**: CREATE, run, DELETE
- **Implement**: Follow the End-to-End Verification section: step 1 (offline), step 2 (Gemini, `npm run eval:ai`), step 3 (OpenRouter, one accepted request). Never print, log or write a key value.
  - **If a provider rejects a keyword**: record the rejection verbatim. If the keyword is `$schema`, `default` or `pattern`, remove only that keyword from the generated schema (for `$schema`, drop the top-level key; for the other two, the `override` hook of `z.toJSONSchema`), say why in the comment of `OUTPUT_SCHEMA`, and run steps 1 to 3 again. If the keyword is `minItems`, `maxItems` or `minLength`, stop: the first acceptance criterion requires those bounds, so report the rejection and leave the decision to the owner.
  - **If a live call cannot run** (quota, network, a provider error that is not about the schema): report that check as PENDING with the verbatim error, not as passed.
  - Delete both scratch files and the `scratch/` directory afterwards (`AGENTS.md`, "Delete scratch scripts after use").
- **Mirror**: `eval/stability.ts:59-72` (load a committed capture, extract, call `interpret`)
- **Validate**: `npx tsx scratch/sent-schema-probe.mts && rm -r scratch && git status --short`

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Eval gate (must print the same scores: 100% for each fixture, aggregate 100%)
npm run eval

# Everything CI runs: typecheck → lint → build → eval (no verify.sh instance may be up)
npm run check
```

`npm run eval` does not exercise the changed code. The checks that do are the three steps below.

## End-to-End Verification

`mkdir -p scratch` first. Both scripts run from the project root, because `tsx` resolves `@/` and `node_modules` from the script's location (`AGENTS.md`, "Manually verifying extraction changes").

### 1. Offline: the request body states the bounds (first acceptance criterion)

No network and no real key. The script calls the real `interpret()` on the committed `clean-light` capture with `fetch` replaced by a stub, and reads the JSON Schema out of the request body that `callModel` builds. On `main` it exits 1 with 6 failed checks; after Task 1 every check must print `ok` and it must exit 0.

Create `scratch/sent-schema-probe.mts` with this content, and run `npx tsx scratch/sent-schema-probe.mts`:

````typescript
// Offline check for #177. Scratch only: run from the project root with
//   npx tsx scratch/sent-schema-probe.mts
// and delete it afterwards. No network: `fetch` is replaced by a stub.
//
// It calls the real `interpret()` on the committed `clean-light` capture with a
// dummy OpenRouter key, reads the JSON Schema out of the request body that
// `callModel` builds, and checks that it states the bounds of `aiResponseSchema`.
import { readFileSync } from "node:fs";
import { extractFromCapture, type Capture } from "@/lib/analyze";
import { interpret } from "@/lib/interpret";
import { aiResponseSchema } from "@/lib/schema";

type Json = Record<string, unknown>;
const at = (node: unknown, ...path: string[]): unknown =>
  path.reduce<unknown>((n, key) => (n && typeof n === "object" ? (n as Json)[key] : undefined), node);

async function main() {
  // The dummy key routes `callModel` to the OpenRouter branch, whose request is
  // a plain `fetch` that the stub below can read. No real key is used.
  process.env.OPENROUTER_API_KEY = "offline-dummy-key";
  delete process.env.GEMINI_API_KEY;

  const reply = {
    identity: { adjectives: ["calm", "clean", "quiet"], archetype: "The Sage", description: "Quiet." },
    imageMood: { hero: ["soft morning light interior"], texture: ["paper grain"] },
    roleRefinements: [],
  };
  if (!aiResponseSchema.safeParse(reply).success) throw new Error("the stub reply must pass Zod");

  let sent: unknown;
  let calls = 0;
  globalThis.fetch = (async (url: unknown, init?: { body?: unknown }) => {
    if (!String(url).startsWith("https://openrouter.ai/")) throw new Error(`unexpected fetch: ${String(url)}`);
    calls++;
    sent = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(reply) } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  const capture = JSON.parse(readFileSync("eval/corpus/clean-light/capture.json", "utf8")) as Capture;
  const { report } = await extractFromCapture(capture);
  const result = await interpret({
    screenshotsPngBase64: [capture.viewportShot],
    palette: report.palette,
    typography: report.typography,
  });

  const schema = at(sent, "response_format", "json_schema", "schema");
  const identity = (key: string, keyword: string) => at(schema, "properties", "identity", "properties", key, keyword);
  const mood = (key: string, keyword: string) => at(schema, "properties", "imageMood", "properties", key, keyword);

  const checks: [string, unknown, unknown][] = [
    ["the stubbed call returned an interpretation", result !== null, true],
    ["one request was sent", calls, 1],
    ["identity.adjectives minItems", identity("adjectives", "minItems"), 3],
    ["identity.adjectives maxItems", identity("adjectives", "maxItems"), 6],
    ["identity.archetype minLength", identity("archetype", "minLength"), 1],
    ["identity.description minLength", identity("description", "minLength"), 1],
    ["imageMood.hero minItems", mood("hero", "minItems"), 1],
    ["imageMood.texture minItems", mood("texture", "minItems"), 1],
  ];
  let failed = 0;
  for (const [name, actual, expected] of checks) {
    const ok = actual === expected;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${JSON.stringify(actual)} (expected ${JSON.stringify(expected)})`);
  }
  // Informational: these are not acceptance criteria, and a provider may force one out.
  const hexPattern = at(schema, "properties", "roleRefinements", "items", "properties", "hex", "pattern");
  console.log(`info roleRefinements hex pattern: ${JSON.stringify(hexPattern)}`);
  console.log(`info top-level keywords: ${Object.keys((schema ?? {}) as Json).join(", ")}`);
  console.log(`info roleRefinements keywords: ${Object.keys((at(schema, "properties", "roleRefinements") ?? {}) as Json).join(", ")}`);
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

### 2. Live, Gemini: `npm run eval:ai` (second acceptance criterion, first half)

Live because only a real call shows whether Gemini's `responseJsonSchema` accepts the generated keywords. It runs once: 3 committed captures × 3 runs = 9 model calls, at most 18 if every first attempt is retried.

`eval/stability.ts` reads its key from `process.env` and does not load `.env.local`, and `callModel` prefers OpenRouter when `OPENROUTER_API_KEY` is set (`lib/aiLane.ts:211-216`). So load the file and unset the OpenRouter key for this run. The `sed` filter is a guard that keeps a key out of the log even if an error message were to carry one:

```bash
( set -a; . ./.env.local; set +a; unset OPENROUTER_API_KEY OPENROUTER_MODEL
  npm run eval:ai 2>&1 | sed "s/${GEMINI_API_KEY}/<redacted>/g"; exit "${PIPESTATUS[0]}" )
```

Read the result with care: `scoreSite` returns `null` when `interpret` fails (`eval/stability.ts:73`), so a rejected request makes the script skip the site and still exit 0. The check passes only when all of these hold:

- three lines with `✓` (`clean-light`, `dark-mode`, `adversarial-shell`), then `✓ AI lane stable`, and exit 0;
- no line `AI Interpretation lane failed (...)` in the output. Quote any such line verbatim: `400 Bad Request` naming a schema keyword is a rejection (Task 4's rule), and a 429 or a network error is PENDING.

A `✗` line with no failure line means that the model's answers varied between runs, which the schema did not cause; report the scores verbatim.

### 3. Live, OpenRouter: one accepted request (second acceptance criterion, second half)

Live for the same reason. It runs once: 1 model call, 2 if the first attempt fails. The script calls the real `interpret()` on the `clean-light` capture through a pass-through `fetch` that prints the HTTP status of each OpenRouter response, and an `error` object when a 200 body carries one (OpenRouter can report a provider's rejection that way).

Create `scratch/openrouter-accept-probe.mts` with this content:

````typescript
// Live check for #177. Scratch only: run from the project root, and delete it
// afterwards. It makes ONE interpretation call over OpenRouter (two if the
// first attempt fails) and reports whether the request was accepted.
// It never prints a key: it reads no header and prints only status and body fields.
import { readFileSync } from "node:fs";
import { extractFromCapture, type Capture } from "@/lib/analyze";
import { interpret } from "@/lib/interpret";

async function main() {
  if (!process.env.OPENROUTER_API_KEY) {
    console.error("OPENROUTER_API_KEY is not set");
    process.exit(2);
  }

  const realFetch = globalThis.fetch;
  const statuses: number[] = [];
  let bodyError = false;
  globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
    const res = await realFetch(...args);
    if (String(args[0]).startsWith("https://openrouter.ai/")) {
      statuses.push(res.status);
      console.log(`OpenRouter HTTP ${res.status} ${res.statusText}`);
      if (res.ok) {
        const body = (await res.clone().json().catch(() => null)) as {
          error?: unknown;
          model?: string;
          provider?: string;
          choices?: { finish_reason?: string }[];
        } | null;
        if (body?.error) {
          bodyError = true;
          console.log(`error in the 200 body: ${JSON.stringify(body.error)}`);
        } else {
          console.log(`model: ${body?.model}, provider: ${body?.provider}, finish_reason: ${body?.choices?.[0]?.finish_reason}`);
        }
      }
    }
    return res;
  }) as typeof fetch;

  const capture = JSON.parse(readFileSync("eval/corpus/clean-light/capture.json", "utf8")) as Capture;
  const { report } = await extractFromCapture(capture);
  const result = await interpret({
    screenshotsPngBase64: [capture.viewportShot],
    palette: report.palette,
    typography: report.typography,
  });

  console.log(
    result
      ? `interpretation passed Zod: ${result.identity.adjectives.length} adjectives, ` +
          `${result.imageMood.hero.length} hero, ${result.imageMood.texture.length} texture, ` +
          `${result.roleRefinements.length} role refinements`
      : "interpretation: null",
  );
  const accepted = statuses.length > 0 && statuses[statuses.length - 1] === 200 && !bodyError && result !== null;
  console.log(accepted ? "\nACCEPTED" : "\nNOT ACCEPTED");
  process.exit(accepted ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
````

Run it with the keys loaded (OpenRouter wins when both are set):

```bash
( set -a; . ./.env.local; set +a
  npx tsx scratch/openrouter-accept-probe.mts 2>&1 | sed "s/${OPENROUTER_API_KEY}/<redacted>/g"; exit "${PIPESTATUS[0]}" )
```

It passes when it prints `OpenRouter HTTP 200`, `interpretation passed Zod: …`, `ACCEPTED`, and exits 0 with no `AI Interpretation lane failed` line. A non-200 status or an `error in the 200 body` line that names a schema keyword is a rejection (Task 4's rule); quote it verbatim.

### 4. Full gate

`rm -r scratch`, then `npm run check` must exit 0 with the eval scores of the baseline (100% for each fixture, `✓ all gates passed`), and `git status --short` must list only the three files of this plan, the plan and report files, and the unrelated `.agents/issues/todo-issues.md` that was modified before this work began (do not touch it).

## Acceptance Criteria

- [ ] All tasks completed
- [ ] The schema sent for the interpretation lane states the bounds of `aiResponseSchema`: 3 to 6 adjectives, a non-empty archetype and description, and at least one hero and one texture query (step 1 prints `all checks ok`)
- [ ] `npm run eval:ai` passes with a key on Gemini (step 2), and the request is accepted over OpenRouter (step 3)
- [ ] `npm run check` passes with unchanged eval scores (step 4)
- [ ] `OUTPUT_SCHEMA` is generated from `aiResponseSchema`; no hand-written copy of its bounds remains in `lib/interpret.ts`
- [ ] No key value appears in the plan, the report, the issue comment or any committed file
