# Plan: AI one-line intent descriptions per section (DIST-030)

## Summary

Extend the existing Stage 7 AI labelling pass (`structureAI.ts`) so that, in the **same single API call** that already names components, the model also returns a one-line intent description per page section (e.g. "Sticky pill nav: logo left, 5 items center, CTA right"). The digest list (band identity computed from the typed tree via the same logic as Stage 9) is included in the prompt alongside the compact tree, and descriptions come back keyed by band node id. The Stage 9 digest gains an optional `description` field that renders as an `intent:` line; with no API key or a model failure the digest renders exactly as DIST-028 left it (byte-identical), and the measured lane (`extractFromCapture` / `extractStructureFromCapture`) never reaches for the network.

## User Story

As a reader of the structure report
I want a one-line intent description per section
So that each section digest opens with human intent while staying honestly labeled as AI-provenance

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT |
| Complexity | MEDIUM |
| Systems Affected | Structure lane Stage 7 (AI labelling), Stage 9 (section digest), structure schema |
| GitHub Issue | #36 |

---

## Patterns to Follow

### Optional AI-provenance schema field (additive, omitted when absent)
```
// SOURCE: lib/extract/structureSchema.ts:105
naming: z.enum(["ai", "heuristic"]).optional(),
// SOURCE: lib/extract/structureSchema.ts:115-118
sections: z.array(sectionDigestSchema).optional(),
```

### AI-lane policy: one availability check, retry-once then graceful fallback
```
// SOURCE: lib/extract/structure/structureAI.ts:104-122
export async function runStructureAILabeller(root: PrunedNode): Promise<StructureAIResult> {
  const fallback = buildFallbackComponentMap(root);
  if (!aiLaneAvailable()) {
    return { root, components: fallback, naming: "heuristic" };
  }
  ...
  const response = await retryOnce(
    () => requestOnce(client, compactTree),
    (err, attempt) => console.warn(`AI Structure Labeller failed (attempt ${attempt}):`, err),
  );
  if (!response) {
    return { root, components: fallback, naming: "heuristic" };
  }
```

### Conditional rendering — omitted entirely when input absent (fallback byte-identical)
```
// SOURCE: lib/extract/structure/structureEmit.ts:130-133
// Conditional sections carry their own leading blank line and are omitted
// entirely (never rendered empty) when their input is absent — the project's
// `if (report.<field>)` convention.
const pageSectionsSection = sectionsText ? `\n\n## Page sections\n\n${sectionsText}` : "";
// SOURCE: lib/extract/structure/sections.ts:233-244 (formatSectionDigests:
// `if (d.band) lines.push(...)` — add `description` the same way)
```

### Single source for band identity (don't duplicate logic)
```
// SOURCE: lib/extract/structure/sections.ts:180-197 (buildSectionDigests:
// findBand(root,"main") → header/footer outside main → bands list)
// Extract this into an exported helper used by BOTH buildSectionDigests and
// the Stage 7 prompt — like styleMatch.ts/roleMatch.ts, no inline copies.
```

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/extract/structureSchema.ts` | UPDATE | `sectionDigestSchema` gains optional `description` (AI-provenance) |
| `lib/extract/structure/sections.ts` | UPDATE | Export `findDigestBands`; `buildSectionDigests` accepts optional AI descriptions and stamps `digest.description`; `formatSectionDigests` renders the intent line |
| `lib/extract/structure/structureAI.ts` | UPDATE | `aiStructureResponseSchema` gains optional `sectionDescriptions: Record<id, line>`; prompt includes the digest list; result carries descriptions |
| `lib/extract/structure/index.ts` | UPDATE | Pass `sectionDescriptions` from Stage 7 result into `buildSectionDigests` |

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Add `description` to the digest schema

- **File**: `lib/extract/structureSchema.ts`
- **Action**: UPDATE
- **Implement**: Add to `sectionDigestSchema` (after `name`/`ordinal`/`instances`, before `band`): `description: z.string().optional()` with a doc comment: AI-provenance one-line intent (#36 / DIST-030) — only present when the Stage 7 AI pass ran and returned a line for this band; heuristic fallback omits it.
- **Mirror**: `lib/extract/structureSchema.ts:71-86` (optional-field style with doc comments)
- **Validate**: `npm run typecheck`

### Task 2: Extract `findDigestBands` as the single band-identity source

- **File**: `lib/extract/structure/sections.ts`
- **Action**: UPDATE
- **Implement**: Extract the band-list logic from `buildSectionDigests` (lines 185-197: find main → header/footer outside main → bands array; return `[]` when no main or no bands) into an exported `findDigestBands(root: PrunedNode): PrunedNode[]`. `buildSectionDigests` calls it and returns `undefined` when the list is empty (same behavior as today). Doc comment: used by both Stage 9 and the Stage 7 AI prompt so the prompt's digest list and the emitted digest can never disagree about which nodes are sections.
- **Mirror**: `lib/extract/structure/sections.ts:180-197`
- **Validate**: `npm run typecheck` (behavior unchanged — eval gate comes at the end)

### Task 3: Extend the Stage 7 AI schema, prompt, and result

- **File**: `lib/extract/structure/structureAI.ts`
- **Action**: UPDATE
- **Implement**:
  1. `aiStructureResponseSchema` gains `sectionDescriptions: z.record(z.string(), z.string()).optional()` — keys are band node ids from the compact tree / digest list.
  2. `StructureAIResult` gains `sectionDescriptions?: Record<string, string>` with a doc comment (only present on the `naming: "ai"` path; keyed by band node id).
  3. `requestOnce(client, compactTree, digestList)` — new third param: the digest list summary, an array of `{ id, name, instances?, layout?, contents? }` built from `findDigestBands(root)` band nodes (name = provisional name, layout = `layoutAnnotation`, contents = `textSnippet` if any). The prompt gains a section after the compact tree: "Here are the page sections (digest list) keyed by node id: ```json ...``` For each, also return a one-line human intent description (e.g. 'Sticky pill nav: logo left, 5 items center, CTA right') in `sectionDescriptions`, keyed by the same node id." Update the "Return strict JSON" example to include the optional `sectionDescriptions` field. Keep the prompt-injection comment's invariant intact (response stays JSON-parseable, Zod-validated, plain strings only).
  4. `runStructureAILabeller` computes the digest list via `findDigestBands(typedRoot)` before the call and passes it into `requestOnce`. On success, filter `response.sectionDescriptions` to known band ids only (never trust model-invented keys) and return it as `sectionDescriptions`. Both fallback returns (no API key, retry exhausted) omit the field. Bump `max_tokens` 2000 → 3000 so larger pages' responses aren't truncated by the extra field.
- **Mirror**: `lib/extract/structure/structureAI.ts:56-101` (prompt style), `lib/interpret.ts` null-gate shape
- **Validate**: `npm run typecheck`

### Task 4: Wire descriptions through the pipeline into the digest

- **File**: `lib/extract/structure/index.ts`
- **Action**: UPDATE
- **Implement**: Destructure `sectionDescriptions` from the Stage 7 result (line 86) and pass it into `buildSectionDigests({ root: metricsRoot, tokenHints, responsive, descriptions: sectionDescriptions })`.
- **File**: `lib/extract/structure/sections.ts`
- **Action**: UPDATE
- **Implement**: `BuildSectionDigestsInput` gains `descriptions?: Record<string, string>` (doc comment: Stage 7 AI intent lines keyed by band node id — only present when `naming: "ai"`). In the digest map, after `name`/`ordinal`/`instances`: `const description = descriptions?.[band.id]; if (description) digest.description = description;`
- **Mirror**: `lib/extract/structure/index.ts:110-115` (optional-artifact pass-through style)
- **Validate**: `npm run typecheck`

### Task 5: Render the intent line in the digest text

- **File**: `lib/extract/structure/sections.ts`
- **Action**: UPDATE
- **Implement**: In `formatSectionDigests`, right after the header line and before `band`: `if (d.description) lines.push(\`   intent: ${d.description}\`);` — conditional, so the heuristic/no-key path renders byte-identical to DIST-028 output.
- **Mirror**: `lib/extract/structure/sections.ts:236-241` (conditional line pushes)
- **Validate**: `npm run typecheck && npm run lint`

### Task 6: Verify heuristic path is byte-identical (synthetic fixture)

- **File**: scratch script (deleted after use)
- **Action**: VERIFY
- **Implement**: Per CLAUDE.md "Manually verifying extraction changes": local `http.createServer` synthetic page (header/nav, hero, repeated card grid, footer), drive Playwright directly like `eval/capture.ts` (or `SSRF_ALLOWLIST_HOSTS=localhost` with `renderUrl`), run `extractStructureFromCapture` with no `ANTHROPIC_API_KEY` set. Assert: report has `sections` digests, `sectionsText` contains no `intent:` lines, `naming: heuristic`, and `sectionsText` equals what `main` produces for the same fixture (run the same scratch on the base commit or compare against a captured string). Delete the script after.
- **Validate**: scratch assertions pass

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Tests (offline measured-lane regression gate — must pass with NO baseline refresh)
npm run eval
```

`npm run eval:ai` (AI-lane stability, mentioned in the issue's technical notes) requires `ANTHROPIC_API_KEY`, which is not set in this environment — flag in the final report as not runnable here; the prompt change is designed to be additive-only (new optional field), so stability risk is limited to the model now also emitting descriptions.

## End-to-End Verification

1. `npm run typecheck && npm run lint && npm run eval` — all pass, no baseline refresh (eval replays captures with no API key → heuristic path → digest output must be unchanged).
2. Task 6 synthetic-fixture scratch: no-key run produces digests with no `intent:` lines, byte-identical to `main`.
3. Code-path review of the AI branch: with a (mocked/absent) key the only behavioral change is an extra optional field on the response schema and an extra block in the prompt; fallback paths (`!aiLaneAvailable()`, retry-exhausted) are untouched and omit `sectionDescriptions`.

## Risks

| Risk | Mitigation |
|------|------------|
| Stage 7 runs before Stage 9, so no finished digest exists at prompt time | Compute band identity at Stage 7 via the same `findDigestBands` source (Task 2) — prompt list and emitted digest can't disagree |
| AI renames bands, breaking description join | Key descriptions by stable node `id` (ids survive every stage via spread copies), never by name |
| Model invents ids or omits the field | Filter returned keys to known band ids; field is optional end-to-end |
| Prompt change destabilizes AI naming (`eval:ai`) | Additive prompt block + optional schema field; response shape otherwise unchanged; `max_tokens` bump avoids truncation |
| Fallback path must stay byte-identical | `description` is conditionally set and conditionally rendered; no-key run has no descriptions at all |

---

## Acceptance Criteria

- [ ] `aiStructureResponseSchema` gains optional `sectionDescriptions: Record`
- [ ] Digest list included in the existing Stage 7 prompt — same single API call, no new request
- [ ] AI descriptions render per digest with `naming: ai` provenance; no-key/model-failure falls back to the DIST-028 deterministic digest, measured lane unaffected
- [ ] Neither `extractFromCapture` nor `extractStructureFromCapture` reaches for the network/API key
- [ ] `npm run typecheck`, `npm run lint`, `npm run eval` pass with no baseline refresh
