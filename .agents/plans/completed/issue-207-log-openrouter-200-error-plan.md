# Plan: Log an OpenRouter error that arrives with HTTP 200

## Summary

OpenRouter sends `200 OK` as soon as a provider accepts a request, so a failure raised after that point comes back as a 200 whose body holds only `{ "error": { "code", "message", "metadata"? } }` and no `choices`. `callModel` (`lib/aiLane.ts:150-156`) checks only `response.ok` and hands that body to `firstChoiceText`, which finds no `choices` and returns `null`; `retryOnce` then retries silently and `warnAiFailure` never runs. The fix: `firstChoiceText` throws when the reply carries a non-null `error`, before it looks for `choices`. The thrown message has the form `OpenRouter API error (code <code> in an HTTP 200 reply): <message>`, so it holds the code as a bare number the way the non-2xx message holds the status, and `warnAiFailure`'s substring checks classify it the same way. The raw error object is attached as the `cause`, so `console.warn(err)` also prints the `metadata`. `retryOnce` and the three lanes stay unchanged. `docs/architecture/orchestration.md` gets one sentence about the new behavior.

**Decision (OpenRouter docs, `https://openrouter.ai/docs/api/reference/errors-and-debugging`, read 2026-10-14):** the error shape is `{ error: { code: number; message: string; metadata?: Record<string, unknown> } }`. A non-streaming request that fails after processing starts receives "a `200` response whose body holds only an `error` object and no `choices`", and the docs advise to "check the body for an `error` field even on a `200`". A streaming chunk carries the error at the top level next to `choices` with `finish_reason: "error"`; `callModel` does not stream, but the check throws on any non-null `error`, whether `choices` is present or not, so that shape is covered too.

**Decision (malformed error object):** a non-null `error` always throws. If `code` is missing, the message says `code unknown`; if `message` is not a string, the message carries `JSON.stringify(error)`. A provider error is never read as an empty answer, whatever its shape.

**Decision (Gemini status strings):** the classification lines in `warnAiFailure` stay as they are. The new message needs no change to them, so dropping `RESOURCE_EXHAUSTED` / `INVALID_ARGUMENT` is out of scope, as the issue notes.

## Metadata

| Field | Value |
|-------|-------|
| Type | BUG_FIX |
| Complexity | LOW |
| Systems Affected | `lib/aiLane.ts` (AI lane request primitive), `docs/architecture/orchestration.md` |
| GitHub Issue | #207 |
| PRD Phase | N/A |
| Prototype Patch | N/A |

## Environment Findings

| Probe | Result |
|-------|--------|
| `npm run eval` on HEAD | `aggregate combined: 100%`, `✓ all gates passed` (stripe, linear, vercel skipped as optional) |
| Does eval or CI run the changed code? | No. Eval passes `forceHeuristicNaming: true` and never calls `callModel`; CI has no key. The scratch probe below is the only gate that runs the change |
| Scratch probe (below) on HEAD | Exit 1, 5 checks failed: the 200 + error 429 body gives `{"result":null,"fetches":2,"warns":[]}` (2 requests, 0 warnings, the issue's symptom), the code-and-message check finds no warning, and the 429 / 400 / 502 classification checks find no warning to compare. The `choices`, neither-shape, and blank-content checks pass (unchanged behavior to keep) |
| Branch / name | No `todo-*` entry for #207; the precedent for a non-TODO issue is `issue-209-...` (`.agents/plans/completed/issue-209-seed-interpretation-lane-plan.md`). Branch: `feature/issue-207-log-openrouter-200-error` |

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/aiLane.ts` | UPDATE | Throw from `firstChoiceText` on a reply with a non-null `error`, with code and message in the error text and the object as `cause`; update its doc comment and `callModel`'s |
| `docs/architecture/orchestration.md` | UPDATE | One sentence: a 200 reply with an `error` body is thrown like a non-2xx reply and logged by `warnAiFailure` |

## Tasks

### Task 1: Throw on an `error` body in a 200 reply

- **File**: `lib/aiLane.ts`
- **Action**: UPDATE
- **Implement**:
  1. In `firstChoiceText` (line 169), split `if (typeof reply !== "object" || !("choices" in reply)) return null;` into:
     ```ts
     if (typeof reply !== "object") return null;
     if ("error" in reply && reply.error !== null && reply.error !== undefined) {
       throw providerError(reply.error);
     }
     if (!("choices" in reply)) return null;
     ```
  2. Add beside it:
     ```ts
     /**
      * The error for a 200 reply that carries OpenRouter's `{ error: { code, message } }`
      * body, which OpenRouter sends when a call fails after the provider accepted it.
      * The message names the code the way the non-2xx path names the status, so
      * `warnAiFailure` classifies both alike; the raw object rides along as `cause`.
      */
     function providerError(error: unknown): Error {
       const fields = typeof error === "object" && error !== null ? error : {};
       const code = "code" in fields ? String(fields.code) : "unknown";
       const message =
         "message" in fields && typeof fields.message === "string" ? fields.message : JSON.stringify(error);
       return new Error(`OpenRouter API error (code ${code} in an HTTP 200 reply): ${message}`, { cause: error });
     }
     ```
     (If narrowing `fields` to `object` trips `tsc`, narrow inline instead; no `as` casts, per #182.)
  3. Update the `firstChoiceText` doc comment ("Two shapes throw…", line 164): make it three shapes, the first being a reply with an `error` field, which OpenRouter sends with HTTP 200 for a failure after processing started. In `callModel`'s doc comment (lines 57-63), add that an `error` body in a 200 reply also propagates.
- **Mirror**: the existing throws in `firstChoiceText` (`lib/aiLane.ts:169-185`) and the non-2xx message at `lib/aiLane.ts:150-153`
- **Validate**: `npm run typecheck && npm run lint`, then the scratch probe below (exit 0)

### Task 2: Document the behavior

- **File**: `docs/architecture/orchestration.md`
- **Action**: UPDATE
- **Implement**: in the line 9 paragraph ("One provider, one seam."), add: a 200 reply whose body holds an `error` object (OpenRouter's shape for a failure after the provider accepted the request) throws like a non-2xx reply, so `warnAiFailure` logs its code and message on each attempt instead of the lane reading it as an empty answer (#207).
- **Mirror**: the existing wording of `docs/architecture/orchestration.md:9`
- **Validate**: `grep -n "#207" docs/architecture/orchestration.md`

## Validation

```bash
npm run typecheck
npm run lint
npm run eval    # must stay at 100%; it does not run the changed path
npm run check   # typecheck → lint → build → eval, what CI runs

# Reproduction: red on HEAD (exit 1, 5 failed checks), green after the fix (exit 0)
# (save the End-to-End Verification script below as scratch-openrouter-200-error.ts in the project root first)
npx tsx scratch-openrouter-200-error.ts; rm -f scratch-openrouter-200-error.ts
```

## End-to-End Verification

The change is reachable only through a live model call, which CI and eval never make, and no live OpenRouter call is wanted. The gate is an offline probe: it stubs `globalThis.fetch`, sets a dummy `OPENROUTER_API_KEY`, and drives the real `retryOnce(() => callModel(...), (err, attempt) => warnAiFailure(...))` chain the three lanes use, over these reply shapes: a 200 with `error` 429 / 400 / 502, the same codes as non-2xx statuses (to compare the classification), a 200 with `choices`, a 200 with neither, and a 200 with blank content. Per `AGENTS.md`, it runs with `npx tsx` from the project root and is deleted after use. It must exit 0 after the change; on HEAD it exits 1 (see Environment Findings). Describe the probe and its output in the implementation report.

```ts
// Scratch check for #207. Copy to the project root, run with `npx tsx scratch-openrouter-200-error.ts`, then delete.
// No network: globalThis.fetch is stubbed, and the key is a dummy.
import { callModel, retryOnce, warnAiFailure } from "./lib/aiLane";

process.env.OPENROUTER_API_KEY = "dummy-key-for-offline-probe";

type Case = { name: string; status: number; body: unknown };

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let fetches = 0;
let current: Case;
globalThis.fetch = (async () => {
  fetches++;
  return json(current.status, current.body);
}) as typeof fetch;

const warns: string[] = [];
const realWarn = console.warn;
console.warn = (...args: unknown[]) => {
  warns.push(args.map((a) => (a instanceof Error ? a.message : String(a))).join(" "));
};

async function run(c: Case) {
  current = c;
  fetches = 0;
  warns.length = 0;
  const result = await retryOnce(
    () => callModel({ user: "probe", maxOutputTokens: 16 }),
    (err, attempt) => warnAiFailure("Probe lane", attempt, err),
  );
  return { result, fetches, warns: [...warns] };
}

const detail = (w: string) => w.match(/failed \(([^,]+), attempt/)?.[1] ?? "?";

let failed = 0;
const check = (ok: boolean, label: string, seen: unknown) => {
  if (!ok) failed++;
  realWarn(`${ok ? "ok  " : "FAIL"} ${label} — ${JSON.stringify(seen)}`);
};

async function main() {
  const err429 = await run({
    name: "200 + error 429",
    status: 200,
    body: { error: { code: 429, message: "Rate limit exceeded", metadata: { error_type: "rate_limit_exceeded" } } },
  });
  check(
    err429.result === null && err429.fetches === 2 && err429.warns.length === 2,
    "200 + error 429: null, 2 requests, 2 warnings",
    err429,
  );
  check(
    err429.warns.length > 0 && err429.warns.every((w) => w.includes("429") && w.includes("Rate limit exceeded")),
    "200 + error 429: each warning carries code and message",
    err429.warns,
  );

  const non2xx429 = await run({
    name: "429 status",
    status: 429,
    body: { error: { code: 429, message: "Rate limit exceeded" } },
  });
  check(
    err429.warns.length > 0 && detail(err429.warns[0]) === detail(non2xx429.warns[0]),
    "200 + error 429 classifies like a 429 status",
    { body200: err429.warns.map(detail), status429: non2xx429.warns.map(detail) },
  );

  const err400 = await run({ name: "200 + error 400", status: 200, body: { error: { code: 400, message: "context too long" } } });
  const non2xx400 = await run({ name: "400 status", status: 400, body: { error: { code: 400, message: "context too long" } } });
  check(
    err400.warns.length === 2 && detail(err400.warns[0]) === detail(non2xx400.warns[0]),
    "200 + error 400 classifies like a 400 status",
    { body200: err400.warns.map(detail), status400: non2xx400.warns.map(detail) },
  );

  const err502 = await run({ name: "200 + error 502", status: 200, body: { error: { code: 502, message: "Upstream down" } } });
  const non2xx502 = await run({ name: "502 status", status: 502, body: { error: { code: 502, message: "Upstream down" } } });
  check(
    err502.warns.length === 2 && detail(err502.warns[0]) === detail(non2xx502.warns[0]),
    "200 + error 502 classifies like a 502 status",
    { body200: err502.warns.map(detail), status502: non2xx502.warns.map(detail) },
  );

  const choices = await run({ name: "choices", status: 200, body: { choices: [{ message: { content: '{"a":1}' } }] } });
  check(
    choices.result === '{"a":1}' && choices.fetches === 1 && choices.warns.length === 0,
    "choices, no error: text, 1 request, 0 warnings",
    choices,
  );

  const neither = await run({ name: "neither", status: 200, body: { id: "gen-1" } });
  check(
    neither.result === null && neither.fetches === 2 && neither.warns.length === 0,
    "neither choices nor error: null, 2 requests, 0 warnings",
    neither,
  );

  const empty = await run({ name: "empty content", status: 200, body: { choices: [{ message: { content: "  " } }] } });
  check(
    empty.result === null && empty.fetches === 2 && empty.warns.length === 0,
    "blank content: null, 2 requests, 0 warnings",
    empty,
  );

  realWarn(failed ? `${failed} check(s) failed` : "all checks passed");
  process.exit(failed ? 1 : 0);
}

main();
```

## Risks

| Risk | Mitigation |
|------|------------|
| A reply carrying both `choices` with usable text and an `error` now throws instead of returning the text | In scope, intended: OpenRouter's docs pair an `error` with `finish_reason: "error"`, so the text is partial. The issue's AC covers only `choices` without `error`, which stays unchanged |
| `warnAiFailure` matches substrings, so a message that contains `400` or `429` by accident misclassifies | Out of scope: the non-2xx path has the same behavior (its text includes the body), so the two paths still classify alike, which is what the AC asks |
| `{ cause }` needs ES2022 `ErrorOptions` | `tsconfig.json` sets `target`/`lib` `ES2022`; typecheck confirms |
| The probe stubs `fetch` with `as typeof fetch` | Scratch-only file, deleted after use; never committed |

## Acceptance Criteria

- [ ] An HTTP 200 reply with an `error` object makes `callModel` throw with the provider's code and message; each of the two attempts logs one `warnAiFailure` line (probe: 2 requests, 2 warnings)
- [ ] The 200 error with code 429 / 400 / 502 is classified like a non-2xx status with the same code (probe classification checks)
- [ ] A reply with `choices` and no `error` behaves as before; a reply with neither still returns `null` (probe)
- [ ] The offline probe is described in the implementation report
- [ ] `npm run check` passes
