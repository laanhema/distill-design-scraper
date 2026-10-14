# Plan: Warn when a cross-origin stylesheet refetch times out

## Summary

`fetchCrossOriginSheet` (`lib/extract/styleDump.ts:128-147`) ends its request chain in `.catch(() => null)`, so a sheet whose refetch hits `CROSS_ORIGIN_SHEET_TIMEOUT_MS` vanishes from the report without a trace in the server log. The catch will now take the error. If it is Playwright's `errors.TimeoutError`, it logs one `console.warn` that names the sheet URL and the timeout, and every branch still resolves to `null`. A non-ok status and an empty body resolve in `.then` and never reach the catch, so they stay silent. A refused connection or a DNS failure rejects with a plain `Error` and stays silent too, which is the assumption the issue's technical notes record. The warning sits inside the promise that the `CrossOriginSheetCache` stores, so the dark-scheme pass reuses the settled promise and does not log again. `docs/architecture/tokens-lane.md` gets one clause about the warning.

**Decision (probe, 2026-10-14):** I called `ctx.request.get` against a server that never answers, using a 1000 ms timeout. It rejected with `errors.TimeoutError` (`instanceof` true, message `apiRequestContext.get: Timeout 1000ms exceeded.`). Against `localhost:1` (refused) and `nonexistent.invalid` (DNS) it rejected with a plain `Error` (`instanceof errors.TimeoutError` false). `instanceof errors.TimeoutError` therefore separates the timeout from the other failures without parsing the message.

## User Story

As the operator of Distill
I want a stalled cross-origin stylesheet host to show up in the server log
So that I can tell why hover/focus states and keyframes are missing from a report

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT |
| Complexity | LOW |
| Systems Affected | `lib/extract/styleDump.ts` (render-path style dump), `docs/architecture/tokens-lane.md` |
| GitHub Issue | #197 (TODO-24, `.agents/issues/todo-issues.md:936`) |
| PRD Phase | N/A |
| Prototype Patch | N/A |

## Environment Findings

| Probe | Result |
|-------|--------|
| `npm run eval` on HEAD | `clean-light`, `dark-mode`, `adversarial-shell` 100% each, `aggregate combined: 100%`, `✓ all gates passed` |
| Does eval run the changed code? | No. Eval replays committed captures and never calls `collectStyleDump`, and CI runs nothing else. The scratch check below is the only gate that executes the change |
| Scratch check (below) on HEAD | Exit 1. Four lines `ok` and one `FAIL exactly one warning names the stalled sheet and 5000 ms — []`. Fingerprint of keyframes + states (light, dark): `45be8b72ec7e`. Runtime about 9 s |
| Playwright `request.get` timeout error type | `errors.TimeoutError`, as recorded in the Decision above |
| Client bundle | No client file imports `lib/extract/styleDump.ts`, and `next.config.mjs` lists `playwright` in `serverExternalPackages`, so a value import of `errors` is safe |

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/extract/styleDump.ts` | UPDATE | Import `errors` from `playwright`. Warn on `errors.TimeoutError` inside `fetchCrossOriginSheet`'s catch. Update its doc comment and the `CrossOriginSheetCache` comment |
| `docs/architecture/tokens-lane.md` | UPDATE | State that a timed-out sheet logs a `console.warn` once per analysis, and that a non-ok, empty, or failed sheet is skipped silently |

## Tasks

### Task 1: Warn on a refetch timeout

- **File**: `lib/extract/styleDump.ts`
- **Action**: UPDATE
- **Implement**:
  1. Change line 1 to `import { errors, type Page } from "playwright";`.
  2. In `fetchCrossOriginSheet`, replace `.catch(() => null)` with:
     ```ts
     .catch((err: unknown) => {
       if (err instanceof errors.TimeoutError) {
         console.warn(
           `Cross-origin stylesheet refetch timed out after ${CROSS_ORIGIN_SHEET_TIMEOUT_MS} ms; skipping its hover/focus states and keyframes: ${href}`,
         );
       }
       return null;
     })
     ```
  3. Update the doc comment above the function. Every failure still resolves to `null`. Only a timeout logs, and it logs once per analysis because the cache holds this promise. Trim the `CrossOriginSheetCache` comment to match if it says otherwise.
- **Mirror**: the `console.warn` calls of the best-effort passes at `lib/ingest.ts:160` and `lib/ingest.ts:189`
- **Validate**: `npm run typecheck && npm run lint`

### Task 2: Document the warning

- **File**: `docs/architecture/tokens-lane.md`
- **Action**: UPDATE
- **Implement**: in the line 5 sentence "It's best-effort per stylesheet (a sheet that fails or times out is remembered as failed for the capture and skipped, with no retry)", add that a timeout also logs one `console.warn` naming the sheet URL and the timeout, while a non-ok status, an empty body, or a refused connection is skipped without a log line.
- **Mirror**: the existing wording of `docs/architecture/tokens-lane.md:5`
- **Validate**: `grep -n "console.warn" docs/architecture/tokens-lane.md`

## Validation

```bash
npm run typecheck
npm run lint
npm run eval    # must stay at 100% on all three sites; it does not run the changed path
npm run check   # typecheck → lint → build → eval, what CI runs; no verify.sh instance may be up
```

## End-to-End Verification

`npm run eval` never runs the cross-origin refetch, so the scratch check below is the gate. It serves a page on one local port and links four sheets from a second port:

- `ok.css` answers everyone. This is the control and proves that the pass ran.
- `stalled.css` answers only the browser's own load (`Sec-Fetch-Dest: style`) and never answers the refetch.
- `missing.css` returns 404.
- `empty.css` returns an empty 200 body.

The script then calls the real `capturePage` (light dump plus the dark-scheme dump, sharing one cache) and records every `console.warn`. Per `AGENTS.md`, it lives in the project root while it runs and is deleted afterwards. It drives Playwright directly, so it needs no SSRF allowlist. On HEAD it exits 1 on the warning line (see Environment Findings). After the change it must exit 0, and its fingerprint must equal HEAD's `45be8b72ec7e`, which shows that the report content is unchanged. If the fingerprint differs, first run the script on a stash of the change to tell nondeterminism from a real difference.

```bash
# from /home/lauri/github/distill-design-scraper
cat > scratch-xo-timeout.ts <<'EOF'
// Scratch check for #197. Copy to the project root, run with `npx tsx scratch-xo-timeout.ts`, then delete.
import { createServer, type Server } from "node:http";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
import { capturePage } from "./lib/ingest";

const listen = (s: Server) =>
  new Promise<number>((r) => s.listen(0, "127.0.0.1", () => r((s.address() as { port: number }).port)));

const SHEETS: Record<string, string> = {
  "ok.css": "@keyframes xo-rise{from{opacity:0}to{opacity:1}} .btn:hover{background-color:#0b3d91}",
  "stalled.css": "@keyframes xo-stalled-fade{from{opacity:0}to{opacity:1}} .btn{animation:xo-stalled-fade 1s}",
  "empty.css": "",
};

async function main() {
  // Second origin: ok/empty answer everyone, missing is 404, stalled answers only the browser's own load.
  const xo = createServer((req, res) => {
    const name = (req.url ?? "/").slice(1);
    const dest = req.headers["sec-fetch-dest"] ?? "-";
    if (name === "stalled.css" && dest !== "style") return; // never answers the refetch
    if (!(name in SHEETS)) return void res.writeHead(404).end("not found");
    res.writeHead(200, { "content-type": "text/css" }).end(SHEETS[name]);
  });
  const xoPort = await listen(xo);
  const origin = `http://127.0.0.1:${xoPort}`;
  const links = ["ok.css", "stalled.css", "missing.css", "empty.css"]
    .map((n) => `<link rel="stylesheet" href="${origin}/${n}">`)
    .join("");
  const app = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html" }).end(
      `<!doctype html><html><head>${links}</head><body><main><h1>Title</h1><p>Body text</p><button class="btn">Go</button></main></body></html>`,
    );
  });
  const appPort = await listen(app);

  const warns: string[] = [];
  const realWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warns.push(args.map(String).join(" "));
    realWarn(...args);
  };

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`http://localhost:${appPort}/`, { waitUntil: "load" });
  const cap = await capturePage(page);
  await browser.close();
  app.close();
  xo.close();
  console.warn = realWarn;

  const dumps = [cap.styleDump, cap.darkCapture?.styleDump];
  const kf = (cap.styleDump.keyframes ?? []).map((k) => k.name);
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(dumps.map((d) => ({ k: d?.keyframes, s: d?.nodes.map((n) => n.states) }))))
    .digest("hex")
    .slice(0, 12);

  const results: [string, boolean, string][] = [
    ["capture completed with a dark-scheme pass", cap.darkCapture !== undefined, ""],
    ["ok.css was refetched (xo-rise present)", kf.includes("xo-rise"), kf.join(",")],
    ["stalled sheet skipped (xo-stalled-fade absent)", !kf.includes("xo-stalled-fade"), kf.join(",")],
    [
      "exactly one warning names the stalled sheet and 5000 ms",
      warns.filter((w) => w.includes(`${origin}/stalled.css`) && w.includes("5000")).length === 1,
      JSON.stringify(warns),
    ],
    ["no warning names missing.css, empty.css or ok.css", !warns.some((w) => /(missing|empty|ok)\.css/.test(w)), ""],
  ];
  for (const [name, ok, detail] of results) console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` — ${detail}`}`);
  console.log(`fingerprint of keyframes + states (light, dark): ${fingerprint}`);
  process.exit(results.every(([, ok]) => ok) ? 0 : 1);
}

void main();
EOF
npx tsx scratch-xo-timeout.ts; echo "exit=$?"
rm -f scratch-xo-timeout.ts
```

Expected after the change: five `ok` lines, fingerprint `45be8b72ec7e`, `exit=0`, and exactly one `Cross-origin stylesheet refetch timed out after 5000 ms; …/stalled.css` line in the output, even though both the light and the dark dump ran.

## Risks

| Risk | Mitigation |
|------|------------|
| A future Playwright version reports the timeout as a plain `Error`, and the warning goes silent | Playwright is pinned at `1.61.1` in `package.json`, and the scratch check catches this on an upgrade. In scope only as the check above; no message-parsing fallback |
| The warning repeats on the dark pass | The warning sits inside the cached promise, so it runs once per cache entry, and the scratch check asserts exactly one. In scope |
| A refused connection or a DNS failure stays silent although it also drops states | The issue's technical notes keep these silent on purpose (the owner asked for the timeout only). Out of scope |
| No permanent check: the `verify` scenario `cross-origin` does not read the `next dev` log | Adding a log assertion to `drive.ts` would mean passing the log path into the driver. Out of scope; flag it as a possible follow-up in the report |

## Acceptance Criteria

- [ ] A cross-origin sheet whose refetch times out produces a `console.warn` naming the sheet URL and the timeout (scratch check line 4)
- [ ] A 404 or an empty-body sheet is skipped without a log line (scratch check line 5)
- [ ] The warning appears once per sheet per analysis across the light and dark passes (scratch check line 4: exactly one)
- [ ] The analysis completes and the report content is unchanged (scratch check lines 1-3 and fingerprint `45be8b72ec7e`)
- [ ] `npm run check` passes
- [ ] All tasks completed and the existing `console.warn` pattern is followed
