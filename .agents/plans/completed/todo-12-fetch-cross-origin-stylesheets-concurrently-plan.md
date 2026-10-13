# Plan: TODO-12: Fetch cross-origin stylesheets concurrently, with a timeout, once per analysis

## Summary

`collectStyleDump` (`lib/extract/styleDump.ts:276`) repairs what the CSSOM cannot read: a cross-origin stylesheet throws on `.cssRules`, so the in-page pass reports its `href` and a Node-side loop (`lib/extract/styleDump.ts:611-735`) refetches the sheet through `page.context().request.get(href)` (line 622), re-parses it in a detached document, and merges the recovered `:hover`/`:focus-visible` deltas and `@keyframes` into the dump. That loop fetches one sheet at a time with Playwright's default 30 s request timeout, and `capturePage` runs the whole of `collectStyleDump` twice, for the light render (`lib/ingest.ts:301`) and for the dark one (`lib/ingest.ts:179`), so each sheet is downloaded twice. This plan (GitHub issue #176, finding M6 of `.agents/reviews/codebase-analysis-review.md:26`) starts every refetch at once under an explicit 5 s timeout, applies the texts in stylesheet order, and shares one per-capture cache between the two dumps, so the dark dump re-parses the text that the light dump fetched. The dump that comes out is unchanged; only the network behaviour changes. A prototype of the change was built and measured while planning and is saved as a patch.

## User Story

As a user who analyzes a site that serves its CSS from another origin
I want the stylesheet refetch to run concurrently, with a short timeout, once per analysis
So that a slow or stalled CSS host cannot use up the analysis route's 60 s, and the report still carries the same hover/focus states and keyframes.

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT |
| Complexity | MEDIUM |
| Systems Affected | `lib/extract/styleDump.ts`, `lib/ingest.ts`, `docs/architecture/tokens-lane.md`, `docs/architecture/ingestion.md` |
| GitHub Issue | #176 (finding M6 of `.agents/reviews/codebase-analysis-review.md:26`) |
| PRD Phase | N/A |
| Prototype Patch | `.agents/plans/todo-12-fetch-cross-origin-stylesheets-concurrently-prototype.patch` |

---

## Environment Findings

Baseline on `main` at `e52b4ca`, working tree clean, measured while planning:

| Probe | Result |
|-------|--------|
| `npm run check` (typecheck → lint → build → eval) | Exit 0. `tsc --noEmit` clean, `eslint .` clean, `next build` compiled, eval `aggregate combined: 100%`, `✓ all gates passed` (`clean-light`, `dark-mode`, `adversarial-shell` at 100% each) |
| Test framework | None (`AGENTS.md:33`). `npm run eval` replays frozen captures and never calls `collectStyleDump`, so it cannot see this change; `eval/fixtures/*.html` hold no `<link>` at all |
| Toolchain | Node v22.23.1, npm 10.9.8, Playwright 1.61.1 with chromium installed, no `verify.sh` dev server running |
| Prototype worktree (patch applied to `e52b4ca`) | `tsc --noEmit` clean, `eslint .` clean, `tsx eval/run.ts` prints the same 100% scores |

Start green, stay green: `npm run check` must still exit 0 with the same eval scores.

### Issue-stated numbers, re-measured

Measured with the two-origin scratch check of the End-to-End Verification section, run on unmodified `main`:

| Claim in the issue | Finding |
|--------------------|---------|
| Loop at `lib/extract/styleDump.ts:620-735`, request at line 622 | Confirmed at `e52b4ca` (the `for` is lines 620-734, its enclosing `if` 611-735) |
| Callers at `lib/ingest.ts:305` (light) and `:176` (dark) | The lines have moved: the light call is `lib/ingest.ts:301` (in `capturePage`), the dark call `lib/ingest.ts:179` (in `captureDarkScheme`) |
| Each sheet is downloaded twice | Confirmed: every cross-origin sheet was refetched 2 times per `capturePage` (the 404 one too) |
| Playwright's default request timeout is 30 s | Confirmed in `node_modules/playwright-core/types/types.d.ts` ("Defaults to `30000`") and by measurement: 1 stalled sheet makes `capturePage` take 62.9 s (30 s in each of the two passes) |
| "two stalled hosts use the route's whole 60 s" | Understated: 2 stalled sheets make `capturePage` alone take 123.0 s (2 sheets × 30 s × 2 passes), against `maxDuration = 60` (`app/api/analyze/route.ts:28`) |

### Prototype measurements

| Scenario | `main` (`e52b4ca`) | Prototype |
|----------|--------------------|-----------|
| No stalled sheet: `capturePage` time, refetches per sheet | 3.0 s, 2 each | 2.5 s, 1 each |
| 2 sheets that never answer | 123.0 s, 2 each | 7.1 s, 1 each |
| 1 sheet that sends headers and then stalls in the body | 62.9 s, 2 | 7.1 s, 1 |
| Light and dark states + keyframes (sha256 of the slimmed dumps) | `03b64334…c23a986` | identical in all three scenarios |

The body-stall row shows that the `timeout` option of `APIRequestContext.get` covers the body download and not only the wait for headers.

---

## Decisions

- **The cache is a required parameter of `collectStyleDump`.** `capturePage` creates one cache per capture and passes it to both dumps. Because the parameter is required, a caller cannot leave it out by accident and refetch every sheet. `capturePage` is the only entry point of a capture (`renderUrl` at `lib/ingest.ts:440`, `eval/capture.ts:44`), so "once per capture" is "once per analysis".
- **The cache holds the request, not the text** (`Map<string, Promise<string | null>>`). One lookup serves both the concurrent start and the reuse, and `null` records a sheet that failed, timed out or was empty.
- **The cache is not a capture artifact.** It never leaves `capturePage`, so `CaptureArtifacts` (`lib/ingest.ts:18-50`) and the `capture.json` shape do not change, and no eval fixture is refreshed (`AGENTS.md:50`).
- **Only the fetch is concurrent.** The texts are awaited together and then applied one `page.evaluate` at a time in stylesheet order, with the per-sheet `try`/`catch` kept, so the merge rule (the first sheet that declares a property of a state wins, and a value of the in-page pass is never overwritten) is the one of `main`.
- **The dark dump reuses text, not results.** The dark pass re-scans the cached text against the dark computed styles, so its `from` values stay dark-specific. A sheet that only the dark pass sees is a cache miss and is fetched then.
- **The refetch stays outside the SSRF guard**, by the documented decision of `README.md:207-213`. The change sends the same requests to the same URLs through the same browser context, and fewer of them.

---

## Patterns to Follow

Every `file:line` of this plan refers to `main` at `e52b4ca`, before the prototype patch is applied; the patch moves the lines of `lib/extract/styleDump.ts` and `lib/ingest.ts`.

### Naming: module constants with a doc comment and numeric separators

```typescript
// SOURCE: lib/ingest.ts:71-72
const DEFAULT_VIEWPORT = { width: 1440, height: 900 };
const DEFAULT_NAV_TIMEOUT = 30_000;
```

```typescript
// SOURCE: lib/extract/styleDump.ts:107-108
/** Hard cap on collected nodes, to bound the payload handed back to Node. */
const NODE_CAP = 5000;
```

### Error handling: a best-effort pass skips, it never throws

```typescript
// SOURCE: lib/extract/styleDump.ts:731-733
      } catch {
        // Skip cross-origin stylesheet best-effort on network/fetch error
      }
```

```typescript
// SOURCE: lib/ingest.ts:181-186
  } catch (err) {
    console.warn("Dark-scheme capture failed:", err);
    return undefined;
  } finally {
    await page.emulateMedia({ colorScheme: "light" }).catch(() => {});
  }
```

### Concurrency: independent calls start together under `Promise.all`

```typescript
// SOURCE: lib/analyze.ts:364-367
  // Run the two model calls concurrently: Track A token enrichment and
  // Track B structure Stage 7 labelling start together via Promise.all (#175).
  // The labelling call needs nothing from the enriched report.
  const [enriched, preliminaryOutcome] = await Promise.all([
```

### Tests: no framework; a scratch script drives Playwright directly against local servers

```typescript
// SOURCE: eval/capture.ts:27-44
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      // Same explicit baseline as `lib/ingest.ts` (§P8-3) — deterministic
      // capture regardless of the CI/OS default color scheme.
      colorScheme: "light",
    });
    const page = await context.newPage();
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 30_000 });
    try {
      await page.waitForLoadState("networkidle", { timeout: 8_000 });
    } catch {
      /* chatty sites never idle — proceed with what has painted */
    }
    const { bannerDismissed, ...artifacts } = await capturePage(page);
```

The two-origin fixture is the one of `.agents/reports/cross-origin-states-spike.md:19-34`. `AGENTS.md:54-56` sets the rules for such scripts: run with `npx tsx` from the project root, and delete them after use.

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/extract/styleDump.ts` | UPDATE | Covered by the prototype patch: the timeout constant `CROSS_ORIGIN_SHEET_TIMEOUT_MS`, the exported type `CrossOriginSheetCache`, the helper `fetchCrossOriginSheet`, the new required `sheetCache` parameter of `collectStyleDump`, and the refetch loop rewritten as one concurrent fetch followed by an ordered apply |
| `lib/ingest.ts` | UPDATE | Covered by the prototype patch: `capturePage` creates the cache and passes it to `collectStyleDump` and to `captureDarkScheme`, which takes it as a parameter |
| `docs/architecture/tokens-lane.md` | UPDATE | Not in the patch: line 5 describes the second pass as a refetch of "each" sheet and must describe the concurrent fetch, the timeout and the per-capture cache |
| `docs/architecture/ingestion.md` | UPDATE | Not in the patch: line 7 (dark-scheme capture) must say that the dark style dump reuses the cross-origin CSS text of the light one |

No change: `README.md:213` (the refetch still "issues its own requests from the rendered page's context"), `eval/capture.ts` (it calls `capturePage`, whose signature is unchanged), `eval/corpus/*/capture.json`, `lib/schema.ts`, `AGENTS.md`.

---

## Tasks

Execute in order. Each task is atomic and verifiable. The prototype patch named in Metadata carries the code of both `lib/` files, so there is no task for writing it.

### Task 1: Check the patched code against the decisions

- **File**: `lib/extract/styleDump.ts`, `lib/ingest.ts`
- **Action**: UPDATE (review of the applied patch; edit only where a point below does not hold)
- **Implement**:
  - `fetchCrossOriginSheet` passes `CROSS_ORIGIN_SHEET_TIMEOUT_MS` as the `timeout` of `request.get`, and its promise never rejects: a failed request, a status that is not ok, and an empty body all resolve to `null`.
  - `collectStyleDump` awaits the texts of `dump.crossOriginHrefs` with one `Promise.all` and applies them in that array's order; the per-sheet `try`/`catch` around `page.evaluate` is still there, and so are the cleanup of `data-distill-id` and `delete dump.crossOriginHrefs`.
  - `collectStyleDump` has exactly two callers, both in `lib/ingest.ts`, and both pass the cache that `capturePage` created (`grep -rn "collectStyleDump(" lib eval app .claude/skills/verify/scripts`).
  - Apply the answers to the Open Questions if the owner chose differently from the proposed defaults (timeout value, remembering failures, logging).
- **Mirror**: `lib/extract/styleDump.ts:107-108` (constant with a doc comment), `lib/ingest.ts:172-187` (best-effort pass)
- **Validate**: `npm run typecheck && npm run lint`

### Task 2: Describe the new second pass in the tokens-lane write-up

- **File**: `docs/architecture/tokens-lane.md`
- **Action**: UPDATE
- **Implement**: Rewrite the "second pass" paragraph (line 5). Keep what is still true (the first pass reports the `href`s of sheets that throw; re-parse in a detached document; re-match through the temporary `data-distill-id`; best-effort per sheet; merge-only; the render path touches the network and the extraction lane does not). Replace "refetches each through `page.context().request.get`" with: all sheets are requested at once, each under `CROSS_ORIGIN_SHEET_TIMEOUT_MS` (5 s); the texts are applied in stylesheet order; the requests live in a `CrossOriginSheetCache` that `capturePage` creates once per capture, so the dark-scheme dump re-parses the text that the light dump fetched; a sheet that fails or times out is remembered as failed and skipped.
- **Mirror**: `docs/architecture/tokens-lane.md:3-5` (one dense paragraph per mechanism, symbols in backticks)
- **Validate**: `grep -n "CrossOriginSheetCache" docs/architecture/tokens-lane.md`

### Task 3: Note the reuse in the ingestion write-up

- **File**: `docs/architecture/ingestion.md`
- **Action**: UPDATE
- **Implement**: In the "Dark-scheme capture" bullet (line 7), add one sentence: the dark style dump receives the capture's `CrossOriginSheetCache` and reuses the cross-origin CSS text that the light dump fetched, so no stylesheet is downloaded a second time.
- **Mirror**: `docs/architecture/ingestion.md:5-7` (one bullet per follow-up pass)
- **Validate**: `grep -n "CrossOriginSheetCache" docs/architecture/ingestion.md`

### Task 4: Run the two-origin scratch check, then delete it

- **File**: `scratch/xo-probe.mts` (scratch, never committed)
- **Action**: CREATE, run, DELETE
- **Implement**: Create the file with the script of the End-to-End Verification section, verbatim, and run it from the project root. Every check must print `ok` and the process must exit 0. Delete the file afterwards (`AGENTS.md:56`).
- **Mirror**: `eval/capture.ts:27-44`, `.agents/reports/cross-origin-states-spike.md:19-34`
- **Validate**: `npx tsx scratch/xo-probe.mts && rm scratch/xo-probe.mts && git status --short`

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

`npm run eval` does not exercise the changed code. The check that does is the scratch script below.

## End-to-End Verification

### 1. Two-origin scratch check (covers every acceptance criterion)

The script starts two loopback HTTP servers: origin A serves a page with an inline same-origin `<style>` as the control, and origin B serves the stylesheets with no CORS headers. It then calls `capturePage`, the real entry point of both style dumps, three times. It is headless, uses no outside network, and takes about 20 s after the change.

What it proves, and what it showed on unmodified `main` while planning:

| Check | Acceptance criterion | On `main` | With the patch |
|-------|----------------------|-----------|----------------|
| Each cross-origin sheet is refetched once per analysis | dark pass reuses the light pass's text | FAIL (2 each) | ok |
| Light + dark states and keyframes hash to the value recorded on `main` | same states and keyframes as before | ok | ok |
| The first sheet wins a conflict although it answers 400 ms later than the second | rules applied in stylesheet order | ok | ok |
| The dark dump holds the dark base colour | reuse is of text, not of results | ok | ok |
| With 2 sheets that never answer, and with 1 that stalls in its body: `capturePage` returns within 15 s | concurrent, explicit timeout | FAIL (123.0 s, 62.9 s) | ok (7.1 s, 7.1 s) |
| A stalled sheet is requested once | failure is not retried | FAIL (2) | ok |
| The other sheets still yield the same dumps, and the dark capture exists | a failed sheet does not fail the analysis | ok | ok |

Create `scratch/xo-probe.mts` (`mkdir -p scratch` first if the directory is missing) with this content:

````typescript
// Two-origin check for #176. Scratch only: run from the project root with
//   npx tsx scratch/xo-probe.mts
// and delete it afterwards. Headless, loopback only, no outside network.
//
// Origin A serves the page (an inline same-origin <style> as the control, and
// <link>s to origin B). Origin B serves the sheets with no CORS headers, so
// `.cssRules` throws in the page and collectStyleDump has to refetch them.
// It drives Playwright directly, like eval/capture.ts, so the SSRF guard of
// renderUrl is not in the way.
import { createHash } from "node:crypto";
import { createServer, type ServerResponse } from "node:http";
import { chromium } from "playwright";
import { capturePage } from "@/lib/ingest";

// sha256 of the slimmed light + dark dumps, recorded on main at e52b4ca,
// before the change: "the same states and keyframes as before".
const PINNED = "03b64334c378b4131ef96efd8d22631c43a01b2996ad32608d5398b94c23a986";
// One 5 s timeout plus the ~2.5 s the capture takes anyway; main needs 60 s or more.
const STALLED_BUDGET_MS = 15_000;

const XO1 = `
.btn-xo { background-color: rgb(200, 200, 200); color: rgb(10, 10, 10); border: 1px solid rgb(0, 0, 0); }
.btn-xo:hover { background-color: rgb(30, 30, 200); color: rgb(255, 255, 255); }
.spinner { width: 20px; height: 20px; background-color: rgb(1, 2, 3); animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
@media (prefers-color-scheme: dark) {
  body { background-color: rgb(12, 12, 12); }
  .btn-xo { background-color: rgb(40, 40, 40); color: rgb(240, 240, 240); }
}`;
// Conflicts with XO1 on purpose: the hover background-color and @keyframes
// spin are declared in both sheets, so the merge order (the first sheet wins)
// can be observed.
const XO2 = `
.btn-xo:hover { background-color: rgb(250, 0, 0); box-shadow: rgb(0, 0, 0) 0px 0px 4px 0px; }
.btn-xo:focus-visible { border-color: rgb(200, 30, 30); }
.fader { width: 20px; height: 20px; background-color: rgb(4, 5, 6); animation: fade 2s ease; }
@keyframes spin { 0% { opacity: 0; } 100% { opacity: 1; } }
@keyframes fade { from { opacity: 0; } to { opacity: 1; } }`;
const STALL = `.btn-stall:hover { color: rgb(9, 9, 9); }`;

type StallMode = "none" | "connect" | "body";
type Dump = Awaited<ReturnType<typeof capturePage>>["styleDump"];

const slim = (d: Dump | undefined) =>
  d && {
    states: d.nodes.flatMap((n, i) => (n.states ? [{ i, tag: n.tag, states: n.states }] : [])),
    keyframes: d.keyframes ?? null,
    nodes: d.nodes.length,
  };

let failed = false;
function check(label: string, ok: boolean, detail = ""): void {
  if (!ok) failed = true;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${label}${detail ? ` (${detail})` : ""}`);
}

async function runPhase(stallMode: StallMode, stallCount: number) {
  const hits: Record<string, number> = {};
  const stalled = new Set<ServerResponse>();
  const css = (res: ServerResponse, body: string, delayMs = 0) =>
    setTimeout(() => res.writeHead(200, { "content-type": "text/css" }).end(body), delayMs);

  const sheets = createServer((req, res) => {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    hits[path] = (hits[path] ?? 0) + 1;
    // xo1 answers later than xo2, so the arrival order is not the sheet order.
    if (path === "/xo1.css") return void css(res, XO1, 400);
    if (path === "/xo2.css") return void css(res, XO2);
    if (path.startsWith("/stall")) {
      // The browser's own load (the first hit) succeeds; every refetch stalls.
      if (hits[path] === 1) return void css(res, STALL);
      stalled.add(res);
      if (stallMode === "body") res.writeHead(200, { "content-type": "text/css" }).write("/* partial */");
      return; // never ends
    }
    res.writeHead(404).end("not found");
  });
  const listen = (s: ReturnType<typeof createServer>) =>
    new Promise<number>((resolve) =>
      s.listen(0, "127.0.0.1", () => resolve((s.address() as { port: number }).port)),
    );
  const b = `http://127.0.0.1:${await listen(sheets)}`;
  const stallLinks = Array.from(
    { length: stallMode === "none" ? 0 : stallCount },
    (_, i) => `<link rel="stylesheet" href="${b}/stall${i}.css">`,
  ).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>xo probe</title>
<style>
  body { background-color: rgb(255, 255, 255); color: rgb(20, 20, 20); font-family: sans-serif; }
  .btn-same { background-color: rgb(220, 220, 220); color: rgb(0, 0, 0); border: 1px solid rgb(0, 0, 0); }
  .btn-same:hover { background-color: rgb(30, 160, 30); color: rgb(255, 255, 255); }
  .btn-same:focus-visible { border-color: rgb(200, 30, 30); }
  .pulser { width: 20px; height: 20px; background-color: rgb(7, 8, 9); animation: pulse 3s ease; }
  @keyframes pulse { from { opacity: 1; } to { opacity: 0.5; } }
</style>
<link rel="stylesheet" href="${b}/xo1.css">
<link rel="stylesheet" href="${b}/missing.css">
<link rel="stylesheet" href="${b}/xo2.css">
${stallLinks}
</head><body>
<h1>Cross-origin probe</h1>
<button class="btn-same">Same origin</button>
<button class="btn-xo">Cross origin</button>
<button class="btn-xo btn-stall">Cross origin 2</button>
<div class="spinner"></div><div class="fader"></div><div class="pulser"></div>
</body></html>`;
  const pages = createServer((_req, res) =>
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html),
  );
  const pagePort = await listen(pages);

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      colorScheme: "light",
    });
    const page = await context.newPage();
    await page.goto(`http://127.0.0.1:${pagePort}/`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
    const loadHits = { ...hits };
    const startedAt = Date.now();
    const artifacts = await capturePage(page);
    const ms = Date.now() - startedAt;
    const leftoverIds = await page.evaluate(() => document.querySelectorAll("[data-distill-id]").length);
    await context.close();
    const refetchHits = Object.fromEntries(
      Object.entries(hits).map(([path, n]) => [path, n - (loadHits[path] ?? 0)]),
    );
    const dumps = { light: slim(artifacts.styleDump), dark: slim(artifacts.darkCapture?.styleDump) };
    return { dumps, refetchHits, ms, leftoverIds };
  } finally {
    await browser.close();
    for (const res of stalled) res.destroy();
    for (const server of [sheets, pages]) {
      server.close();
      server.closeAllConnections();
    }
  }
}

const sha = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

console.log("phase 1: no stalled sheet");
const plain = await runPhase("none", 0);
console.log(`  capturePage ${plain.ms} ms, refetches ${JSON.stringify(plain.refetchHits)}`);
check(
  "each cross-origin sheet is refetched once per analysis",
  Object.keys(plain.refetchHits).length === 3 && Object.values(plain.refetchHits).every((n) => n === 1),
);
check("light + dark states and keyframes equal the dumps recorded on main", sha(plain.dumps) === PINNED, sha(plain.dumps));
const xo = plain.dumps.light?.states.find((s) => s.i === 3)?.states.find((s) => s.state === "hover");
check(
  "the first sheet wins a conflict although the second one arrives first",
  xo?.changes.find((c) => c.property === "background-color")?.to === "rgb(30, 30, 200)" &&
    plain.dumps.light?.keyframes?.find((k) => k.name === "spin")?.steps[0]?.properties[0] === "transform",
);
check(
  "the dark dump holds the dark base colour, re-scanned from the reused CSS text",
  plain.dumps.dark?.states.find((s) => s.i === 3)?.states[0]?.changes[0]?.from === "rgb(40, 40, 40)",
);
check("no data-distill-id attribute is left on the page", plain.leftoverIds === 0);

for (const [mode, count] of [["connect", 2], ["body", 1]] as const) {
  console.log(`phase: ${count} sheet(s) whose refetch stalls (${mode === "connect" ? "no response" : "headers, then a body that never ends"})`);
  const run = await runPhase(mode, count);
  console.log(`  capturePage ${run.ms} ms, refetches ${JSON.stringify(run.refetchHits)}`);
  check(`capturePage returns within ${STALLED_BUDGET_MS} ms`, run.ms < STALLED_BUDGET_MS, `${run.ms} ms`);
  check(
    "a stalled sheet is requested once and not retried by the dark pass",
    Object.values(run.refetchHits).every((n) => n === 1),
  );
  check("the other sheets still yield the same states and keyframes", sha(run.dumps) === PINNED);
}

console.log(failed ? "\nFAILED" : "\nall checks passed");
process.exit(failed ? 1 : 0);
````

Run it from the project root and delete it:

```bash
npx tsx scratch/xo-probe.mts   # every line "ok", last line "all checks passed", exit 0
rm scratch/xo-probe.mts
git status --short              # must not list scratch/
```

If the pinned hash check fails while the three readable checks pass, print `plain.dumps` and compare it with the "Expected dump" below before changing anything: the hash covers the node count and every state and keyframe of both dumps.

Expected dump (both schemes; the dark dump differs only in the two `from` values marked): 8 nodes; node 2 (`.btn-same`) hover `background-color rgb(220, 220, 220) → rgb(30, 160, 30)`, `color rgb(0, 0, 0) → rgb(255, 255, 255)`, focus `border-color rgb(0, 0, 0) → rgb(200, 30, 30)`; nodes 3 and 4 (`.btn-xo`) hover `background-color rgb(200, 200, 200) → rgb(30, 30, 200)` (dark `from`: `rgb(40, 40, 40)`), `color rgb(10, 10, 10) → rgb(255, 255, 255)` (dark `from`: `rgb(240, 240, 240)`), `box-shadow none → rgb(0, 0, 0) 0px 0px 4px 0px`, focus `border-color rgb(0, 0, 0) → rgb(200, 30, 30)`; keyframes in the order `pulse` (`opacity`), `spin` (`transform`), `fade` (`opacity`).

### 2. The real app, on a page with no cross-origin sheet (regression)

```bash
.claude/skills/verify/scripts/verify.sh up
.claude/skills/verify/scripts/verify.sh drive analyze-url
.claude/skills/verify/scripts/verify.sh down
```

Expected: every check prints `ok` (HTTP 200, report and structure tab present), and `console-errors.txt` is empty. The fixture server of the verify skill has one origin, so this step cannot show the refetch itself; step 1 does.

### 3. Full gate

```bash
npm run check
```

Run it only after `verify.sh down`. Expected: exit 0, eval `aggregate combined: 100%`.

---

## Risks

| Risk | Mitigation |
|------|------------|
| A slow but healthy CSS host needs more than 5 s, and its hover/focus states and keyframes drop out of the report | **In scope, by design**: the omission is honest ("measured, never faked": a missing signal is an omitted field), the browser loaded the same sheet moments earlier, and the value is one constant. The value itself is Open Question 1 |
| The merge order changes because responses arrive in a different order than the sheets | **In scope**: `Promise.all` keeps the order of `dump.crossOriginHrefs`, and the apply loop is sequential. The scratch check delays the first sheet by 400 ms and asserts that it still wins both conflicts |
| The dark dump reuses light-scheme results | **In scope**: only the CSS text is cached; the scan runs again against the dark computed styles. The scratch check asserts the dark `from` value |
| A failed fetch is remembered, so a transient failure in the light pass also costs the dark dump that sheet | **In scope, accepted**: retrying is what let a stalled host cost its timeout twice. The dark dump feeds only `extractDarkPalette` (`lib/analyze.ts:69-74`), which reads colours, not states or keyframes. See Open Question 2 |
| A page with many cross-origin sheets starts that many requests at once | **Out of scope, flag only**: the count is bounded by the page's own `<link>`s, which the browser already fetched in parallel, and the issue asks for `Promise.all` with no cap |
| The cache holds the text of every cross-origin sheet until `capturePage` returns, where `main` held one at a time | **Out of scope, flag only**: bounded by the page's own CSS, and released when the capture ends. `main` already left every `APIResponse` body in the browser context until it closed |
| A future third caller of `collectStyleDump` refetches everything | **In scope**: the cache parameter is required, so the compiler asks every caller for one; Task 1 greps the callers |
| The scratch check's 15 s budget fails on a very slow machine | **In scope**: the measured time is 7.1 s and `main` needs 62.9 s or more, so the budget can be raised in the scratch file without losing the distinction |
| The refetch is outside the SSRF guard | **Out of scope, unchanged**: documented decision (`README.md:207-213`); the change adds no request and no new target |

---

## Open Questions

1. **Timeout value.** The issue says "a few seconds". Proposed default: `CROSS_ORIGIN_SHEET_TIMEOUT_MS = 5_000`. Rationale: the browser has just loaded the same sheet, so 5 s is generous for a healthy host, and the worst case becomes one 5 s wait per analysis, next to a 30 s navigation ceiling (`lib/ingest.ts:72`) and an 8 s network-idle wait (`lib/ingest.ts:435`) inside `maxDuration = 60`. 3 s would cut the worst case further at a higher risk of dropping a slow CDN.
2. **Is a failed or timed-out sheet retried by the dark pass?** The issue says only that it "is skipped". Proposed default: no, the failure is remembered for the capture. Rationale: "once per analysis", and a retry is the reason a stalled host costs its timeout twice on `main`.
3. **Should a skipped sheet be logged?** `main` skips silently (`lib/extract/styleDump.ts:731-733`), while the other best-effort passes of `lib/ingest.ts` log a `console.warn`. Proposed default: stay silent, as before. Rationale: the issue asks for no logging, and a 404 on a stylesheet is common enough to be noise. A one-line `console.warn` for a timeout only is the alternative if the owner wants stalled hosts to be visible in the server log.
4. **Should the two-origin check become permanent?** Proposed default: no, keep it a scratch script that is deleted after use. Rationale: the issue's notes point to the scratch fixture of the spike report, `AGENTS.md:54-56` prescribes scratch scripts for this kind of check, eval replays frozen captures offline, and the verify skill's fixture server has one origin. A permanent check would need a second origin in `.claude/skills/verify/scripts/fixture-server.mjs` and a new scenario in `drive.ts`, which is a story of its own.

---

## Acceptance Criteria

- [ ] Cross-origin stylesheets are fetched concurrently, each with an explicit timeout of a few seconds.
- [ ] Their rules are applied in the original stylesheet order.
- [ ] The dark-scheme pass reuses the CSS text that the light pass fetched.
- [ ] A sheet that fails or times out is skipped without failing the analysis.
- [ ] Checked on a page with a cross-origin stylesheet: the same hover/focus states and keyframes are recovered as before (scratch check of End-to-End Verification step 1, all `ok`).
- [ ] `docs/architecture/tokens-lane.md` and `docs/architecture/ingestion.md` describe the new behaviour.
- [ ] `npm run check` exits 0 with the same eval scores; no scratch file is left in the repository.
