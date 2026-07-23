# Code Review: Unstaged changes (deployment-hardening-docs)

**Scope**: Unstaged changes on `feature/deployment-hardening-docs` — `README.md`, `.agents/PRDs/PRD.md` (modified), plus untracked `.agents/plans/completed/deployment-hardening-docs-plan.md` and `.agents/reports/deployment-hardening-docs-report.md`
**Recommendation**: APPROVE

## Summary

Pure documentation change adding a "Deploying Publicly — Hardening Guide" section to README.md and updating PRD.md §9/§12/§14 to reflect that SSRF guarding (`lib/security/ssrfGuard.ts`) and rate limiting (`lib/security/rateLimiter.ts`) have shipped in prior PRs (#8, #9), rather than remaining open Phase-4 items. No code files are touched. I cross-checked every technical claim in the new prose against the actual implementation and found no inaccuracies.

## Issues Found

### Critical
None

### High Priority
None

### Medium Priority
None

### Suggestions
- None of substance. Optional nit: the new README section references "§3"/"§4 above" for the SSRF guard and rate-limit config — these resolve correctly today (Setup & Configuration items 3 and 4), but since they're plain numbered-list positions rather than anchors, a future reordering of that list would silently break the cross-reference. Not worth restructuring for; just something to keep in mind if that list changes.

## Validation Results

| Check | Status |
|-------|--------|
| Type Check (`npm run typecheck`) | PASS |
| Lint (`npm run lint`) | N/A — repo has no ESLint config; `next lint` drops into an interactive setup wizard. Pre-existing environment gap, unrelated to this change (also noted in the untracked implementation report). |
| Tests | N/A — no code changed, nothing to test; eval harness untouched (correctly, per CLAUDE.md policy — doc-only changes don't touch `lib/extract/**`) |

## Fact-checks performed

- `SSRF_ALLOWLIST_HOSTS`, `RATE_LIMIT_MAX_REQUESTS`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_BUCKETS`, `RATE_LIMIT_DISABLED` all confirmed present and behave as described in `lib/security/ssrfGuard.ts` / `lib/security/rateLimiter.ts`.
- Blocked IP ranges listed in README (loopback, RFC1918, link-local, IPv6 equivalents) match `BLOCKED_IPV4_RANGES`/`isBlockedIpv6` exactly.
- "Cache hits don't count against the limit" claim matches `app/api/analyze/route.ts:69-80` (rate limit check sits after the cache-hit early return).
- "Limiter trusts the first `X-Forwarded-For` entry, falling back to `X-Real-IP`" matches `extractClientId` in `rateLimiter.ts:97-108` exactly — the Layer 3 warning about spoofing without a trusted reverse proxy is accurate.
- PRD section references (§9, §12, §14) all correspond to real, correctly-numbered headings in `PRD.md`.
- README "Setup & Configuration" items 3/4 (referenced by the new hardening guide) exist and match.

## What's Good

- Every factual claim in the new prose is traceable to a real source line rather than asserted — consistent with the project's "measured, never faked" principle, applied here to documentation accuracy rather than extraction data.
- Honest about residual gaps rather than overselling: explicitly calls out that the SSRF guard only validates the initial URL (not redirects/subresource requests), that the rate limiter is per-process with no shared store, and that `X-Forwarded-For` is spoofable without a trusted proxy in front. This matches the codebase's existing convention of documenting `provenance`/limitations rather than glossing over them.
- The layered threat-model structure (built-in guard → network egress restriction → auth fronting) gives operators a coherent mental model instead of a disconnected list of flags.
- PRD changes are minimal and surgical — flips completed items from open risks/TODOs to shipped mitigations without rewriting unrelated sections.

## Recommendation

Ready to merge as-is. No code changes needed. Optional: since ESLint isn't configured in this repo at all (not just failing to run), consider a separate follow-up chore to either configure it or remove `npm run lint` from documented workflows — orthogonal to this PR.
