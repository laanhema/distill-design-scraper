# Code Review: feature/ssrf-guard-residual-gaps

**Scope**: branch `feature/ssrf-guard-residual-gaps` vs `main` (uncommitted working-tree changes; 2 files)
**Recommendation**: APPROVE (with nits)

## Summary

Reviewed the SSRF-guard hardening for issue #25: hex-form IPv4-mapped IPv6 handling via a
BigInt `::ffff:0:0/96` check, three new blocked IPv4 ranges (CGNAT, multicast,
reserved/broadcast), and README/docstring updates naming the TOCTOU/DNS-rebinding limitation.
The core logic is correct: the `ipInt >> 32n === 0xffffn` comparison exactly identifies
`::ffff:0:0/96` (upper 96 bits must be `…ffff`), `Number(ipInt & 0xffffffffn)` is within safe
integer range, the early return for mapped addresses is sound (mapped space cannot also be
unique-local or link-local), and `isBlockedIpv4`'s public signature is unchanged. Fail-closed
posture is preserved; docs match actual coverage.

## Issues Found

### Critical
None

### High Priority
None

### Medium Priority
None

### Suggestions (Low)

1. `lib/security/ssrfGuard.ts:104-108` — `extractIpv4Mapped`'s regex only matches the
   `::ffff:a.b.c.d` spelling, so the full-group dotted form `0:0:0:0:0:ffff:127.0.0.1`
   returns `false` from `isBlockedIpv6` when called directly (`ipv6ToBigInt` can't parse a
   dotted final group, and the regex requires the `::` prefix). Unreachable through
   `assertSafeUrl` — `dns.lookup`/getaddrinfo normalizes IP literals before the check — but
   worth a comment or a widened regex if `isBlockedIpv6` ever gains other callers.
2. `lib/security/ssrfGuard.ts` — deprecated IPv4-compatible IPv6 (`::/96`, e.g. `::7f00:1`)
   and NAT64 (`64:ff9b::/96`) embeddings are not translated to their embedded v4 address.
   Both are outside the issue's acceptance criteria and rarely routable in practice; noting
   for a possible future hardening pass, not for this change.

## Validation Results

| Check | Status |
|-------|--------|
| Type Check (`npm run typecheck`) | PASS |
| Lint (`npm run lint`) | PASS |
| Tests (`npm run eval`) | PASS (all gates, baseline untouched) |

## What's Good

- The BigInt mapped-range check operates on the parsed 128-bit value, so it covers every
  hex spelling (case, zero-padding, full-group form) rather than patching the regex — the
  right level to fix a textual-form bypass.
- `isBlockedIpv4Int` factoring avoids an int→string→int round-trip and keeps one range list
  as the single source of truth for both address families.
- New ranges follow the file's established comment-per-range style and the README range list
  was updated in the same change, keeping documented coverage equal to actual coverage.
- The Layer 2 TOCTOU paragraph is honest about what the in-process guard cannot do and
  points to the already-prescribed egress firewalling — matches the repo's
  "measured, never faked" documentation ethos.

## Recommendation

Approve. The two low-priority notes are optional follow-ups, not blockers. Next step:
commit on the feature branch and open a PR (separate follow-up command per repo git policy).
