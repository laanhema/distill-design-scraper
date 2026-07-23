# Plan: Close Residual SSRF Guard Gaps

## Summary

Close three residual gaps in the SSRF guard: (1) hex-form IPv4-mapped IPv6 addresses
(`::ffff:7f00:1`) currently bypass the IPv4 range checks because `extractIpv4Mapped` only
matches the dotted-quad form — fix by adding a BigInt-based `::ffff:0:0/96` check in
`isBlockedIpv6` that extracts the embedded v4 address regardless of textual form; (2) add
`100.64.0.0/10` (CGNAT), `224.0.0.0/4` (multicast), and `240.0.0.0/4` (reserved, incl.
broadcast) to `BLOCKED_IPV4_RANGES`; (3) docs-only — state the TOCTOU/DNS-rebinding
limitation explicitly in the README Layer 2 threat model (guard resolves via `dns.lookup`
once; Chromium resolves again independently, so egress firewalling is the real mitigation)
and update the §3 range list. Preserve the guard's fail-closed posture throughout.

## User Story

As an operator
I want the SSRF guard to cover hex-form IPv4-mapped IPv6 addresses and remaining private/special ranges, and the threat model to name DNS rebinding explicitly
So that the guard's documented coverage matches its actual coverage

## Metadata

| Field | Value |
|-------|-------|
| Type | BUG_FIX (security hardening) + docs |
| Complexity | LOW |
| Systems Affected | `lib/security/ssrfGuard.ts`, `README.md` |
| GitHub Issue | #25 (DIST-019) |

---

## Patterns to Follow

### Range definition + int/mask arithmetic (extend, don't rewrite)

```ts
// SOURCE: lib/security/ssrfGuard.ts:41-61
const BLOCKED_IPV4_RANGES: Ipv4Range[] = [
  rangeToInt("127.0.0.0/8"),
  ...
  // Beyond the literal AC list: "this network" — same class of reserved
  // address as loopback/private, closing an obvious adjacent bypass.
  rangeToInt("0.0.0.0/8"),
];
export function isBlockedIpv4(ip: string): boolean {
  const ipInt = ipv4ToInt(ip);
  if (ipInt === null) return false;
  for (const { base, maskBits } of BLOCKED_IPV4_RANGES) { ... }
}
```
New ranges join this list with a short comment naming each range, matching the existing
commented style.

### IPv6 BigInt mask checks (mirror for the mapped-range check)

```ts
// SOURCE: lib/security/ssrfGuard.ts:107-116
// fc00::/7 — unique local addresses.
const uniqueLocalBase = ipv6ToBigInt("fc00::")!;
const uniqueLocalMask = ((1n << 128n) - 1n) ^ ((1n << (128n - 7n)) - 1n);
if ((ipInt & uniqueLocalMask) === (uniqueLocalBase & uniqueLocalMask)) return true;
```

### Verification

No unit-test framework (per CLAUDE.md). Follow the established pattern from the original
SSRF work (`.agents/reports/ssrf-guard-url-analysis-report.md`): a scratch `npx tsx` script
run from the project root exercising `isBlockedIpv4` / `isBlockedIpv6` / `assertSafeUrl`
directly, deleted after use.

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/security/ssrfGuard.ts` | UPDATE | Hex-form mapped-v6 handling + new blocked IPv4 ranges |
| `README.md` | UPDATE | §3 range list + Layer 2 TOCTOU/DNS-rebinding paragraph |

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Add CGNAT + multicast/reserved IPv4 ranges

- **File**: `lib/security/ssrfGuard.ts`
- **Action**: UPDATE
- **Implement**: Append to `BLOCKED_IPV4_RANGES`, each with a one-line comment:
  - `100.64.0.0/10` — CGNAT shared address space (RFC 6598)
  - `224.0.0.0/4` — multicast
  - `240.0.0.0/4` — reserved / future use, includes `255.255.255.255` broadcast
- **Mirror**: `lib/security/ssrfGuard.ts:41-50` (existing list + comment style)
- **Validate**: `npm run typecheck`

### Task 2: Handle hex-form IPv4-mapped IPv6 addresses

- **File**: `lib/security/ssrfGuard.ts`
- **Action**: UPDATE
- **Implement**:
  1. Extract the range-check body of `isBlockedIpv4` into an internal
     `isBlockedIpv4Int(ipInt: number): boolean`; `isBlockedIpv4` becomes
     parse-then-delegate (public signature unchanged).
  2. In `isBlockedIpv6`, after the existing dotted-quad `extractIpv4Mapped` shortcut and
     the BigInt parse, add an IPv4-mapped check on the parsed value: if
     `(ipInt >> 32n) === 0xffffn` (i.e. the address is inside `::ffff:0:0/96`), return
     `isBlockedIpv4Int(Number(ipInt & 0xffffffffn))`. This catches every textual spelling
     of a mapped address (`::ffff:7f00:1`, `0:0:0:0:0:ffff:7f00:1`, mixed case) because it
     operates on the parsed 128-bit value, not the string. Keep the existing dotted-quad
     regex path — `ipv6ToBigInt` cannot parse the embedded-dotted-quad form
     (`::ffff:127.0.0.1`), so both paths are needed.
  3. Update `isBlockedIpv6`'s doc comment to state mapped addresses are normalized in
     both dotted and hex forms.
  4. Note (module docstring, one sentence): the guard validates at submission time via
     `dns.lookup`; Chromium re-resolves at navigation time, so DNS rebinding between the
     two lookups is out of scope here and mitigated by network-layer egress rules (see
     README Layer 2). Keeps code comment honest alongside the README fix.
- **Mirror**: `lib/security/ssrfGuard.ts:88-119`
- **Validate**: `npm run typecheck`

### Task 3: README — range list + TOCTOU/DNS-rebinding in Layer 2

- **File**: `README.md`
- **Action**: UPDATE
- **Implement**:
  1. §3 (Setup, "SSRF guard"): extend the IPv4 range list with `100.64.0.0/10`,
     `224.0.0.0/4`, `240.0.0.0/4`, and note IPv4-mapped IPv6 addresses are blocked in
     both dotted (`::ffff:127.0.0.1`) and hex (`::ffff:7f00:1`) forms.
  2. Layer 2 (~line 148): extend the existing "only validates the initial submitted URL"
     paragraph to explicitly name the TOCTOU/DNS-rebinding limitation: the guard resolves
     the hostname once via `dns.lookup` and validates that result, but Chromium performs
     its own independent resolution when it navigates — a rebinding DNS name can answer
     public at check time and private at navigation time. State plainly that egress
     firewalling (the existing Layer 2 prescription) is the real mitigation for this, not
     the in-process guard.
- **Mirror**: `README.md:65-73` and `README.md:146-151` (existing prose style)
- **Validate**: n/a (docs)

### Task 4: Scratch verification script (delete after use)

- **File**: scratchpad (outside repo) or project-root temp file removed afterwards
- **Action**: CREATE then DELETE
- **Implement**: `npx tsx` script from the project root importing
  `isBlockedIpv4`/`isBlockedIpv6`/`assertSafeUrl` and asserting:
  - Blocked: `::ffff:7f00:1`, `0:0:0:0:0:ffff:7f00:1`, `::ffff:127.0.0.1`,
    `::ffff:a9fe:a9fe` (mapped 169.254.169.254), `100.64.0.1`, `100.127.255.255`,
    `224.0.0.1`, `239.255.255.255`, `240.0.0.1`, `255.255.255.255`
  - Still allowed (no over-blocking): `100.63.255.255`, `100.128.0.0`, `8.8.8.8`,
    `1.1.1.1`, `223.255.255.255`, `2606:4700::1111`
  - `assertSafeUrl("http://[::ffff:7f00:1]/")` rejects with `UnsafeUrlError`;
    `assertSafeUrl("https://example.com/")` resolves (needs network — skip gracefully
    offline).
- **Validate**: script exits 0 with all cases as expected

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Eval regression gate (extraction lane untouched — must pass unchanged, no baseline refresh)
npm run eval
```

## End-to-End Verification

Run the Task 4 scratch script from the project root:
`npx tsx <scratchpad>/verify-ssrf-gaps.ts` — expect every blocked case rejected, every
allowed case passing, and `assertSafeUrl("http://[::ffff:7f00:1]/")` throwing
`UnsafeUrlError`. Optionally confirm end-to-end against the dev server:
`curl -s -X POST localhost:3000/api/analyze -H 'content-type: application/json' -d '{"url":"http://[::ffff:7f00:1]/"}'`
should return the 400 unsafe-URL response. Delete the scratch script afterwards.

---

## Acceptance Criteria

- [ ] `http://[::ffff:7f00:1]/` (hex-form mapped loopback) rejected like `::ffff:127.0.0.1`
- [ ] `100.64.0.0/10`, multicast (`224.0.0.0/4`) and reserved (`240.0.0.0/4`) targets rejected
- [ ] README Layer 2 explicitly names TOCTOU/DNS rebinding and points to egress firewalling as the mitigation
- [ ] No over-blocking: public addresses (incl. `100.63.x`/`100.128.x` boundary neighbours) still pass
- [ ] `npm run typecheck`, `npm run lint`, `npm run eval` all pass; eval baseline untouched
