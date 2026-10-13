# Plan: TODO-11: Run the two model calls of the URL path concurrently

## Summary

On the URL analysis path with an API key, `analyzeUrl` currently awaits `enrichWithAI` (`lib/analyze.ts:356`) before `app/api/analyze/route.ts:238` starts the structure lane (`extractStructureFromCapture`), whose Stage 7 (`lib/extract/structure/structureAI.ts:205`) initiates the second AI model call. Because Stage 7 labelling and its deterministic prerequisites (Stages 3–6: prune, squash, repetition, ontology) depend exclusively on the DOM harvest and viewport rather than the design tokens report, the two model calls can execute concurrently. Per GitHub issue #175 (Finding M5 in `.agents/reviews/codebase-analysis-review.md:25`), this plan splits `extractStructure` into `extractStructureThroughStage7` (Stages 3–7b) and `finalizeStructure` (Stages 8a–10), runs `enrichWithAI` and `extractStructureThroughStage7` concurrently in `analyzeUrl` via `Promise.all`, and feeds the resulting AI-enriched report into `finalizeStructure` for token linking (Stages 8a/8b) and section digest compilation. If the structure lane encounters an error, it is caught gracefully and returned as `structureUnavailableReason` while preventing cache persistence, eliminating a full model round-trip of latency without affecting report accuracy, token linking, or offline eval determinism.

## User Story

As a developer and API user
I want the URL analysis pipeline to execute token AI enrichment and structural AI labelling concurrently
So that URL analysis latency with an API key is reduced by an entire model round-trip without affecting report accuracy, token linking, or offline eval gates.

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT |
| Complexity | MEDIUM |
| Systems Affected | `lib/extract/structure/index.ts`, `lib/analyze.ts`, `app/api/analyze/route.ts`, `docs/architecture/orchestration.md`, `docs/architecture/structure-lane.md` |
| GitHub Issue | #175 (Finding M5 in `.agents/reviews/codebase-analysis-review.md:25`) |
| PRD Phase | N/A |
| Prototype Patch | `.agents/plans/todo-11-run-url-model-calls-concurrently-prototype.patch` |

---

## Environment Findings

Baseline verified on `main` at `8ef014a` before planning:

| Probe | Result |
|-------|--------|
| `npm run typecheck` | Clean (0 errors from `tsc --noEmit`) |
| `npm run lint` | Clean (0 warnings or errors from `eslint .`) |
| `npm run eval` | Aggregate combined: 100%, all gates passed (`clean-light`, `dark-mode`, `adversarial-shell`) |
| `npm run build` | Next.js 15.5.20 compiled successfully in 3.0s, 4/4 static pages generated (route `/` 5.5 kB, First Load JS 108 kB) |
| Test framework | None configured (per `AGENTS.md`). `npm run eval` is the offline correctness gate; `/verify` provides E2E verification |
| Working tree state | Clean (`## main...origin/main`) |

Start green, stay green: all validation checks and verification scenarios must remain clean upon completion.

---

## Patterns to Follow

### Concurrent Pipeline Execution with `Promise.all`

```typescript
// SOURCE: lib/analyze.ts:246-267
  const [enriched, structureOutcome] = await Promise.all([
    enrichWithAI(measuredResult, screenshotsBase64, { requested: wantsTokenEnrichment }),
    wantsStructure
      ? aiLaneAvailable()
        ? structureFromImages({
            imagesPngBase64: screenshotsBase64,
            sourceRef: ref,
            capturedAt,
          })
            .then((structureReport) => ({
              structureReport: structureReport ?? undefined,
              structureUnavailableReason: structureReport
                ? undefined
                : "Vision structure inference failed for this image.",
            }))
            .catch((err) => {
              console.warn("Image structure extraction error:", err);
              return {
                structureReport: undefined,
                structureUnavailableReason: "Vision structure inference failed for this image.",
              };
            })
```

Mirror this pattern in `analyzeUrl`: execute `enrichWithAI` and `extractStructureThroughStage7` in parallel with `Promise.all`, capturing structure errors into `structureUnavailableReason` rather than failing the whole analysis.

### Offline Deterministic Eval Contract

```typescript
// SOURCE: eval/run.ts:63-67
      const structReport = await extractStructureFromCapture(
        capture,
        undefined,
        { forceHeuristicNaming: true },
      );
```

Preserve `extractStructure` as the public composite orchestrator and `extractStructureFromCapture` as the capture-level entry point so that offline eval replaying cached captures remains 100% deterministic and offline.

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/extract/structure/index.ts` | UPDATE | Split pipeline into `extractStructureThroughStage7` (Stages 3–7b) and `finalizeStructure` (Stages 8a–10); preserve `extractStructure` as composite wrapper (covered by prototype patch) |
| `lib/analyze.ts` | UPDATE | Run `enrichWithAI` and `extractStructureThroughStage7` concurrently in `analyzeUrl` via `Promise.all`; finalize structure with enriched report and return structure outcomes (covered by prototype patch) |
| `app/api/analyze/route.ts` | UPDATE | Consume `structureReport` and `structureUnavailableReason` directly from `analyzeUrl`, remove sequential extraction call and redundant import (covered by prototype patch) |
| `docs/architecture/orchestration.md` | UPDATE | Document concurrent model execution on URL path in orchestration entry points |
| `docs/architecture/structure-lane.md` | UPDATE | Document the Stage 7 split (`extractStructureThroughStage7` and `finalizeStructure`) in structure lane architecture |

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Split `extractStructure` at Stage 7 in `lib/extract/structure/index.ts`

- **File**: `lib/extract/structure/index.ts`
- **Action**: UPDATE
- **Implement**:
  - Export interface `ExtractStructurePreliminaryOptions` (`rawHarvestNode`, `viewport?`, `responsiveHarvests?`, `forceHeuristicNaming?`).
  - Export interface `PreliminaryStructure` (`labeledRoot`, `components`, `naming`, `sectionDescriptions?`, `responsive?`).
  - Export interface `FinalizeStructureOptions` (`sourceUrl?`, `capturedAt?`, `viewport?`, `secondaryViewports?`, `dump?`, `report?`).
  - Implement and export `extractStructureThroughStage7(options)`: executes Stages 3, 4, 4b, 5, 6, 7 (AI labelling), and 7b (responsive diff).
  - Implement and export `finalizeStructure(preliminary, options)`: executes Stage 8a (`annotateRegionMetrics`), Stage 8b (`linkComponentsToTokens`), Stage 9 (`buildSectionDigests`), and Stage 10 (`emitStructureReport`).
  - Update `extractStructure`: calls `extractStructureThroughStage7` followed by `finalizeStructure`.
- **Mirror**: `lib/extract/structure/index.ts:36-122`
- **Validate**: `npm run typecheck`

### Task 2: Run Token Enrichment and Structure Extraction Concurrently in `lib/analyze.ts`

- **File**: `lib/analyze.ts`
- **Action**: UPDATE
- **Implement**:
  - Import `extractStructureThroughStage7` and `finalizeStructure` from `@/lib/extract/structure`.
  - Update `analyzeUrl`:
    - Add `wantsStructure = mode === "structure" || mode === "both"`.
    - Use `Promise.all` to concurrently run `enrichWithAI` and `extractStructureThroughStage7` when `wantsStructure` is true.
    - Catch preliminary structure errors gracefully with `console.warn` and return `{ preliminary: undefined, error }`.
    - If `preliminary` is present, call `finalizeStructure` passing `report: mode === "both" ? enriched.report : undefined` and `dump: mode === "both" ? capture.styleDump : undefined`.
    - Wrap finalization in a `try...catch` block, populating `structureUnavailableReason = "Structure extraction failed for this page."` upon failure.
    - Add `structureReport?: StructureReport` and `structureUnavailableReason?: string` to `analyzeUrl`'s return type signature and returned object.
- **Mirror**: `lib/analyze.ts:246-267` (`analyzeImages` `Promise.all` and error handling pattern)
- **Validate**: `npm run typecheck && npm run eval`

### Task 3: Simplify URL Pipeline Handling in `app/api/analyze/route.ts`

- **File**: `app/api/analyze/route.ts`
- **Action**: UPDATE
- **Implement**:
  - Remove unused `extractStructureFromCapture` from `@/lib/analyze` imports.
  - Destructure `structureReport` and `structureUnavailableReason` directly from `await analyzeUrl(url!, mode)`.
  - Pass `structureReport: structureReport ?? null` and `structureUnavailableReason` into `responsePayload`.
  - Ensure the existing caching guard `if (!structureUnavailableReason) setCache(cacheKey, responsePayload)` guards against caching structure errors.
- **Mirror**: `app/api/analyze/route.ts:185-224` (image route handling)
- **Validate**: `npm run typecheck && npm run lint`

### Task 4: Update Architecture Documentation

- **File**: `docs/architecture/orchestration.md` and `docs/architecture/structure-lane.md`
- **Action**: UPDATE
- **Implement**:
  - In `docs/architecture/orchestration.md`: document that `analyzeUrl` runs token AI enrichment and Track B Stage 7 structural labelling concurrently via `Promise.all`, feeding the enriched report into structure finalization for Stages 8a/8b token linking.
  - In `docs/architecture/structure-lane.md`: document the pipeline split between `extractStructureThroughStage7` (Stages 3–7b) and `finalizeStructure` (Stages 8a–10), noting that Stages 8a and 8b are the only stages requiring the design report.
- **Mirror**: `docs/architecture/orchestration.md:3` and `docs/architecture/structure-lane.md:3`
- **Validate**: `git diff docs/architecture`

---

## Validation

```bash
# Type check / Build
npm run typecheck

# Lint
npm run lint

# Tests & Eval harness
npm run eval

# Production build
npm run build
```

## End-to-End Verification

1. **Offline Evaluation**:
   Run `npm run eval`. Verify that all gates pass across required fixtures (`clean-light`, `dark-mode`, `adversarial-shell`) with 100% combined score and identical misses/accuracy.
2. **Local Dev & Verify Suite (AI Lane Off)**:
   ```bash
   .claude/skills/verify/scripts/verify.sh up
   .claude/skills/verify/scripts/verify.sh drive analyze-url
   .claude/skills/verify/scripts/verify.sh drive tabs-downloads
   .claude/skills/verify/scripts/verify.sh down
   ```
   Verify that all assertions pass (HTTP 200, `structureReport` present, `aiOutcome` is `"no-key"`).
3. **Local Dev & Verify Suite (AI Lane On)**:
   Ensure `GEMINI_API_KEY` or `OPENROUTER_API_KEY` is present in `.env.local`:
   ```bash
   AI_LANE=on .claude/skills/verify/scripts/verify.sh up
   AI_LANE=on .claude/skills/verify/scripts/verify.sh drive analyze-url
   .claude/skills/verify/scripts/verify.sh down
   ```
   Verify that `aiOutcome` is `"applied"`, `structureReport` is present with AI naming, and server logs confirm concurrent execution without serial waiting.
4. **Full Verification Gate**:
   Run `npm run check` to verify typecheck, lint, build, and eval gates simultaneously.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Structure extraction failure on URL path crashes the entire request | **In-scope**: Inside `analyzeUrl`, `extractStructureThroughStage7` and `finalizeStructure` catch errors, log `console.warn`, and set `structureUnavailableReason = "Structure extraction failed for this page."` and `structureReport = undefined`, matching image lane behavior. |
| Structure failure response gets cached, hiding transient model flakes | **In-scope**: `route.ts` explicitly checks `if (!structureUnavailableReason)` before writing to `setCache`, ensuring failed structure runs are not cached. |
| Token links in Stage 8b diverge if run against pre-enriched palette | **In-scope**: `finalizeStructure` receives `enriched.report`, ensuring that Stage 8a (`annotateRegionMetrics`) and Stage 8b (`linkComponentsToTokens`) execute against the final AI-refined color roles. |
| Offline eval runner regresses or makes unwanted network calls | **In-scope**: `extractStructure` retains its signature and offline deterministic behavior (`forceHeuristicNaming: true`), and `npm run eval` continues to pass with 100% score offline. |

---

## Open Questions

None. The issue description, technical notes, and architecture documentation establish the requirements, stage split boundaries, and graceful error handling contracts unambiguously.

---

## Acceptance Criteria

- [ ] On the URL path the Stage 7 labelling call starts together with `enrichWithAI`, not after it.
- [ ] Stages 8a and 8b still receive the enriched report.
- [ ] A failure of the structure lane still yields `structureUnavailableReason` and a response that is not cached.
- [ ] `npm run eval` prints the same scores.
- [ ] Checked in the running app with an API key (`AI_LANE=on`).
