# Plan: Measure Viewport Obstruction and Model CaptureAccess

## Summary

Distill does not measure whether a captured page is obstructed by an overlay, cookie banner, or modal backdrop, which can silently spoil extracted palettes (e.g. dimming backdrop grays) and introduce false recipe variants. Following the spike recommendations in `.agents/reports/overlay-mitigation-spike.md` (§4 and §6), this plan defines the `CaptureAccess` discriminated union in `lib/schema.ts` (modeling `clear`, `obstructed`, and `blocked` states honestly without representing illegal states), threads `access` through `CaptureArtifacts`, `RenderResult`, `Capture`, and analysis metadata in `lib/analyze.ts`, implements `measureObstruction` in `lib/ingest.ts` (using a 24×15 grid sample with `elementFromPoint`, shadow DOM descent, landmark/short-header exclusions, center hit-testing for visible dialogs/modals, and `html`/`body` scroll-lock checks), and renders capture condition notes in frontmatter and the markdown body in `lib/emit.ts`. Existing eval corpus captures replay unchanged without requiring `access` (strictly additive by construction).

**Decision: Exclude landmarks and short top banners (§4 Run 2).** Fixed layers matching landmarks (`header`, `nav`, `[role=banner]`, `[role=navigation]`) or containing them are excluded from obstruction coverage. Top-anchored fixed layers starting at the top of the viewport (`rect.top <= 1`, `rect.left <= 5`, `rect.width >= 0.5 * vw`) shorter than 20% of viewport height (`rect.height < 0.20 * vh`) count as headers and are also excluded.

**Decision: Center hit-test verification for dialogs and modals (§4).** `[aria-modal="true"]` and `dialog[open]` elements contribute to obstruction only if a hit test at their center coordinates confirms they are actually visible and unobstructed.

**Decision: Condition notes in body and frontmatter (§6).** Frontmatter includes `capture: { access: ... }` and the markdown body renders a summary condition note line (e.g. `_Captured with 20% viewport obstruction (culprit: div#cookie-banner)._`) only when mitigations or obstructions are present (`access.state === "obstructed" || access.state === "blocked" || access.mitigations.length > 0`). When capture access is clean with no mitigations, condition notes are omitted, keeping reports concise and backwards-compatible with frozen captures.

Every `file:line` in this plan is a line of HEAD `993d229`, before the prototype patch is applied.

## User Story

As a design system analyst,
I want Distill to measure viewport obstruction and model capture accessibility state,
So that overlays, consent dialogs, and scroll locks are honestly measured and reported rather than silently distorting design tokens.

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT |
| Complexity | MEDIUM |
| Systems Affected | `lib/schema.ts`, `lib/ingest.ts`, `lib/analyze.ts`, `lib/emit.ts`, `lib/api.ts` |
| GitHub Issue | #226 ([TODO-30], `TODO.md`) |
| PRD Phase | Phase 9 — Workbench UI Polish & Overlay Mitigation |
| Prototype Patch | `.agents/plans/todo-30-measure-viewport-obstruction-and-model-captureaccess-prototype.patch` |

---

## Environment Findings

| Probe | Result |
|-------|--------|
| `npm run check` baseline on HEAD (`993d229`) | Green: typecheck passed, lint passed, build passed, eval 5/5 passed at 100% aggregate |
| Committed captures access field | None of the 5 corpus captures (`clean-light`, `dark-mode`, `adversarial-shell`, `saas-landing`, `two-scheme`) contain an `access` field. All replay offline via `extractFromCapture` |
| Dry run of scratch check on HEAD | `Error: measureObstruction missing on HEAD` (exit 1), provably failing before the change |
| Playwright 24×15 grid sample execution | 360 points across viewport. Sample intervals: `x = (c + 0.5) * (vw / 24)`, `y = (r + 0.5) * (vh / 15)`. Evaluates in page context via `page.evaluate` |
| `tsx` compiler `__name` rewriting | esbuild in `tsx` injects `__name` into named functions inside `page.evaluate`. Defensive `(globalThis as any).__name = (globalThis as any).__name || ((fn: any) => fn)` prevents runtime errors |
| Prototype in scratch worktree | Patch created and verified: `npm run typecheck`, `npm run lint`, and `npm run eval` all pass with 0 errors |
| Synthetic fixture probe | Clean page: `null`. Fixed header (60px): `null`. Cookie banner (180px bottom): `coverage: 0.2`, `culprit: "div#cookie-banner"`. Scroll lock: `scrollLocked: true`. Dialog: `coverage: 0.194`, `culprit: "dialog"` |

---

## Patterns to Follow

### Schema Discriminated Union and Optional Section Propagation

```ts
// SOURCE: lib/schema.ts:10-12
export const PROVENANCE = ["measured", "inferred", "ai"] as const;
export const provenanceSchema = z.enum(PROVENANCE);
```

```ts
// SOURCE: lib/schema.ts:267-276
  paletteDark: paletteSchema.optional(),
  typography: typographySchema.optional(),
  spacing: spacingSchema.optional(),
  radius: radiusSchema.optional(),
  elevation: elevationSchema.optional(),
  recipes: recipesSchema.optional(),
  states: statesSchema.optional(),
  motion: motionSchema.optional(),
```

### In-page Evaluation in Playwright

```ts
// SOURCE: lib/ingest.ts:121-132
async function measureHeadingSizesPx(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const sizes: Record<string, number> = {};
    for (const tag of ["h1", "h2"]) {
      const el = document.querySelector(tag);
      if (!el) continue;
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (Number.isFinite(px)) sizes[tag] = px;
    }
    return sizes;
  });
}
```

### Report Building with Derived Markdown Emit

```ts
// SOURCE: lib/emit.ts:41-57
export function buildReport(input: BuildReportInput): Report {
  const candidate: Report = {
    reportKind: input.reportKind,
    source: input.source,
    palette: input.palette,
    ...(input.paletteDark ? { paletteDark: input.paletteDark } : {}),
    ...(input.typography ? { typography: input.typography } : {}),
    ...(input.spacing ? { spacing: input.spacing } : {}),
    ...(input.radius ? { radius: input.radius } : {}),
    ...(input.elevation ? { elevation: input.elevation } : {}),
    ...(input.recipes ? { recipes: input.recipes } : {}),
    ...(input.states ? { states: input.states } : {}),
    ...(input.motion ? { motion: input.motion } : {}),
    ...(input.identity ? { identity: input.identity } : {}),
    ...(input.imageMood ? { imageMood: input.imageMood } : {}),
  };
  return reportSchema.parse(candidate);
}
```

---

## Files to Change

| File | Action | Purpose | Covered by Patch |
|------|--------|---------|------------------|
| `lib/schema.ts` | UPDATE | Define `Mitigation`, `Obstruction`, and `CaptureAccess` discriminated union schemas; add optional `capture` section to `reportSchema` | Yes |
| `lib/api.ts` | UPDATE | Add optional `access?: CaptureAccess` to `AnalyzeMeta` contract | Yes |
| `lib/ingest.ts` | UPDATE | Add `access?: CaptureAccess` to `CaptureArtifacts`; implement `measureObstruction`; invoke before screenshots in `capturePage` | Yes |
| `lib/analyze.ts` | UPDATE | Thread `access` through `Capture`, pass to `buildReport` in `extractFromCapture`, and include in `meta` in `analyzeUrl` | Yes |
| `lib/emit.ts` | UPDATE | Accept `capture?: { access?: CaptureAccess }` in `BuildReportInput`; conditionally populate `capture` when condition present; render note in `renderBody` | Yes |

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Define `CaptureAccess`, `Mitigation`, and `Obstruction` Schemas in `lib/schema.ts`

- **File**: `lib/schema.ts`
- **Action**: UPDATE
- **Implement**:
  1. Define `mitigationSchema` using `z.discriminatedUnion("kind", [...])` supporting:
     - `{ kind: "consent", cmp: string, action: "optOut" | "optIn" }`
     - `{ kind: "filterLists", lists: string[] }`
     - `{ kind: "overlayHidden", descriptor: string, rule: "fullCover" | "floatingPanel" | "dialog" | "escape" }`
     - `{ kind: "scrollUnlocked" }`
     Export type `Mitigation = z.infer<typeof mitigationSchema>`.
  2. Define `obstructionSchema` with `coverage: z.number().min(0).max(1)`, `scrollLocked: z.boolean()`, `culprit: z.string().optional()`, `at: z.string()`. Export type `Obstruction = z.infer<typeof obstructionSchema>`.
  3. Define `captureAccessSchema` using `z.discriminatedUnion("state", [...])` supporting:
     - `{ state: "clear", mitigations: Mitigation[] }`
     - `{ state: "obstructed", mitigations: Mitigation[], obstructions: Obstruction[] }`
     - `{ state: "blocked", reason: string, status?: number }`
     Export type `CaptureAccess = z.infer<typeof captureAccessSchema>`.
  4. Add optional `capture: z.object({ access: captureAccessSchema.optional() }).optional()` to `reportSchema`.
- **Mirror**: `lib/schema.ts:10-12` (enum and schema declarations), `lib/schema.ts:254-282` (`reportSchema`).
- **Validate**: `npm run typecheck`

### Task 2: Thread `access` into API Metadata in `lib/api.ts`

- **File**: `lib/api.ts`
- **Action**: UPDATE
- **Implement**:
  1. Import `CaptureAccess` from `@/lib/schema`.
  2. Add optional `access?: CaptureAccess` to `AnalyzeMeta`.
- **Mirror**: `lib/api.ts:13-24` (`AnalyzeMeta` interface definition).
- **Validate**: `npm run typecheck`

### Task 3: Implement `measureObstruction` and Integrate into `capturePage` in `lib/ingest.ts`

- **File**: `lib/ingest.ts`
- **Action**: UPDATE
- **Implement**:
  1. Import `CaptureAccess` and `Obstruction` from `@/lib/schema`.
  2. Add `access?: CaptureAccess` to `CaptureArtifacts`.
  3. Export `measureObstruction(page: Page, at: "viewport" | "dark" | string = "viewport"): Promise<Obstruction | null>`:
     - Inside `page.evaluate`, set `(globalThis as any).__name = (globalThis as any).__name || ((fn: any) => fn)` defensively.
     - Check `overflow === "hidden" || overflowY === "hidden"` on `html` and `body` to set `scrollLocked`.
     - Check visible `dialog[open]` and `[aria-modal="true"]` elements, verifying visibility via center hit testing with `elementFromPoint` descending through shadow roots.
     - Sample the 24×15 grid (`360` points). For each point:
       - Find hit element descending shadow roots.
       - Exclude landmarks (`header`, `nav`, `[role=banner]`, `[role=navigation]`).
       - If inside a confirmed visible dialog/modal, count as obstructed.
       - Otherwise, find the outermost `position: fixed` ancestor. If present:
         - Check if it is a landmark (exclude).
         - Check if it is top-anchored (`rect.top <= 1`, `rect.left <= 5`, `rect.width >= vw * 0.5`) and shorter than 20% viewport height (`rect.height < 0.20 * vh`) (exclude as header).
         - Otherwise, count as obstructed and record culprit descriptor (`tag#id` or `tag.class` or `tag`).
     - Calculate coverage `Math.round((coveredPoints / 360) * 1000) / 1000`.
     - If `coverage === 0 && !scrollLocked`, return `null`.
     - Otherwise return `{ coverage, scrollLocked, culprit: topCulprit, at: atParam }`.
  4. In `capturePage`:
     - After scroll reset and before screenshots, call `measureObstruction(page, "viewport")`.
     - Set `access: obstruction ? { state: "obstructed", mitigations: [], obstructions: [obstruction] } : { state: "clear", mitigations: [] }`.
     - Return `access` in the `CaptureArtifacts` result.
- **Mirror**: `lib/ingest.ts:121-132` (DOM evaluation in page context), `lib/ingest.ts:263-312` (`capturePage`).
- **Validate**: `npm run typecheck && npm run lint`

### Task 4: Thread `access` through Orchestration in `lib/analyze.ts`

- **File**: `lib/analyze.ts`
- **Action**: UPDATE
- **Implement**:
  1. In `extractFromCapture(capture: Capture)`:
     Pass `capture: capture.access ? { access: capture.access } : undefined` to `buildReport`.
  2. In `analyzeUrl`:
     Add `access?: CaptureAccess` to the return type's `meta` signature and pass `access: capture.access` in the returned `meta` object.
  3. In `analyzeImages`:
     Ensure `meta` return type matches `access?: CaptureAccess`.
- **Mirror**: `lib/analyze.ts:80-92` (`buildReport` invocation in `extractFromCapture`), `lib/analyze.ts:417-423` (`meta` assembly).
- **Validate**: `npm run typecheck && npm run lint`

### Task 5: Support Capture Access in Report Building and Markdown Emit in `lib/emit.ts`

- **File**: `lib/emit.ts`
- **Action**: UPDATE
- **Implement**:
  1. Import `CaptureAccess` from `@/lib/schema`.
  2. Add `capture?: { access?: CaptureAccess }` to `BuildReportInput`.
  3. In `buildReport`:
     Conditionally add `capture: { access: input.capture.access }` when `access` has conditions (`state === "obstructed" || state === "blocked" || (state === "clear" && mitigations.length > 0)`).
  4. Implement `renderAccessNote(access: CaptureAccess): string | undefined`:
     - Format obstruction details: `Captured with ${pct}% viewport obstruction (culprit: ${culprit}); scroll locked`.
     - Format mitigation details: `after opting out of the ${cmp} consent banner; hiding overlay (${descriptor})`.
     - If both present, combine them: `Captured with ${obstructionDesc} after ${mitigationDesc}.`.
     - Format as `_${note}_`. Return `undefined` if no condition.
  5. In `renderBody(report: Report)`:
     If `report.capture?.access`, call `renderAccessNote(report.capture.access)` and push to `parts` right under `# ${title}`.
- **Mirror**: `lib/emit.ts:41-58` (`buildReport`), `lib/emit.ts:70-95` (`renderBody`).
- **Validate**: `npm run typecheck && npm run lint && npm run eval`

### Task 6: Full Gate Verification

- **File**: `eval/run.ts`
- **Action**: CHECK
- **Implement**:
  1. Run the offline eval harness to verify existing frozen corpus captures replay 100% unchanged.
  2. Run the scratch verification script testing live Playwright obstruction measurements and schema discrimination.
  3. Run the project CI check (`npm run check`).
- **Mirror**: `package.json:14` (`check` script).
- **Validate**: `npm run check`

---

## Validation

```bash
# Type check / Build
npm run typecheck && npm run build

# Lint
npm run lint

# Regression test over measured extraction lane (offline replay)
npm run eval

# Scratch probe: exercises schema discrimination, markdown emit, and Playwright measureObstruction
npx tsx -e '
import http from "node:http";
import { chromium } from "playwright";
import { measureObstruction } from "./lib/ingest";
import { captureAccessSchema } from "./lib/schema";
import { buildReport, renderMarkdown } from "./lib/emit";

async function verify() {
  captureAccessSchema.parse({ state: "clear", mitigations: [] });
  captureAccessSchema.parse({
    state: "obstructed",
    mitigations: [],
    obstructions: [{ coverage: 0.25, scrollLocked: false, culprit: "div#banner", at: "viewport" }],
  });
  captureAccessSchema.parse({ state: "blocked", reason: "botChallenge", status: 403 });

  const dummyPalette = {
    provenance: "measured" as const,
    colors: [{ hex: "#ffffff", role: "background" as const, areaWeight: 1 }],
    contrast: [],
  };
  const repObs = buildReport({
    reportKind: "design-system",
    source: { type: "url", ref: "https://example.com", capturedAt: new Date().toISOString() },
    capture: {
      access: {
        state: "obstructed",
        mitigations: [{ kind: "consent", cmp: "OneTrust", action: "optOut" }],
        obstructions: [{ coverage: 0.2, scrollLocked: true, culprit: "div#modal", at: "viewport" }],
      },
    },
    palette: dummyPalette,
  });
  const mdObs = renderMarkdown(repObs);
  if (!mdObs.includes("capture:\n  access:")) throw new Error("Missing capture frontmatter");
  if (!mdObs.includes("Captured with 20% viewport obstruction (culprit: div#modal); scroll locked after opting out of the OneTrust consent banner.")) {
    throw new Error("Missing body access condition note");
  }

  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    if (req.url === "/clean") res.end("<!DOCTYPE html><html><body><h1>Clean</h1></body></html>");
    else if (req.url === "/header") res.end(`<!DOCTYPE html><html><body><header style="position:fixed;top:0;left:0;width:100%;height:60px;">Nav</header></body></html>`);
    else if (req.url === "/banner") res.end(`<!DOCTYPE html><html><body><div id="cookie-banner" style="position:fixed;bottom:0;left:0;width:100%;height:180px;">Banner</div></body></html>`);
    else if (req.url === "/locked") res.end(`<!DOCTYPE html><html style="overflow:hidden;"><body><h1>Locked</h1></body></html>`);
    else if (req.url === "/dialog") res.end(`<!DOCTYPE html><html><body><dialog open style="position:fixed;top:30%;left:30%;width:40%;height:40%;">Modal</dialog></body></html>`);
    else res.end("");
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  try {
    await page.goto("http://localhost:" + port + "/clean");
    if ((await measureObstruction(page, "viewport")) !== null) throw new Error("Clean not null");
    await page.goto("http://localhost:" + port + "/header");
    if ((await measureObstruction(page, "viewport")) !== null) throw new Error("Header not null");
    await page.goto("http://localhost:" + port + "/banner");
    const banner = await measureObstruction(page, "viewport");
    if (!banner || banner.coverage <= 0 || !banner.culprit?.includes("cookie-banner")) throw new Error("Banner failed");
    await page.goto("http://localhost:" + port + "/locked");
    const locked = await measureObstruction(page, "viewport");
    if (!locked || !locked.scrollLocked) throw new Error("Lock failed");
    await page.goto("http://localhost:" + port + "/dialog");
    const dialog = await measureObstruction(page, "viewport");
    if (!dialog || dialog.coverage <= 0) throw new Error("Dialog failed");
    console.log("All probe assertions passed!");
  } finally {
    await browser.close();
    server.close();
  }
}

verify().catch((e) => {
  console.error(e);
  process.exit(1);
});
'
```

---

## End-to-End Verification

1. **Replay Existing Corpus**: Run `npm run eval`. All 5 committed captures (`clean-light`, `dark-mode`, `adversarial-shell`, `saas-landing`, `two-scheme`) must pass 100% with no score change, proving that `CaptureAccess` is strictly additive and existing captures without `access` replay without regression.
2. **Schema & Markdown Verification**: Execute the probe test script above. Verify:
   - Valid `CaptureAccess` shapes (`clear`, `obstructed`, `blocked`) parse cleanly.
   - Illegal states (e.g. `blocked` with `obstructions`) are rejected by Zod.
   - Clean reports emit frontmatter and body without condition notes.
   - Obstructed reports emit `capture.access` in frontmatter and the condition note in the body.
3. **Live Measurement Verification**: The probe script spins up a local server and measures synthetic pages with headless Chromium:
   - Clean page returns `null`.
   - Fixed header (< 20% viewport height) returns `null`.
   - Cookie banner (180px bottom) returns `coverage > 0` with `culprit: "div#cookie-banner"`.
   - Scroll-locked page returns `scrollLocked: true`.
   - Open dialog returns `coverage > 0` with `culprit: "dialog"`.
4. **CI Pipeline Check**: Run `npm run check`. Confirms typecheck, eslint, next build, and eval all succeed with 0 errors.

---

## Risks

| Risk | Mitigation | In / Out of Scope |
|------|------------|-------------------|
| Fixed site navigation or sticky banners flagged as false-positive obstructions | Exclude landmark elements (`header`, `nav`, `[role=banner]`, `[role=navigation]`) and top-anchored fixed layers shorter than 20% of viewport height (`< 180px` on 900px viewport). Tested against synthetic fixed header | In-scope |
| `tsx` transpiler injects `__name` calls into `page.evaluate` causing runtime reference errors in Chromium | Defensively define `(globalThis as any).__name = (globalThis as any).__name || ((fn: any) => fn)` inside `page.evaluate` | In-scope |
| Existing eval captures regress due to missing `access` field | Model `access?: CaptureAccess` as optional across `CaptureArtifacts`, `RenderResult`, `Capture`, and `Report`. Existing captures without `access` continue to parse and evaluate identically | In-scope |
| Late-arriving overlays or multi-tile re-checks during panorama scrolling | Re-checking before each panorama tile and clearing overlays is scoped to follow-up issues TODO-31 (#227) and TODO-32 (#228). `measureObstruction` accepts `at` parameter to support future multi-tile checks | Out-of-scope for TODO-30 (handled in TODO-31 & TODO-32) |
| Active overlay dismissal and cookie blocking | Ghostery adblocker filter lists and DuckDuckGo autoconsent will be implemented in follow-up TODO-31 (#227). TODO-30 focuses strictly on measurement and schema representation without altering the page | Out-of-scope for TODO-30 (handled in TODO-31) |

---

## Open Questions

None. The schema discriminated union, grid sampling dimensions (24×15), landmark exclusions, modal hit-testing criteria, and additive capture design are fully specified by issue #226 and spike report `.agents/reports/overlay-mitigation-spike.md`.

---

## Acceptance Criteria

- [ ] `CaptureAccess` and its related types (`Mitigation`, `Obstruction`) are defined as a discriminated union in `lib/schema.ts` and threaded into `CaptureArtifacts`, `RenderResult`, `Capture`, and metadata in `lib/analyze.ts`.
- [ ] `measureObstruction` in `lib/ingest.ts` measures viewport coverage via a 24×15 grid sample with `elementFromPoint`, checking topmost fixed layers, scroll locks on `html`/`body`, and visible dialogs/modals.
- [ ] Top-anchored banners shorter than 20% of viewport height count as headers, and landmark elements (`header`, `nav`, `[role=banner]`, `[role=navigation]`) are excluded from obstruction coverage.
- [ ] Visible `[aria-modal]` or `dialog` elements count as obstructing only if a hit test at their center confirms they are visible.
- [ ] `renderMarkdown` in `lib/emit.ts` includes capture access condition notes in frontmatter and body when mitigations or obstructions are present.
- [ ] Existing eval corpus captures replay unchanged without requiring `access` (additive by construction).
- [ ] `npm run check` passes.
