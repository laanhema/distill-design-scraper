# Plan: Deployment Hardening Guidance (SSRF sandboxing + limits)

## Summary

Pure documentation change closing issue #4 (DIST-003). Add a "Deploying Publicly — Hardening Guide" section to `README.md` that explains the SSRF risk model, points at the built-in guard (#2/DIST-001) and rate limiter (#3/DIST-002) already documented in Setup §3/§4, adds guidance on fronting the API with auth, and provides a concrete Docker egress-restriction example (blocking RFC1918 + link-local metadata endpoints like `169.254.169.254`). Then update PRD §9 (and the §12 Phase 4 checklist + §14 risk row it feeds) to reflect that SSRF guarding and rate limiting actually shipped and are no longer "out of scope".

**Placement decision**: the issue offers "README (or `docs/deployment.md`)" and says to pick whichever the README's structure suggests. The README is a single flat file that *already inlines* the SSRF-guard and rate-limit documentation (Setup & Configuration §3/§4, `README.md:65-98`) — there is no `docs/` directory anywhere in the repo. So: a new README section, placed after "Running the Application" (which holds the Docker instructions the egress example extends), cross-referencing Setup §3/§4 rather than duplicating them.

## User Story

As a deployer
I want documented guidance on network-sandboxing the headless browser and fronting the API with auth/limits
So that I can run Distill publicly without relying on defaults alone

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT (documentation) |
| Complexity | LOW |
| Systems Affected | `README.md`, `.agents/PRDs/PRD.md` — no code, no eval impact |
| GitHub Issue | #4 (DIST-003) |
| Blocked by | #2, #3 — both merged (PRs #8, #9), unblocked |

---

## Patterns to Follow

### README section style
```markdown
<!-- SOURCE: README.md:100-122 — "Running the Application" -->
---

## Running the Application

### Development Server
```
Sections are `## Title` separated by `---` rules, with `###` subsections, fenced code blocks (` ```bash `, ` ```env `), and **bold lead-ins** for feature bullets. The new hardening section must match this: `---` separator, `##` heading, `###` subsections per topic.

### Existing security-doc voice (don't duplicate — cross-reference)
```markdown
<!-- SOURCE: README.md:65-73 — SSRF guard setup entry -->
3. **SSRF guard** *(built in, no configuration required)*:
   Before navigating to any submitted URL, Distill resolves its hostname via DNS and
   rejects the request if the resolved address falls in a loopback, private, or
   link-local range — `127.0.0.0/8`, …
```
Setup §3 (`README.md:65-81`) already documents the guard mechanics + `SSRF_ALLOWLIST_HOSTS`; Setup §4 (`README.md:83-98`) already documents `RATE_LIMIT_MAX_REQUESTS`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_BUCKETS`, `RATE_LIMIT_DISABLED`. The new section should *name* these env vars and link back ("see Setup & Configuration above"), not restate their full docs.

### Ground truth for technical claims
- SSRF guard behavior: `lib/security/ssrfGuard.ts:40-50` (blocked IPv4 ranges), `:98-119` (IPv6 + IPv4-mapped), `:121-132` (`SSRF_ALLOWLIST_HOSTS` parsing), `:139-171` (resolve-then-check, fail-closed).
- Rate limiter behavior: `lib/security/rateLimiter.ts:28-30` (defaults 20 req / 60 s / 50 000 buckets), `:91-108` (client ID = first `X-Forwarded-For` entry → `x-real-ip` → `"unknown"` — spoofable, which is exactly why docs must recommend a trusted reverse proxy), `:110-138` (429 + `Retry-After`).
- Known limiter gap to disclose honestly: in-memory per-process store — horizontally-scaled deployments each enforce an independent limit (`lib/security/rateLimiter.ts:1-6`). "Measured, never faked" applies to docs too: state real limitations.
- Docker context: `Dockerfile:1-33` — Playwright base image, port 3000, no network restrictions of its own.

### PRD checkbox / section style
```markdown
<!-- SOURCE: .agents/PRDs/PRD.md:249-255 — Phase 4 -->
### Phase 4 — Hardening & reach *(open, proposed)*
- [ ] SSRF/network sandboxing guidance or built-in URL allowlisting; basic rate limiting
```

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `README.md` | UPDATE | New `## Deploying Publicly — Hardening Guide` section after "Running the Application" |
| `.agents/PRDs/PRD.md` | UPDATE | §9 out-of-scope list + auth bullet; §12 Phase 4 checkbox; §14 SSRF risk row |

No files created. No `lib/` change → eval harness untouched.

---

## Tasks

### Task 1: Add the hardening section to README.md

- **File**: `README.md`
- **Action**: UPDATE
- **Implement**: Insert a new section between "Running the Application" (ends `README.md:121`) and "Scripts & CLI Commands", following the `---` + `##` pattern. Content, as `###` subsections:
  1. **Threat model** (~1 short paragraph): Distill navigates a real headless Chromium to arbitrary user-submitted URLs — the classic SSRF surface. A malicious URL could target the operator's internal network or cloud metadata endpoints (e.g. `169.254.169.254` on AWS/GCP/Azure). Defense-in-depth framing: built-in guard first, network sandboxing second, auth/limits at the edge third.
  2. **Layer 1 — built-in protections**: name the SSRF guard (DNS-resolve-then-check, fail-closed, `SSRF_ALLOWLIST_HOSTS` opt-out) and the rate limiter (`RATE_LIMIT_*` env vars, 429 + `Retry-After`), each as a 2–3 line summary with "full details in Setup & Configuration above". Honestly note the limiter is in-memory per-process — multi-instance deployments need edge-level limiting for a global cap.
  3. **Layer 2 — network-restrict the container** (satisfies AC 2): explain why the built-in guard alone isn't sufficient (guard checks the *initial* URL; the rendered page's own subresource requests, redirects after navigation, and JS-initiated fetches ride the browser and are not re-checked), then give a concrete example. Recommended example shape — an `iptables` `DOCKER-USER` rule set on the Docker host blocking container egress to the guard's same ranges:
     ```bash
     # Block container egress to cloud metadata + private ranges (DOCKER-USER
     # chain is consulted for all traffic leaving Docker networks):
     iptables -I DOCKER-USER -d 169.254.0.0/16 -j DROP   # link-local incl. 169.254.169.254 metadata
     iptables -I DOCKER-USER -d 10.0.0.0/8     -j DROP
     iptables -I DOCKER-USER -d 172.16.0.0/12  -j DROP
     iptables -I DOCKER-USER -d 192.168.0.0/16 -j DROP
     ```
     Plus a one-line note that an internal network + egress proxy, or cloud-native egress firewalls (security groups / VPC firewall rules), achieve the same and that allowlisted internal hosts (`SSRF_ALLOWLIST_HOSTS`) need corresponding holes.
  4. **Layer 3 — front the API** (satisfies the user-story "auth/limits" clause): the API is unauthenticated by design; before public exposure put a reverse proxy (nginx/Caddy/Cloudflare) in front providing auth (basic auth, OAuth proxy, or API keys) and TLS. Note the limiter trusts `X-Forwarded-For` — accurate per-client limits require a trusted proxy that sets/overwrites that header; direct-exposed deployments let clients spoof their ID.
- **Mirror**: `README.md:100-122` — section structure; `README.md:65-98` — tone for security content.
- **Validate**: manual read-through; every technical claim traceable to `lib/security/*.ts` or `Dockerfile` (sources pinned in Patterns above).

### Task 2: Update PRD §9 to reflect shipped Phase 4 work (AC 3)

- **File**: `.agents/PRDs/PRD.md`
- **Action**: UPDATE
- **Implement**:
  - §9 **Authentication bullet** (`PRD.md:169`): keep "no auth by design", but drop the now-stale "must add their own … rate-limiting" — rate limiting is built in; auth-fronting remains the deployer's job (point to the new README section).
  - §9 **In-scope security posture** (`PRD.md:171-174`): add bullets for the SSRF guard (resolve-then-check, blocked ranges, `SSRF_ALLOWLIST_HOSTS`) and per-client rate limiting (`RATE_LIMIT_*` env vars, bounded bucket store).
  - §9 **Out of scope** (`PRD.md:175`): remove "SSRF hardening of arbitrary-URL fetching" and "rate limiting"; keep user accounts + secrets management; add the honest residuals: shared rate-limit store for multi-instance deployments, and post-navigation egress control (subresource/redirect traffic — mitigated by documented network sandboxing, not code).
- **Mirror**: existing §9 bullet style (`PRD.md:167-176`).
- **Validate**: §9 no longer contradicts merged #8/#9 behavior.

### Task 3: Update PRD §12 Phase 4 checklist and §14 risk row

- **File**: `.agents/PRDs/PRD.md`
- **Action**: UPDATE
- **Implement**:
  - §12 Phase 4 (`PRD.md:251`): tick the first item and reword to what actually shipped: built-in SSRF guard + allowlist env var, per-client rate limiting, and deployment-hardening docs (this issue). Leave the other three Phase 4 items unticked.
  - §14 SSRF risk row (`PRD.md:273`): mitigation currently reads "Documented as out-of-scope for MVP (§9); Phase 4 hardening; deploy behind network-restricted sandbox" — replace with the shipped reality: built-in resolve-then-check guard + allowlist; README hardening guide with egress-restriction example.
- **Mirror**: `PRD.md:233-247` — delivered-phase checkbox phrasing (`[x]` items are terse noun phrases).
- **Validate**: no `[ ]` item in §12 describes already-merged work; §14 doesn't call shipped mitigations "out of scope".

---

## Validation

```bash
# Docs-only change, but project git policy requires these after any task:
npm run lint
npm run typecheck

# Explicitly NOT needed (no lib/ change): npm run eval
```

Manual checks:
- README renders correctly (heading levels, fenced blocks) — `##`/`###` hierarchy consistent with rest of file.
- Every env var named in the new section exists in code: `SSRF_ALLOWLIST_HOSTS` (`lib/security/ssrfGuard.ts:125`), `RATE_LIMIT_MAX_REQUESTS` / `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX_BUCKETS` / `RATE_LIMIT_DISABLED` (`lib/security/rateLimiter.ts:40,122-124`).
- Blocked ranges listed in the iptables example match `BLOCKED_IPV4_RANGES` (`lib/security/ssrfGuard.ts:41-50`).

## Acceptance Criteria

- [ ] AC 1 — README explains SSRF risk model, the built-in guard + `SSRF_ALLOWLIST_HOSTS`, and the `RATE_LIMIT_*` env vars (new section + existing Setup §3/§4 cross-refs)
- [ ] AC 2 — Docker deployment path includes a concrete network-restriction example blocking link-local metadata endpoints
- [ ] AC 3 — PRD §9 updated to reflect what Phase 4 actually shipped (plus §12/§14 consistency)
- [ ] `npm run lint` and `npm run typecheck` pass
- [ ] No code files touched; eval baseline untouched
