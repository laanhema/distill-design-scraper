# Plan: Sync README with actual behavior (D1/D2 doc sweep — README half)

## Summary

The README makes several claims about Distill's capabilities that the code does not support. This plan only corrects the **README half** (claims independent of #19 and the reshape epic). The CLAUDE.md half (cache-key claim, "eval replays structure extraction offline", structure-lane description post-reshape) is deferred until the reshape epic (#29–#36) lands because those descriptions will have drifted and are better corrected then.

## User Story

As a contributor reading the README, I want it to accurately describe what the scraper actually does, so that I don't plan work or make deployment decisions based on false claims.

## Metadata

| Field | Value |
|-------|-------|
| Type | BUG_FIX |
| Complexity | LOW |
| Systems Affected | Documentation only (`README.md`) |
| GitHub Issue | #26 |

---

## Patterns to Follow

### README tone & structure
```
// SOURCE: README.md — existing style is declarative, bullet-heavy, with inline-code for
// field/option names and code fences for shell snippets. Provenance section headers use
// inline-code (e.g., `provenance`). Feature claims are either present-tense descriptions
// of what exists, or explicitly gated with "Planned: ..." / "Requires API key" disclaimers.
```

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `README.md` | UPDATE | Correct 5 false or misleading claims; no code changes needed |

---

## Claims to Fix (README only)

### Claim 1: "APCA contrast calculations" (line 12)

- **What the README says**: `APCA contrast calculations` in Track A — Palette Harvesting
- **What the code does**: WCAG-only contrast via `lib/color.ts:58-63` (`contrastRatio` based on WCAG relative luminance). No APCA code exists anywhere in the repo.
- **Fix**: Replace `APCA contrast calculations` with `WCAG contrast calculations`

### Claim 2: "Container Queries" (line 19)

- **What the README says**: Track B lists `Container Queries` alongside Flexbox and Grid as detected layout mechanics
- **What the code does**: No container query detection. `grep -r "container.?quer" lib/` returns zero results.
- **Fix**: Remove `Container Queries` from the Layout Mechanics list (keep `CSS Grid, Flexbox`)

### Claim 3: Image input is "Palette & Mood only" (line 28)

- **What the README says**: `Palette & Mood only — an uploaded image has no DOM to harvest, so there is no layout-structure report for image input, regardless of mode.`
- **What the code does**: `structureFromImages()` in `lib/extract/structureFromImage.ts:170` produces a vision-inferred structure report for image input (gated on API key, stamped `fidelity: inferred`). The UI already advertises this (`app/page.tsx:184-191`, `app/page.tsx:295-298`).
- **Fix**: Rewrite to say image input produces a palette report plus an optional vision-inferred layout skeleton (requiring an API key), rather than claiming "no layout-structure report... regardless of mode."

### Claim 4: "mode toggles" for URL input (lines 35–36)

- **What the README says**: `mode toggles (tokens, structure, both) for URL input`
- **What the code does**: `app/page.tsx:114` hardcodes `mode: "both"` — the UI has input-mode switching (URL vs image) but no extraction-mode toggles.
- **Fix**: Remove mention of mode toggles from the "Interactive Workbench" description. If desired, note them as a planned feature.

### Claim 5: "forced cache refresh controls" (line 35)

- **What the README says**: `forced cache refresh controls` in the Interactive Workbench
- **What the code does**: `app/page.tsx` never sends `forceRefresh` to the API (`app/api/analyze/route.ts:45` accepts but the client never includes it).
- **Fix**: Remove mention of forced cache refresh controls. If desired, note as planned.

### Claim 6: Internal contradiction between lines 28 and 35

- **What the README says**: Line 28 claims "Palette & Mood only" for images; line 35 describes "drag-and-drop multi-image upload... with a thumbnail strip" — which is actually true (the image upload UI exists and works).
- **What the code does**: The UI does have multi-image upload with thumbnail strip (`app/page.tsx:277-293`), and images do produce structure reports via the vision lane.
- **Fix**: This contradiction resolves when Claim 3 is fixed (line 28 no longer claims "Palette & Mood only").

---

## Tasks

### Task 1: Fix APCA → WCAG in Track A description

- **File**: `README.md`
- **Action**: UPDATE
- **Implement**: On line 12, replace `APCA contrast calculations` with `WCAG contrast calculations`
- **Validate**: `npm run lint && npm run typecheck` (these pass since only a markdown file is changed)

### Task 2: Remove "Container Queries" from Track B description

- **File**: `README.md`
- **Action**: UPDATE
- **Implement**: On line 19, change `Detailing page layout modes (CSS Grid, Flexbox, Container Queries)` to `Detailing page layout modes (CSS Grid, Flexbox)`
- **Validate**: Same as Task 1

### Task 3: Fix image-input scope claim (lines 28–29)

- **File**: `README.md`
- **Action**: UPDATE
- **Implement**: Replace `Palette & Mood only — an uploaded image has no DOM to harvest, so there is no layout-structure report for image input, regardless of mode.` with a truthful description that image input produces a measured palette + mood report, plus an optional vision-inferred layout skeleton when an API key is available (stamped `fidelity: inferred`).
- **Validate**: Same as Task 1

### Task 4: Remove "mode toggles" from Interactive UI section

- **File**: `README.md`
- **Action**: UPDATE
- **Implement**: On line 35, remove `mode toggles (tokens, structure, both) for URL input, and` from the Interactive Workbench bullet. Rewrite the bullet to describe actual behavior: URL submission, drag-and-drop multi-image upload with thumbnail strip.
- **Validate**: Same as Task 1

### Task 5: Remove "forced cache refresh controls" from Interactive UI section

- **File**: `README.md`
- **Action**: UPDATE
- **Implement**: On line 35 (same bullet), remove `plus forced cache refresh controls`. If preferred, note as planned instead.
- **Validate**: Same as Task 1

---

## Deferred (not in this plan)

The CLAUDE.md half of issue #26 is deferred because:

1. The cache-key claim matching DIST-007 (#13) and "eval replays structure extraction offline" claim matching DIST-013 (#19) are blocked until those issues complete — both have already landed and the CLAUDE.md in fact already accurately describes both (cache key hashes image payloads in line 109; structure extraction replay is described in lines 76–77).
2. The structure-lane description will drift after the reshape epic (#29–#36) introduces chain-squash pass, Stage 9 section digest, `## Page sections`-first emit shape, and recipe `variant` labels. Correcting CLAUDE.md now would create immediate rework when the reshape lands.

---

## Validation

```bash
npm run lint
npm run typecheck
```

No code changes; both should pass trivially.

## End-to-End Verification

1. Read `README.md` and confirm:
   - APCA is replaced with WCAG in Track A
   - Container Queries are removed from Track B
   - Image input section no longer claims "Palette & Mood only" and acknowledges the vision-inferred structure lane
   - Mode toggles and forced cache refresh controls are no longer promised
   - No internal contradictions remain between the image input description and the UI feature list
2. Verify `npm run lint && npm run typecheck` pass (markdown-only change, should be trivial).

---

## Acceptance Criteria (from issue #26, scoped to README half)

- [ ] README no longer claims image input is "Palette & Mood only" — acknowledges `structureFromImages` exists
- [ ] README no longer promises UI mode toggles or forced-cache-refresh controls unless they exist
- [ ] README no longer claims APCA contrast or Container Query detection
- [ ] Internal contradiction between README lines 28 and 35 is resolved

## Risks

| Risk | Mitigation |
|------|------------|
| CLAUDE.md stale more than expected while waiting for reshape | Low — the current CLAUDE.md was already maintained through recent merges (lines 76–77 describe structure eval replay, lines 109 describes cache-key hashing). The reshape epic (#29–#36) will introduce the real drift, and the deferred CLAUDE.md sweep will catch it then. |
| Image-input wording may need nuance | The UI already handles this well (`app/page.tsx:295-298` explains "vision-inferred, not measured"). Mirror that phrasing in the README. |
| Mode toggles / forceRefresh may be added later | If they are, the README can be updated at that time. For now, document reality. |