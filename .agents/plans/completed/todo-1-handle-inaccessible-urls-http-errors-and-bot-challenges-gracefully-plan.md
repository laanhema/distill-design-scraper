# Plan: Handle Inaccessible URLs, HTTP Errors, and Bot Challenges Gracefully

## Summary

When Playwright navigates to URLs that block headless browsers (Cloudflare / anti-bot challenge titles), return HTTP error status codes (401, 403, 5xx), or fail to connect / time out, the ingestion pipeline should abort immediately with a typed `BlockedNavigationError` instead of taking screenshots and extracting design styles from error/challenge pages. `app/api/analyze/route.ts` will catch `BlockedNavigationError` and return a structured 502 error containing the client-facing message rather than masking it as an internal server error. The frontend (`app/page.tsx`) will display this friendly message clearly with accessible role announcements.

## User Story

As a user submitting a website URL for design system analysis,
I want clear, immediate feedback when a site is blocked, inaccessible, or returning an HTTP error,
So that I understand why analysis failed rather than seeing a crash, hanging request, or inaccurate styles extracted from an anti-bot challenge or error page.

## Metadata

| Field | Value |
|-------|-------|
| Type | BUG_FIX |
| Complexity | LOW |
| Systems Affected | `lib/ingest.ts`, `app/api/analyze/route.ts`, `app/page.tsx` |
| GitHub Issue | #156 |
| PRD Phase | N/A |
| Prototype Patch | N/A |

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/ingest.ts` | UPDATE | Define `BlockedNavigationError`, check HTTP response status on `page.goto`, detect bot challenge titles, and wrap navigation timeout/network errors |
| `app/api/analyze/route.ts` | UPDATE | Catch `BlockedNavigationError` and return structured 502 response with the actionable message |
| `app/page.tsx` | UPDATE | Ensure error presentation is accessible with `role="alert"` and preserves client-facing messages |

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Define `BlockedNavigationError` and Ingestion Access Checks

- **File**: `lib/ingest.ts`
- **Action**: UPDATE
- **Implement**:
  1. Define and export `BlockedNavigationError extends Error {}`.
  2. Define `BOT_CHALLENGE_TITLE_PATTERNS` regex array and helper `isBotChallengeTitle(title: string): boolean` matching common anti-bot/challenge titles (e.g. `Just a moment...`, `Attention Required! | Cloudflare`, `Security Check`, `Verify you are human`, `403 Forbidden`, `Access Denied`, `Checking your browser...`, `ddos-guard`).
  3. In `renderUrl`:
     - Inspect `page.goto` response status. If `response.status() >= 400`, throw `BlockedNavigationError` with formatted HTTP error details (e.g. `Access denied to "${url}": HTTP 403 Forbidden.` or `Server error reaching "${url}": HTTP ${status} ${statusText}.`).
     - Check `await page.title()` immediately after navigation and throw `BlockedNavigationError` if `isBotChallengeTitle(title)` is true.
     - Wrap `page.goto` timeout and network connection errors (e.g. `net::ERR_`) in `BlockedNavigationError` with clear, user-facing error messages instead of rethrowing raw driver errors.
  4. In `capturePage`:
     - Also inspect `await page.title()` for bot challenge titles and throw `BlockedNavigationError` if detected, protecting any direct callers.
- **Mirror**: `lib/security/ssrfGuard.ts:20` (`UnsafeUrlError` definition and throw pattern).
- **Validate**: `npm run typecheck`

### Task 2: Route Handler Error Handling

- **File**: `app/api/analyze/route.ts`
- **Action**: UPDATE
- **Implement**:
  1. Import `BlockedNavigationError` from `@/lib/ingest`.
  2. In the `POST` route catch block, add an explicit `err instanceof BlockedNavigationError` branch returning `{ ok: false, error: err.message } satisfies AnalyzeFailure` with HTTP status `502`.
- **Mirror**: `app/api/analyze/route.ts:245-258` (`UnsafeUrlError` and `DegenerateImageError` handling).
- **Validate**: `npm run typecheck && npm run lint`

### Task 3: Frontend Error Accessibility & Presentation

- **File**: `app/page.tsx`
- **Action**: UPDATE
- **Implement**:
  1. Add `role="alert"` to the error container at `app/page.tsx:333`.
  2. Ensure friendly display of error messages returned from the API without alteration.
- **Mirror**: `app/page.tsx:332-337` (existing error banner rendering).
- **Validate**: `npm run typecheck && npm run lint`

### Task 4: Automated Verification and Full Gate Check

- **File**: `lib/ingest.ts`
- **Action**: CHECK
- **Implement**:
  1. Run the reproduction check script (testing HTTP 403, challenge title, and connection failure) and verify it passes (exits 0).
  2. Run the full verification suite (`npm run check`).
- **Mirror**: `package.json:14`
- **Validate**: `npm run check`

---

## Validation

```bash
# Type check / Build
npm run typecheck && npm run build

# Lint
npm run lint

# Tests
npm run eval

# Reproduction (BUG_FIX): red on unfixed code, green after fix
SSRF_ALLOWLIST_HOSTS=127.0.0.1 npx tsx -e '
import http from "node:http";
import { renderUrl, BlockedNavigationError } from "./lib/ingest";

async function test() {
  const server = http.createServer((req, res) => {
    res.writeHead(403, { "Content-Type": "text/html" });
    res.end("<html><head><title>403 Forbidden</title></head><body><h1>Forbidden</h1></body></html>");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as any).port;
  try {
    await renderUrl(`http://127.0.0.1:${port}`);
    console.error("FAIL: renderUrl should have thrown BlockedNavigationError on 403");
    process.exit(1);
  } catch (err: any) {
    if (err instanceof BlockedNavigationError) {
      console.log("PASS: BlockedNavigationError thrown on 403:", err.message);
    } else {
      console.error("FAIL: Unexpected error type:", err);
      process.exit(1);
    }
  } finally {
    server.close();
  }
}
test();
'
```

## End-to-End Verification

1. Start a local synthetic server with test scenarios:
   - Route `/403`: returns status 403 with an error message body.
   - Route `/challenge`: returns status 200 with `<title>Just a moment...</title>`.
   - Route `/500`: returns status 500 with server error body.
2. In a scratch verification script running with `SSRF_ALLOWLIST_HOSTS=127.0.0.1`:
   - Verify `renderUrl("http://127.0.0.1:<port>/403")` rejects with `BlockedNavigationError` citing HTTP 403 Forbidden.
   - Verify `renderUrl("http://127.0.0.1:<port>/challenge")` rejects with `BlockedNavigationError` citing bot challenge.
   - Verify `renderUrl("http://127.0.0.1:<port>/500")` rejects with `BlockedNavigationError` citing HTTP 500.
   - Verify `renderUrl("http://127.0.0.1:1")` rejects with `BlockedNavigationError` citing unreachable / connection error.
3. Verify `POST /api/analyze` integration:
   - Call `analyzeUrl` directly or through `/api/analyze` mock request and ensure it produces `{ ok: false, error: ... }` with status 502.
4. Clean up all scratch scripts and verify `npm run check` passes completely.

## Risks

| Risk | Mitigation |
|------|------------|
| False-positive bot challenge title matches on legitimate websites | Anchor challenge title regexes to known challenge phrases (e.g. `Just a moment...`, `Attention Required! \| Cloudflare`, `Security Check`, `Verify you are human`) rather than broad words |
| Eval fixture regressions | Eval fixtures replay offline from `capture.json` and don't invoke `renderUrl`; `npm run eval` will continue to pass |
| Unrelated uncommitted file `.agents/issues/todo-issues.md` | Leave this file completely untouched as instructed |

## Acceptance Criteria

- [ ] Ingestion pipeline catches HTTP errors (e.g. 401 Unauthorized, 403 Forbidden, 5xx) and bot-challenge pages during navigation and raises a typed `BlockedNavigationError`.
- [ ] If navigation fails, is blocked, or times out, the API returns a structured error message indicating the site is inaccessible rather than crashing, hanging, or extracting challenge styles.
- [ ] The frontend displays the specific accessibility/block error state clearly to the user.
- [ ] `npm run check` passes.
- [ ] Follows existing patterns and architecture guidelines.
