# Plan: TODO-9: Hold the analysis lifecycle in one state value

## Summary

`Home` in `app/page.tsx` currently manages its analysis request lifecycle across eight separate `useState` hooks (`status`, `error`, `report`, `markdown`, `structureReport`, `structureUnavailableReason`, `meta`, `refinements` at lines 51–58). This fragmented state causes `analyze` to trigger fifteen individual setter calls per request (eight to reset upon submission, seven to populate upon completion), permits impossible multi-state combinations that still compile, forces rendering guards to inspect compound boolean conditions (`status === "done" && report && meta`), and leaves download filename derivation (`deriveHost`) reading live form state (`url`, `inputMode`, `images`) rather than the analyzed result. Per GitHub issue #173 (Finding M3 in `.agents/reviews/codebase-analysis-review.md:23` and TODO-9 in `.agents/issues/todo-issues.md:365`), this plan consolidates the eight state hooks into a single discriminated union `AnalysisState` (`idle`, `loading`, `error`, `done`), ensures atomic state transitions, cleans up render guards, and anchors download file derivation strictly to `sourceName` captured in the `done` state.

## User Story

As a developer and workbench user
I want the analysis lifecycle to be held in a single discriminated state value
So that component state transitions are atomic, render guards are strictly typed without impossible state checks, and download file names remain anchored to the analyzed result regardless of subsequent form edits.

## Metadata

| Field | Value |
|-------|-------|
| Type | REFACTOR |
| Complexity | MEDIUM |
| Systems Affected | `app/page.tsx` |
| GitHub Issue | #173 (Finding M3 in `.agents/reviews/codebase-analysis-review.md:23`, TODO-9 in `.agents/issues/todo-issues.md:365`) |
| PRD Phase | N/A |
| Prototype Patch | `.agents/plans/todo-9-hold-analysis-lifecycle-in-one-state-value-prototype.patch` |

---

## Environment Findings

Baseline verified on `main` at commit `a347bd5` before planning:

| Probe | Result |
|-------|--------|
| `npm run typecheck` | Clean (0 errors from `tsc --noEmit`) |
| `npm run lint` | Clean (0 warnings or errors from `eslint .`) |
| `npm run eval` | Aggregate combined: 100%, all gates passed (`clean-light`, `dark-mode`, `adversarial-shell`) |
| `npm run build` | Next.js 15.5.20 compiled cleanly |
| Test framework | None configured (per `AGENTS.md`). `npm run eval` is the offline correctness gate; `/verify` provides E2E verification |
| Working tree state | Clean |

Start green, stay green: all validation checks and verification scenarios must remain clean upon completion.

---

## Patterns to Follow

### Discriminated Union Contract Pattern

```typescript
// SOURCE: lib/api.ts:30-47
export interface AnalyzeSuccess {
  ok: true;
  report: Report;
  markdown: string;
  structureReport: StructureReport | null;
  structureUnavailableReason?: string;
  refinements: RefinementChange[];
  meta: AnalyzeMeta;
}

export interface AnalyzeFailure {
  ok: false;
  error: string;
}

export type AnalyzeResponse = AnalyzeSuccess | AnalyzeFailure;
```

Mirror this pattern in `app/page.tsx` by defining `AnalysisState` as a discriminated union over `status`:

```typescript
type AnalysisState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; result: AnalyzeSuccess; sourceName: string };
```

### Atomic State Transitions

```typescript
// SOURCE: app/page.tsx:20-23
interface SelectedImage {
  file: File;
  preview: string;
}
```

Keep state components that belong together in a single paired or discriminated data structure so that updates are atomic and values cannot drift or enter disjoint states.

### Hostname Derivation from Immutable Result

```typescript
// SOURCE: app/page.tsx:158-168
function deriveHost(defaultHost: string): string {
  let host = defaultHost;
  try {
    host = new URL(meta?.finalUrl ?? url).hostname.replace(/^www\./, "");
  } catch {
    if (inputMode === "image" && images[0]) {
      host = images[0].file.name.replace(/\.[^/.]+$/, "");
    }
  }
  return host;
}
```

Refactor `deriveHost(sourceName: string, defaultHost: string)` into a pure function outside `Home` that reads from the immutable `sourceName` stored in `state` at the time of analysis completion, rather than reading mutable form variables (`url`, `inputMode`, `images`).

---

## Files to Change

| File | Action | Covered by Prototype Patch | Purpose |
|------|--------|----------------------------|---------|
| `app/page.tsx` | UPDATE | Yes | Replace 8 `useState` hooks with `AnalysisState` union, update `analyze` to execute atomic state transitions, make `deriveHost` a pure function reading from `state.sourceName`, and eliminate compound `status === "done" && report && meta` render guards. |

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Declare `AnalysisState` and Replace 8 State Hooks

- **File**: `app/page.tsx`
- **Action**: UPDATE
- **Implement**:
  - Import `type AnalyzeSuccess` from `@/lib/api`.
  - Remove unused import `StructureReport` from `@/lib/schema`.
  - Replace `type Status = "idle" | "loading" | "done" | "error"` with discriminated union `AnalysisState` (`idle`, `loading`, `error`, `done`).
  - Replace the eight separate `useState` hooks (`status`, `error`, `report`, `markdown`, `structureReport`, `structureUnavailableReason`, `meta`, `refinements` at lines 51–58) with a single `useState<AnalysisState>({ status: "idle" })`.
- **Mirror**: `lib/api.ts:30-47` (discriminated union pattern)
- **Validate**: `npm run typecheck`

### Task 2: Refactor `deriveHost` into a Pure Helper

- **File**: `app/page.tsx`
- **Action**: UPDATE
- **Implement**:
  - Lift `deriveHost(sourceName: string, defaultHost: string): string` above `Home` as a pure helper.
  - Parse `new URL(sourceName).hostname.replace(/^www\./, "")`, falling back in catch to `sourceName.replace(/\.[^/.]+$/, "").trim() || defaultHost`.
  - In `downloadActiveMarkdown` and `downloadTailwindTheme`, guard with `if (state.status !== "done") return;` and pass `state.sourceName` to `deriveHost`.
- **Mirror**: `app/page.tsx:37-45` (`downloadBlob` pure helper lifted outside `Home`)
- **Validate**: `npm run typecheck`

### Task 3: Update `analyze` Transitions and Render Guards

- **File**: `app/page.tsx`
- **Action**: UPDATE
- **Implement**:
  - In `analyze`:
    - On submission start: replace the 8 reset setter calls with `setState({ status: "loading" })`.
    - On success: capture `sourceName` (`inputMode === "url" ? (data.meta.finalUrl || url) : (images[0]?.file.name || data.report.source.ref || "image")`), adjust tab fallback if `data.structureReport` is absent, and call `setState({ status: "done", result: data, sourceName })`.
    - On error catch: call `setState({ status: "error", message: err instanceof Error ? err.message : "Something went wrong." })`.
  - In JSX:
    - Update button disabled and label conditions to check `state.status === "loading"`.
    - Update error banner to render `state.status === "error" && state.message`.
    - Update structure-unavailable notice to render `state.status === "done" && state.result.structureUnavailableReason`.
    - Replace `{status === "done" && report && meta && ...}` with `{state.status === "done" && ...}`.
    - Reference `state.result.report`, `state.result.meta`, `state.result.refinements`, `state.result.markdown`, and `state.result.structureReport`.
- **Mirror**: `app/page.tsx:315-389`
- **Validate**: `npm run typecheck`

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Offline Extraction Eval
npm run eval

# Full CI Check
npm run check
```

## End-to-End Verification

Execute the verification harness using `.claude/skills/verify/scripts/verify.sh`:

1. Check that the build guard passes and workspace is clean:
   ```bash
   npm run check
   ```

2. Start the disposable dev and fixture server:
   ```bash
   .claude/skills/verify/scripts/verify.sh up
   ```

3. Run verification scenarios:
   ```bash
   .claude/skills/verify/scripts/verify.sh drive analyze-url
   .claude/skills/verify/scripts/verify.sh drive tabs-downloads
   .claude/skills/verify/scripts/verify.sh drive analyze-images
   ```

4. Verify that:
   - `analyze-url` completes analysis, renders all tabs, and displays preview swatches and metadata.
   - `tabs-downloads` verifies download filenames (`distill-${host}.md`, `distill-structure-${host}.md`, `distill-theme-${host}.css`) and content parity.
   - `analyze-images` completes multi-image analysis, correctly displays preview, handles structure-unavailable notice when no API key is set, and renders swatches.

5. Tear down the verification server:
   ```bash
   .claude/skills/verify/scripts/verify.sh down
   ```

---

## Risks

| Risk | Mitigation | Scope |
|------|------------|-------|
| Form inputs edited after analysis altering download filenames | `sourceName` is captured immutably in `state` upon transition to `done`, and `deriveHost` reads exclusively from `state.sourceName`. Form inputs (`url`, `inputMode`, `images`) are never consulted during download derivation. | In-scope |
| `state.status === "done"` rendering child tabs when `structureReport` is null | The Layout Structure Markdown tab continues to check `state.result.structureReport` before rendering, and `tab` falls back to `"preview"` if `structureReport` is null. | In-scope |
| Unused imports causing ESLint warnings | Removed `StructureReport` from `lib/schema` import in `app/page.tsx` since `AnalyzeSuccess` in `lib/api.ts` provides the type. | In-scope |

---

## Open Questions

None. The acceptance criteria, technical notes in issue #173, and review finding M3 in `.agents/reviews/codebase-analysis-review.md:23` explicitly define the state shape (`{ status: "idle" } | { status: "loading" } | { status: "error"; message: string } | { status: "done"; result: AnalyzeSuccess; sourceName: string }`), single setter per transition, render guard elimination, and filename derivation requirements.

---

## Acceptance Criteria

- [ ] One union over `idle`, `loading`, `error` and `done` replaces the eight `useState` calls of `app/page.tsx:77-84` (current lines 51–58).
- [ ] Each transition sets the state once, and no render guard reads `status === "done" && report && meta`.
- [ ] The download file names come from the analysed result and do not change when the form is edited afterwards.
- [ ] `npm run check` and `/verify` (`analyze-url`, `tabs-downloads`, `analyze-images`) pass.
- [ ] Follows existing patterns and semantic token rules in `docs/architecture/frontend.md`.
