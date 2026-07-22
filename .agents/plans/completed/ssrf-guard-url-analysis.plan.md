# Plan: Built-in SSRF Guard for URL Analysis

## Summary

Add a pre-navigation network-safety check to the URL ingestion seam so `POST /api/analyze` can't be used to make the headless browser probe an operator's internal network. The guard rejects non-http(s) schemes immediately, then resolves the hostname via DNS and blocks known private/reserved/loopback/link-local ranges (IPv4 and IPv6) — validating the *resolved* address, not the literal hostname string, so a rebinding-style hostname can't slip through. A documented env-var allowlist lets a deployer explicitly permit an internal target (e.g. staging). The guard lives entirely in `lib/ingest.ts` (the single URL→Capture seam), so it protects every caller of `renderUrl` and never touches the offline-replayable `extractFromCapture` measured lane; `app/api/analyze/route.ts` gets a thin error-type check to map the guard's rejection to a 4xx instead of the generic 502 used for render failures.

## User Story

As a deployer of a public Distill instance
I want the analyzer to refuse navigation to private, loopback, and link-local network targets
So that the open `POST /api/analyze` endpoint cannot be used to probe my internal network via the headless browser

## Metadata

| Field | Value |
|-------|-------|
| Type | NEW_CAPABILITY (security hardening) |
| Complexity | MEDIUM |
| Systems Affected | `lib/ingest.ts`, `app/api/analyze/route.ts`, new `lib/security/ssrfGuard.ts`, `README.md` |
| GitHub Issue | #2 (`[DIST-001] Built-in SSRF guard for URL analysis`, `laanhema/distill-design-scraper`) |

---

## Patterns to Follow

### Fail-closed validation before navigation
```ts
// SOURCE: lib/ingest.ts:86-93 (existing scheme check, being replaced/absorbed)
function isValidHttpUrl(candidate: string): boolean {
  try {
    const u = new URL(candidate);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
```
```ts
// SOURCE: lib/ingest.ts:350-356 — throw-before-launch pattern to mirror
const url = rawUrl.trim();
if (!isValidHttpUrl(url)) {
  throw new Error(`Invalid URL: must be an http(s) address, got "${rawUrl}".`);
}
```

### "Omit/reject, never fabricate" + best-effort comments
```ts
// SOURCE: lib/ingest.ts:167-174 (captureDarkScheme doc comment) — house style for
// explaining *why* a check exists and what it deliberately does not attempt.
```

### Error-to-HTTP-status translation at the route
```ts
// SOURCE: app/api/analyze/route.ts:150-155
} catch (err) {
  // §9: surface a clear error, never fabricate results.
  const message =
    err instanceof Error ? err.message : "Unknown rendering error.";
  return NextResponse.json({ ok: false, error: message }, { status: 502 });
}
```
This is the only place status codes are chosen today — every thrown error currently becomes a 502. The guard needs a `instanceof` branch inserted above this fallback so validation failures become 4xx per PRD §10 ("4xx on invalid payload... 5xx on render/extraction failure").

### Env-var config + README documentation
```ts
// SOURCE: lib/aiLane.ts:13
return Boolean(process.env.ANTHROPIC_API_KEY);
```
```md
<!-- SOURCE: README.md:58-63 -->
2. **Configure Environment Variables** *(Optional)*:
   Create a `.env.local` file in the project root to enable the AI interpretation lane:
   \`\`\`env
   # .env.local
   ANTHROPIC_API_KEY=sk-ant-...
   \`\`\`
```

### Manual verification (no unit-test framework in this repo)
```md
<!-- SOURCE: CLAUDE.md, "Manually verifying extraction changes" -->
spin up a local http.createServer serving a small synthetic HTML string, call
renderUrl + captureFromRender + extractFromCapture against it... Run with
`npx tsx` from the project root. Delete scratch scripts after use.
```

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/security/ssrfGuard.ts` | CREATE | IP-range checks, DNS-resolution guard, allowlist, and the error type the route keys off of |
| `lib/ingest.ts` | UPDATE | Call the guard at the top of `renderUrl`, before `chromium.launch`; drop the now-redundant inline scheme check |
| `app/api/analyze/route.ts` | UPDATE | Catch the guard's error type and return 400 instead of falling through to 502 |
| `README.md` | UPDATE | Document the default blocked ranges and the `SSRF_ALLOWLIST_HOSTS` env var, next to the existing `ANTHROPIC_API_KEY` docs |

---

## Tasks

### Task 1: Create the SSRF guard module

- **File**: `lib/security/ssrfGuard.ts`
- **Action**: CREATE
- **Implement**:
  - `export class UnsafeUrlError extends Error {}` — single error type for every rejection reason (bad scheme, blocked range, unresolvable host), so the route can key off one `instanceof` check.
  - `isBlockedIpv4(ip: string): boolean` — checks against `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16` (plus `0.0.0.0/8`, flagged in a comment as an extra beyond the literal AC list, since it's the same class of reserved address) using plain 32-bit integer + mask arithmetic — no new dependency.
  - `isBlockedIpv6(ip: string): boolean` — checks `::1` (exact) and `fc00::/7` via BigInt-based 128-bit parsing + mask; also normalize IPv4-mapped addresses (`::ffff:a.b.c.d`) by delegating to `isBlockedIpv4` on the embedded v4 address (comment why: otherwise `::ffff:127.0.0.1` bypasses the v4 checks entirely). Also block `fe80::/10` (v6 link-local — the v4 analogue of `169.254.0.0/16`, omitted from the AC's list but the same intent), flagged clearly in a comment as an addition.
  - `parseAllowlist(): Set<string>` — reads `process.env.SSRF_ALLOWLIST_HOSTS`, comma-split, trimmed, lower-cased.
  - `export async function assertSafeUrl(rawUrl: string): Promise<void>`:
    1. `new URL(rawUrl)` in a try/catch → `UnsafeUrlError` on parse failure or non-`http:`/`https:` protocol (absorbs today's `isValidHttpUrl` check, same message shape).
    2. Strip `[`/`]` from `u.hostname` for the allowlist/IP-literal checks.
    3. If hostname (lower-cased) is in the allowlist set, return — bypass everything below.
    4. `dns.promises.lookup(hostname, { all: true, verbatim: true })`; on failure, throw `UnsafeUrlError` ("could not resolve hostname — refusing to navigate without validating it's safe"), i.e. fail closed rather than letting Playwright attempt its own resolution unchecked.
    5. For every resolved `{ address, family }`, call `isBlockedIpv4`/`isBlockedIpv6` as appropriate; throw `UnsafeUrlError` naming the offending address/range on first match.
- **Mirror**: `lib/ingest.ts:86-93` for the scheme check shape; `lib/extract/roleMatch.ts`'s file-level doc comment style for explaining a shared-helper's "why" once at the top of the module.
- **Validate**: `npm run typecheck`

### Task 2: Wire the guard into `renderUrl`

- **File**: `lib/ingest.ts`
- **Action**: UPDATE
- **Implement**: Replace the `isValidHttpUrl` check at `lib/ingest.ts:352-356` with `await assertSafeUrl(url)` (import from `@/lib/security/ssrfGuard`), called before `chromium.launch` at line 364. Delete the now-unused `isValidHttpUrl` function (lines 86-93) rather than leaving dead code.
- **Mirror**: existing placement — the check must stay the very first thing that happens after trimming the URL, strictly before any Playwright call.
- **Validate**: `npm run typecheck`

### Task 3: Translate the guard's rejection into a 4xx at the route

- **File**: `app/api/analyze/route.ts`
- **Action**: UPDATE
- **Implement**: Import `UnsafeUrlError` from `@/lib/security/ssrfGuard`. In the `catch (err)` block (currently `app/api/analyze/route.ts:150-155`), add a branch before the generic fallback:
  ```ts
  if (err instanceof UnsafeUrlError) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
  }
  ```
  This also fixes a latent bug the AC surfaces: today an invalid-scheme URL (`ftp://…`) already gets rejected inside `renderUrl`, but the route's blanket catch turns it into a 502 — per PRD §10 ("4xx on invalid payload") and AC #2, it must be 4xx.
- **Mirror**: `app/api/analyze/route.ts:150-155` (keep the existing 502 fallback for genuine render/extraction failures unchanged).
- **Validate**: `npm run typecheck`, `npm run lint`

### Task 4: Document the allowlist env var

- **File**: `README.md`
- **Action**: UPDATE
- **Implement**: Add a short subsection next to the existing "Configure Environment Variables" block (`README.md:58-63`) covering: the default blocked ranges (loopback/private/link-local, v4 + v6), that validation happens post-DNS-resolution, and `SSRF_ALLOWLIST_HOSTS=staging.example.internal,localhost` as the bypass mechanism (comma-separated exact hostnames, case-insensitive).
- **Mirror**: `README.md:58-63` formatting (fenced `env` block).
- **Validate**: manual read-through; no build step for markdown.

### Task 5: Manually verify the guard (no unit-test framework in this repo)

- **File**: none committed — scratch script only
- **Action**: n/a
- **Implement**: Following the CLAUDE.md "Manually verifying extraction changes" convention, write a throwaway script under the scratchpad dir, run via `npx tsx <script>` **from the project root**, that calls `renderUrl` (or `assertSafeUrl` directly, cheaper since it skips launching Chromium) against:
  - `http://127.0.0.1/` and `http://169.254.169.254/` (literal blocked IPv4s) → expect rejection, no DNS involved.
  - `http://localhost/` → expect rejection (resolves to `127.0.0.1`/`::1`).
  - `http://[::1]/` → expect rejection (literal v6 loopback).
  - `ftp://example.com`, `file:///etc/passwd`, `chrome://settings` → expect scheme rejection.
  - `http://example.com/` → expect success (public host, unaffected).
  - With `SSRF_ALLOWLIST_HOSTS=localhost` set, re-check `http://localhost/` → expect it to now pass validation.
  Delete the script when done.
- **Validate**: script output matches expectations above; then run `npm run eval` once to confirm the offline eval harness (which never calls `renderUrl` — `eval/capture.ts` drives Chromium directly against `file://` fixtures / live URLs) is unaffected, satisfying AC #4.

---

## Validation

```bash
npm run typecheck
npm run lint
npm run eval
```

---

## Risks

| Risk | Mitigation |
|------|------------|
| DNS answer at check-time can differ from what Chromium's own resolver uses at connect-time (true TOCTOU rebinding), and a same-origin HTTP redirect chain into a private IP happens *after* our one check | Out of scope for this pass per the AC's literal wording (checks the initial resolution, not a race). The story's own Technical Notes flag this ("consider also blocking cross-origin redirects... via Playwright route interception") as a possible follow-up — call it out as a known residual gap rather than silently declaring the guard airtight. |
| A deployer's allowlist entry is a hostname, but DNS for that hostname could later change to point somewhere unintended | Documented behavior, not a code fix — the allowlist is an explicit trust decision the deployer makes (matches the AC's own framing: "a deployer who wants to allow an internal target"). |
| Blocking ranges beyond the AC's literal list (`0.0.0.0/8`, `fe80::/10`, IPv4-mapped-v6 normalization) could be seen as scope creep | Each is a one-line addition directly closing an obvious bypass of the *named* ranges (e.g. `::ffff:127.0.0.1` trivially evades a naive v6-only `::1`/`fc00::/7` check); called out explicitly in Task 1 and left easy to strip if reviewers want the guard to match the AC verbatim. |

---

## Acceptance Criteria

- [ ] All tasks completed
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] `npm run eval` passes unchanged (guard doesn't touch the measured lane)
- [ ] Manual verification script confirms: blocked ranges rejected (4xx via route, thrown `UnsafeUrlError` directly via `renderUrl`), non-http(s) schemes rejected, hostname-based rebinding case rejected, public URL unaffected, allowlisted host bypasses the guard
