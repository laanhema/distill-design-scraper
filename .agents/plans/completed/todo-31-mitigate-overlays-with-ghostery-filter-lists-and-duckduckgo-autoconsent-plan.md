# Plan: Mitigate Overlays with Ghostery Filter Lists and DuckDuckGo Autoconsent

## Summary

Today Distill captures live URLs behind cookie walls and consent overlays because the simple button-clicking heuristic in `dismissConsentBanner` (`lib/ingest.ts:104`) misses buttons inside cross-origin iframes (such as Sourcepoint on news sites) and non-English phrasing (such as Nordic or German consent managers). Following the spike recommendations in `.agents/reports/overlay-mitigation-spike.md` (§3, §4, §6), this plan adds two layered defenses: (1) a prevention layer using Ghostery's adblocker engine (`@ghostery/adblocker-playwright`) with cookie and annoyance filter lists, cached and serialized on disk for sub-30ms startup, which registers network blocking and persistent cosmetic `display:none` rules across all screenshot and panorama passes; and (2) a consent layer using DuckDuckGo's autoconsent standalone bundle (`@duckduckgo/autoconsent`), injected before navigation via `page.addInitScript`, which automatically negotiates opt-out consent flows across top frames and nested iframes alike. Applied filter lists and consent actions are recorded as `Mitigation` entries in `CaptureAccess.mitigations`, maintaining honest provenance without altering existing offline eval baselines.

**Decision: Cookie and annoyance filter list selection (§3 Option A).** The blocker engine loads Ghostery's EasyList Cookie list (`easylist-cookie.txt`), uBlock Origin cookie annoyances (`annoyances-cookies.txt`), and uBlock Origin other annoyances (`annoyances-others.txt`). General ad lists are excluded to prevent accidental stripping of genuine page components (e.g. hero promotional banners or sponsor badges).

**Decision: Disk serialization with runtime fetch fallback (§3 Option A & §6.3).** The uBO lists carry a GPLv3 license while Distill is MIT; downloading at runtime and caching serialized binary engines on disk (`node_modules/.cache/distill/filters.bin`) avoids repository licensing complications. Serialized loading takes ~23ms (vs 1.2s cold parsing). If the network is unreachable and no cache exists, the engine gracefully falls back to `PlaywrightBlocker.empty()` with a logged warning so URL rendering never crashes offline.

**Decision: Navigation wait loop with short timeout cap (§4 & §6.2).** Following `page.goto` and `networkidle`, the orchestrator checks for `autoconsentDone` or early exit when no CMP is detected, bounded by a strict 1500ms cap. On sites without consent managers, the check completes in under 1s, preventing request stalling.

Every `file:line` in this plan is a line of HEAD `24496f4`, before any change is made.

## User Story

As a design system analyst,
I want Distill to mitigate cookie banners and consent overlays using Ghostery filter lists and DuckDuckGo autoconsent,
So that screenshots and extracted design tokens accurately capture the underlying page layout and colors rather than obscuring dialogs and backdrop grays.

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT |
| Complexity | MEDIUM |
| Systems Affected | `package.json`, `lib/ingest.ts`, `lib/mitigation/engine.ts`, `lib/mitigation/consent.ts`, `lib/mitigation/index.ts` |
| GitHub Issue | #227 ([TODO-31], `TODO.md`) |
| PRD Phase | Phase 9 — Workbench UI Polish & Overlay Mitigation |
| Prototype Patch | N/A |

---

## Environment Findings

| Probe | Result |
|-------|--------|
| `npm run check` baseline on HEAD (`24496f4`) | Green: typecheck passed, lint passed, build passed, eval 5/5 passed at 100% aggregate |
| Dependency availability | `@ghostery/adblocker-playwright` (v2.20.3, MPL-2.0) and `@duckduckgo/autoconsent` (v17.2.0, MPL-2.0) install cleanly with zero peer dependency conflicts |
| Autoconsent standalone bundle | Bundled at `node_modules/@duckduckgo/autoconsent/dist/autoconsent.standalone.js` (~670 KB). Self-contained with compact rules and tier-2 heuristics; runs in main frame and iframes via `page.addInitScript` |
| Autoconsent console signaling | Autoconsent logs `autoconsent opt-out result: <cmp> true`, `autoconsent done: <cmp>`, and `no CMP found` to `console.log`. Playwright's `page.on("console")` intercepts these synchronously from all frames |
| Serialized filter cache probe | Cold parse from lists: ~1.2s; deserialization from binary cache file (`deserialize`): ~23ms (30x faster) |
| Offline / eval isolation | Offline eval replays frozen `capture.json` fixtures via `extractFromCapture`; neither Ghostery nor Autoconsent touches the offline eval path |

---

## Patterns to Follow

### Mitigation and CaptureAccess Discriminated Unions

```ts
// SOURCE: lib/schema.ts:18-37
export const mitigationSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("consent"),
    cmp: z.string(),
    action: z.enum(["optOut", "optIn"]),
  }),
  z.object({
    kind: z.literal("filterLists"),
    lists: z.array(z.string()),
  }),
  z.object({
    kind: z.literal("overlayHidden"),
    descriptor: z.string(),
    rule: z.enum(["fullCover", "floatingPanel", "dialog", "escape"]),
  }),
  z.object({
    kind: z.literal("scrollUnlocked"),
  }),
]);
export type Mitigation = z.infer<typeof mitigationSchema>;
```

### Ingestion Navigation Lifecycle

```ts
// SOURCE: lib/ingest.ts:507-522
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport,
      userAgent: USER_AGENT,
      deviceScaleFactor: 1,
      // Explicit, not the OS/CI default: the dark-scheme pass needs a known
      // light baseline to be a second sample.
      colorScheme: "light",
    });
    const page = await context.newPage();
```

### Access Rendering in Markdown Body

```ts
// SOURCE: lib/emit.ts:100-118
  if (mitigations.length > 0) {
    const mitSummaries = mitigations.map((m) => {
      switch (m.kind) {
        case "consent":
          return `opting out of the ${m.cmp} consent banner`;
        case "overlayHidden":
          return `hiding overlay (${m.descriptor})`;
        case "scrollUnlocked":
          return "unlocking scroll";
        case "filterLists":
          return "applying filter lists";
      }
    });
    if (parts.length > 0) {
      parts.push(`after ${mitSummaries.join("; ")}`);
    } else {
      parts.push(`Captured after ${mitSummaries.join("; ")}`);
    }
  }
```

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `package.json` | UPDATE | Add `@ghostery/adblocker-playwright` and `@duckduckgo/autoconsent` to dependencies |
| `lib/mitigation/engine.ts` | CREATE | Ghostery blocker singleton, filter list fetching with retries, disk serialization/caching, and fallback |
| `lib/mitigation/consent.ts` | CREATE | Autoconsent standalone bundle loading, `addInitScript` injection, console message tracking, and wait loop |
| `lib/mitigation/index.ts` | CREATE | Module entrypoint re-exporting page preparation and mitigation collection helpers |
| `lib/ingest.ts` | UPDATE | Wire blocker and autoconsent into `renderUrl` before and after navigation; pass mitigations into `capturePage` and `CaptureAccess` |

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Add `@ghostery/adblocker-playwright` and `@duckduckgo/autoconsent` to `package.json`

- **File**: `package.json`
- **Action**: UPDATE
- **Implement**:
  1. Add `@ghostery/adblocker-playwright` (`^2.20.3`) and `@duckduckgo/autoconsent` (`^17.2.0`) to `dependencies`.
  2. Run `npm install` to update `package-lock.json` and install into `node_modules`.
- **Mirror**: `package.json:21-30` (dependencies section).
- **Validate**: `npm run typecheck`

### Task 2: Implement Ghostery Blocker Engine in `lib/mitigation/engine.ts`

- **File**: `lib/mitigation/engine.ts`
- **Action**: CREATE
- **Implement**:
  1. Define `COOKIE_FILTER_LIST_URLS`:
     - `https://raw.githubusercontent.com/ghostery/adblocker/master/packages/adblocker/assets/easylist/easylist-cookie.txt`
     - `https://raw.githubusercontent.com/ghostery/adblocker/master/packages/adblocker/assets/ublock-origin/annoyances-cookies.txt`
     - `https://raw.githubusercontent.com/ghostery/adblocker/master/packages/adblocker/assets/ublock-origin/annoyances-others.txt`
  2. Export `APPLIED_FILTER_LISTS = ["easylist-cookie", "annoyances-cookies", "annoyances-others"]`.
  3. Determine cache path: `process.env.DISTILL_FILTER_CACHE_PATH || path.join(process.cwd(), "node_modules/.cache/distill/filters.bin")`. Ensure parent directory exists.
  4. Implement `fetchWithRetry(fetchImpl, url)` with 3 retries and 500ms delay.
  5. Implement `initBlocker(): Promise<PlaywrightBlocker>` using `PlaywrightBlocker.fromLists(customFetch, COOKIE_FILTER_LIST_URLS, {}, caching)` where `caching` reads/writes binary buffer to the cache path.
  6. If fetching or deserializing throws (e.g. offline with empty cache), log `console.warn("Failed to initialize Ghostery filter engine, falling back to empty blocker:", err)` and return `PlaywrightBlocker.empty()`.
  7. Store the in-flight or resolved blocker promise in a module-scoped variable `let blockerPromise: Promise<PlaywrightBlocker> | null = null;`. Export `getBlocker(): Promise<PlaywrightBlocker>`.
- **Mirror**: `lib/cache.ts:24-34` (module singleton caching) and `lib/extract/styleDump.ts:110-145` (retry/timeout logging pattern).
- **Validate**: `npm run typecheck`

### Task 3: Implement Autoconsent Bundle and Tracking in `lib/mitigation/consent.ts`

- **File**: `lib/mitigation/consent.ts`
- **Action**: CREATE
- **Implement**:
  1. Load the autoconsent bundle once from `require.resolve("@duckduckgo/autoconsent/dist/autoconsent.standalone.js")` and cache the string in memory.
  2. Define `AutoconsentTracker`:
     ```ts
     export interface AutoconsentTracker {
       detectedCmp: string | null;
       action: "optOut" | "optIn";
       isDone: boolean;
       noCmp: boolean;
     }
     ```
  3. Implement `setupAutoconsent(page: Page): Promise<AutoconsentTracker>`:
     - Register `page.on("console", (msg) => { ... })`:
       - Match `autoconsent opt-out result:\s*([^\s]+)` -> set `tracker.detectedCmp = match[1]`, `tracker.action = "optOut"`.
       - Match `autoconsent opt-in result:\s*([^\s]+)` -> set `tracker.detectedCmp = match[1]`, `tracker.action = "optIn"`.
       - Match `autoconsent done:` -> set `tracker.isDone = true`.
       - Match `no CMP found` -> set `tracker.noCmp = true`.
     - Inject bundle into page before navigation via `await page.addInitScript({ content: bundleText })`.
     - Return the tracker.
  4. Implement `waitForAutoconsent(page: Page, tracker: AutoconsentTracker, timeoutCapMs = 1500): Promise<Mitigation | null>`:
     - Poll in 50ms intervals until `tracker.isDone || tracker.noCmp || Date.now() - start >= timeoutCapMs`.
     - Early exit optimization: after 500ms, inspect `page.evaluate(() => window.autoconsentStandalone?.messages)`: if no CMP was detected, exit early.
     - If `tracker.detectedCmp`: return `{ kind: "consent", cmp: tracker.detectedCmp, action: tracker.action }`. Otherwise return `null`.
- **Mirror**: `lib/ingest.ts:104-116` (short-timeout polling pattern).
- **Validate**: `npm run typecheck`

### Task 4: Export Mitigation API in `lib/mitigation/index.ts`

- **File**: `lib/mitigation/index.ts`
- **Action**: CREATE
- **Implement**:
  1. Implement `preparePageForMitigation(page: Page): Promise<{ tracker: AutoconsentTracker }>`:
     - Retrieve `blocker = await getBlocker()`.
     - Enable blocker in page: `await blocker.enableBlockingInPage(page)`.
     - Setup autoconsent: `const tracker = await setupAutoconsent(page)`.
     - Return `{ tracker }`.
  2. Implement `collectMitigations(page: Page, tracker: AutoconsentTracker): Promise<Mitigation[]>`:
     - `const mitigations: Mitigation[] = [{ kind: "filterLists", lists: APPLIED_FILTER_LISTS }];`
     - `const consentMitigation = await waitForAutoconsent(page, tracker);`
     - If `consentMitigation`: `mitigations.push(consentMitigation);`
     - Return `mitigations`.
  3. Re-export all necessary types and functions.
- **Mirror**: `lib/extract/structure/index.ts:1-20` (barrel exporter pattern).
- **Validate**: `npm run typecheck`

### Task 5: Wire Prevention and Consent Layers into `lib/ingest.ts`

- **File**: `lib/ingest.ts`
- **Action**: UPDATE
- **Implement**:
  1. Import `preparePageForMitigation` and `collectMitigations` from `@/lib/mitigation`.
  2. In `renderUrl`:
     - After creating `page` and setting up redirect listeners, before `page.goto`:
       `const { tracker } = await preparePageForMitigation(page);`
     - After `goto` and `waitForLoadState("networkidle")`:
       `const mitigations = await collectMitigations(page, tracker);`
     - Pass `mitigations` into `capturePage(page, { mitigations })`.
  3. In `capturePage(page: Page, options?: { mitigations?: Mitigation[] })`:
     - Accept optional `options?: { mitigations?: Mitigation[] }`.
     - Default `mitigations = options?.mitigations ?? []`.
     - When measuring obstruction via `measureObstruction(page, "viewport")`:
       Construct `access: CaptureAccess`:
       - If `obstruction`: `{ state: "obstructed", mitigations, obstructions: [obstruction] }`.
       - If no obstruction: `{ state: "clear", mitigations }`.
- **Mirror**: `lib/ingest.ts:456-460` (`measureObstruction` and `access` construction) and `lib/ingest.ts:516-558` (`renderUrl` setup sequence).
- **Validate**: `npm run typecheck`

### Task 6: Run Full Verification Suite

- **File**: `package.json`, `lib/mitigation/*`, `lib/ingest.ts`
- **Action**: CHECK
- **Implement**:
  1. Run `npm run typecheck` to verify TypeScript contracts across all modified files.
  2. Run `npm run lint` to ensure code style and eslint rules are satisfied.
  3. Run `npm run eval` to verify offline eval gate remains at 100% aggregate pass across all 5 corpus fixtures.
  4. Run `npm run build` to verify Next.js production build succeeds.
  5. Run `npm run check` to verify the combined pipeline passes.
- **Mirror**: `package.json:14` (`check: npm run typecheck && npm run lint && npm run build && npm run eval`).
- **Validate**: `npm run check`

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Build
npm run build

# Offline Eval (regression gate)
npm run eval

# Full CI Check Suite
npm run check
```

## End-to-End Verification

1. **Synthetic Cookie Banner Dismissal & Mitigation Record**:
   - Spin up a local HTTP server serving a page with a consent banner (e.g. `c-cookie-notice` with reject button).
   - In a scratch script run with `npx tsx` and `SSRF_ALLOWLIST_HOSTS=localhost`, call `renderUrl("http://localhost:<port>/")`.
   - Verify the returned `RenderResult`:
     - `result.access.state === "clear"`.
     - `result.access.mitigations` contains `{ kind: "filterLists", lists: [...] }` and `{ kind: "consent", action: "optOut", cmp: ... }`.
     - `result.viewportShot` shows no cookie banner.
   - Delete scratch script after verification.

2. **Clean Page Without CMP**:
   - In the scratch script, call `renderUrl` on a simple page with no cookie banner or CMP.
   - Verify:
     - Navigation completes without stalling (wait loop terminates in under 1s).
     - `result.access.state === "clear"`.
     - `result.access.mitigations` contains `{ kind: "filterLists" }` but no `"consent"` mitigation.
   - Delete scratch script after verification.

3. **Offline Eval Invariant**:
   - Run `npm run eval`.
   - Verify all 5 corpus fixtures score 100% aggregate with ΔE 0.0, proving zero regression on existing captures.

## Risks

| Risk | Mitigation | In / Out of Scope |
|------|------------|-------------------|
| Remote filter-list download fails or times out when cold | `fetchWithRetry` retries 3 times; if network is down and disk cache is absent, `initBlocker` catches error, logs a warning, and falls back to `PlaywrightBlocker.empty()` so renders proceed | In Scope |
| Filter engine parsing delays request on cold start | Disk cache stores serialized engine binary (`filters.bin`). Subsequent starts load in ~23ms via `deserialize`. Engine promise is held in memory as per-process singleton | In Scope |
| Autoconsent search delays clean pages without CMP | The wait loop checks whether any CMP was detected and caps wait time at 1500ms; clean pages exit in < 1s | In Scope |
| Dynamic/late-appearing modals or scroll-locked backdrops not caught by filter lists or autoconsent | Multi-tile rechecks and heuristic fallback (Escape, dialog.close, hiding >60% fixed layers) are explicitly scheduled for follow-up issue TODO-32 (#228) | Out of Scope (TODO-32) |

## Open Questions

- **Filter lists selection**: The issue specifies "cookie and annoyance filter lists". We propose EasyList Cookie list (`easylist-cookie.txt`), uBO cookie annoyances (`annoyances-cookies.txt`), and uBO other annoyances (`annoyances-others.txt`). Proposed default: use these three lists, which specifically target overlays and consent bars without stripping normal website content.
- **Timeout cap value**: The issue specifies a "short timeout cap". We propose 1500ms as default (with optional override via `AUTOCONSENT_TIMEOUT_MS` environment variable), which accommodates slower frame hydration while remaining well under the 8s networkidle timeout.
- **Cache directory location**: We propose storing `filters.bin` in `node_modules/.cache/distill/` with fallback to `os.tmpdir()`. Both locations are automatically git-ignored and persist across local server reloads.

## Acceptance Criteria

- [ ] `@ghostery/adblocker-playwright` and `@duckduckgo/autoconsent` are added to dependencies in `package.json`.
- [ ] Ghostery blocker engine is initialized once per process from cached/serialized filter lists and enabled in `page` before navigation.
- [ ] Autoconsent bundle is injected via `page.addInitScript` before navigation, and waits after navigation for an `autoconsentDone` message, no-CMP result, or a short timeout cap.
- [ ] Applied filter lists and consent actions (opt-out / opt-in) are recorded as `Mitigation` entries in `CaptureAccess.mitigations`.
- [ ] Network filter-list fetching runs with retries or reads cached copies; filter engine initialization does not stall the request path.
- [ ] `npm run check` passes.
