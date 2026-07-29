# Plan: DIST-061 — Carry the render viewport through `Capture` into the structure lane

## Summary

`RenderResult` captures `viewport: { width: number; height: number }`, but `Capture` did not record it. Consequently, `extractStructureFromCapture` always fell back to the structure orchestrator's default 1440×900 viewport when computing region metrics and height/padY annotations. This plan adds optional `viewport?: { width: number; height: number }` to `Capture`, records `render.viewport` in `captureFromRender`, and forwards `capture.viewport` into `extractStructureFromCapture` options. Legacy captures without a `viewport` field continue falling back to the 1440×900 default without score changes.

## User Story

As a maintainer
I want structure region metrics to use the viewport recorded during page rendering
So that custom or non-default render viewports calculate accurate height and padY annotations

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT (structure-lane / schema) |
| Complexity | LOW |
| Systems Affected | `lib/analyze.ts`, `lib/extract/structure/index.ts` |
| GitHub Issue | #109 (DIST-061) |

---

## Patterns to Follow

### Optional Capture schema fields
```ts
// SOURCE: lib/analyze.ts:35-49
export interface Capture {
  source: { type: "url"; ref: string; capturedAt: string };
  viewport?: { width: number; height: number };
  viewportShot: string;
  styleDump: StyleDump;
  rawHarvestNode?: RawHarvestNode;
  ...
}
```

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/analyze.ts` | UPDATE | Add optional `viewport?: { width: number; height: number }` to `Capture`, record it in `captureFromRender`, and pass it in `extractStructureFromCapture` |

---

## Tasks

### Task 1: Add `viewport` field to `Capture` and forward it in `lib/analyze.ts`

- **File**: `lib/analyze.ts`
- **Action**: UPDATE
- **Implement**:
  1. Add `viewport?: { width: number; height: number }` to `Capture` interface.
  2. Include `viewport: render.viewport` in `captureFromRender`.
  3. Include `viewport: capture.viewport` in `extractStructureFromCapture`.
- **Mirror**: `lib/analyze.ts:28-40` & `lib/analyze.ts:120-130` & `lib/analyze.ts:298-315`
- **Validate**: `npm run typecheck && npm run lint && npm run eval`

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Eval suite (must pass with baseline.json untouched)
npm run eval
```

---

## End-to-End Verification

1. Run `npm run eval` to verify legacy captures with no `viewport` field pass identically.
2. Create temporary scratch script `scratch/test-viewport.ts` (deleted after use, per `CLAUDE.md`) that renders a synthetic HTML page at viewport 1280×720 with `SSRF_ALLOWLIST_HOSTS=localhost`, calls `captureFromRender`, passes capture to `extractStructureFromCapture`, and asserts `viewport` in options is `{ width: 1280, height: 720 }`.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Legacy corpus captures fail or score changes | `viewport` is optional; absent `viewport` falls back to 1440×900 default in `extractStructure`. `eval/baseline.json` remains untouched. |

---

## Acceptance Criteria

- [ ] `Capture` records `viewport?: { width: number; height: number }`.
- [ ] `captureFromRender` sets `viewport: render.viewport`.
- [ ] `extractStructureFromCapture` passes `viewport: capture.viewport`.
- [ ] Legacy captures without `viewport` fall back to default (1440×900).
- [ ] `npm run eval` passes with baseline.json untouched.
- [ ] `npm run typecheck` and `npm run lint` pass.
