# Plan: TODO-8: Show the AI lane's real status instead of "skipped (no key)"

## Summary

The workbench preview's AI-lane meta panel currently renders `"skipped (no key)"` and displays an onboarding setup hint whenever `meta.aiApplied` is false (`app/page.tsx:410, 414`). However, `enrichWithAI` in `lib/analyze.ts:127, 134` returns the identical fallback `{ ...measured, refinements: [] }` both when no AI key is present and when an API key is configured but the vision model fails (e.g. 429 rate limit, quota exhaustion, upstream failure). Consequently, `aiApplied = Boolean(enriched.report.identity)` evaluates to `false` during model failure, misinforming users that no key is set and recommending they configure keys they already have. Per GitHub issue #172 (Finding M2 in `.agents/reviews/codebase-analysis-review.md:22` and TODO-8 in `.agents/issues/todo-issues.md:335`), this plan replaces boolean `aiApplied` with a strictly typed literal union `AiOutcome = "applied" | "no-key" | "failed" | "not-requested"` declared in `lib/api.ts`. `enrichWithAI` and the analysis pipelines return and propagate this outcome across `meta`, `app/page.tsx` renders exhaustive human-readable status labels (`applied`, `skipped (no key)`, `failed`, `skipped (not requested)`) via a typed record mapping, and the setup hint renders exclusively for `"no-key"`.

## User Story

As a developer and workbench user
I want the UI preview and API response metadata to honestly reflect the actual outcome of the AI lane (`applied`, `skipped (no key)`, `failed`, or `skipped (not requested)`)
So that when an API key is configured and the model fails, the system clearly reports failure instead of falsely claiming no key was set and displaying an unhelpful setup hint.

## Metadata

| Field | Value |
|-------|-------|
| Type | BUG_FIX |
| Complexity | MEDIUM |
| Systems Affected | `lib/api.ts`, `lib/analyze.ts`, `app/page.tsx`, `.claude/skills/verify/scripts/drive.ts`, `README.md` |
| GitHub Issue | #172 (Finding M2 in `.agents/reviews/codebase-analysis-review.md:22`, TODO-8 in `.agents/issues/todo-issues.md:335`) |
| PRD Phase | N/A |
| Prototype Patch | `.agents/plans/todo-8-show-ai-lane-real-status-prototype.patch` |

---

## Environment Findings

Baseline verified on `main` at `c0ce0b2` before planning:

| Probe | Result |
|-------|--------|
| `npm run typecheck` | Clean (0 errors from `tsc --noEmit`) |
| `npm run lint` | Clean (0 warnings or errors from `eslint .`) |
| `npm run eval` | Aggregate combined: 100%, all gates passed (`clean-light`, `dark-mode`, `adversarial-shell`) |
| `npm run build` | Next.js 15.5.20 compiled successfully in 2.9s, 4/4 static pages generated (route `/` 5.46 kB, First Load JS 108 kB) |
| Test framework | None configured (per `AGENTS.md`). `npm run eval` is the offline correctness gate; `/verify` provides E2E verification |
| Working tree state | Clean (`## main...origin/main`) |

Start green, stay green: all validation checks and verification scenarios must remain clean upon completion.

---

## Patterns to Follow

### Exhaustiveness by Table Lookup

```typescript
// SOURCE: lib/extract/palette.ts:16-27
export const ROLE_USAGE: Record<ColorRole, string> = {
  primary: "Key actions and brand emphasis",
  surface: "Page / card backgrounds",
  // ...
};
```

Mirror this convention in `app/page.tsx` by defining `AI_LANE_LABELS: Record<AiOutcome, string>` so that any future outcome variant is caught as a compile-time exhaustiveness failure.

### Shared Response Contract Pattern

```typescript
// SOURCE: lib/api.ts:12-22
export interface AnalyzeMeta {
  finalUrl: string;
  title: string;
  elapsedMs: number;
  bannerDismissed: boolean;
  capturedAt: string;
  viewportShot: string;
  viewportShots?: string[];
  aiApplied: boolean;
}
```

Replace `aiApplied: boolean` with `aiOutcome: AiOutcome` in `lib/api.ts` so the contract is defined once and shared by client and server.

### AI Graceful Fallback Pattern

```typescript
// SOURCE: lib/interpret.ts:184-209
export async function interpret(
  input: InterpretInput,
): Promise<Interpretation | null> {
  if (!aiLaneAvailable()) return null;
  if (input.screenshotsPngBase64.length === 0) return null;
  // ...
  const ai = await retryOnce(...);
  if (!ai) return null;
  return { ... };
}
```

`enrichWithAI` in `lib/analyze.ts` inspects `aiLaneAvailable()` and the result of `interpret()` to distinguish missing keys from model execution failures.

---

## Files to Change

| File | Action | Covered by Prototype Patch | Purpose |
|------|--------|----------------------------|---------|
| `lib/api.ts` | UPDATE | Yes | Export `AiOutcome = "applied" \| "no-key" \| "failed" \| "not-requested"` and replace `aiApplied: boolean` with `aiOutcome: AiOutcome` in `AnalyzeMeta`. |
| `lib/analyze.ts` | UPDATE | Yes | Update `enrichWithAI` signature and options (`opts?: { requested?: boolean }`) to return `outcome: AiOutcome`. Update `analyzeImages` and `analyzeUrl` signatures and return objects to emit `meta.aiOutcome`. |
| `app/page.tsx` | UPDATE | Yes | Import `AiOutcome` from `@/lib/api`. Define `AI_LANE_LABELS: Record<AiOutcome, string>`. Update `Preview` to render `AI_LANE_LABELS[meta.aiOutcome]` and constrain the setup hint to `meta.aiOutcome === "no-key"`. |
| `.claude/skills/verify/scripts/drive.ts` | UPDATE | Yes | Add assertion that `meta.aiOutcome` matches expected execution state (`AI_ON ? "applied" : "no-key"`) across URL and image scenarios. |
| `README.md` | UPDATE | No | Update description of AI Lane Status under Interactive UI & API section to document real outcome reporting. |

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Update API Contract in `lib/api.ts`

- **File**: `lib/api.ts`
- **Action**: UPDATE
- **Implement**: Export type `AiOutcome = "applied" | "no-key" | "failed" | "not-requested"`. Replace `aiApplied: boolean` with `aiOutcome: AiOutcome` in `AnalyzeMeta`.
- **Mirror**: `lib/api.ts:12-22`
- **Validate**: `npm run typecheck`

### Task 2: Update AI Enrichment & Metadata in `lib/analyze.ts`

- **File**: `lib/analyze.ts`
- **Action**: UPDATE
- **Implement**:
  - Import `type AiOutcome` from `@/lib/api`.
  - Declare `EnrichWithAiOptions { requested?: boolean }` and `EnrichWithAiResult = AnalyzeResult & { refinements: RefinementChange[]; outcome: AiOutcome }`.
  - Update `enrichWithAI`:
    - If `opts?.requested === false`, return `{ ...measured, refinements: [], outcome: "not-requested" }`.
    - If `!aiLaneAvailable()`, return `{ ...measured, refinements: [], outcome: "no-key" }`.
    - If `!interpretation`, return `{ ...measured, refinements: [], outcome: "failed" }`.
    - On success, return `{ report, markdown, refinements, outcome: "applied" }`.
  - Update `analyzeImages`: pass `{ requested: wantsTokenEnrichment }` to `enrichWithAI` and set `aiOutcome: enriched.outcome` on `meta`. Update return type signature.
  - Update `analyzeUrl`: pass `{ requested: wantsTokenEnrichment }` to `enrichWithAI` and set `aiOutcome: enriched.outcome` on `meta`. Update return type signature.
- **Mirror**: `lib/analyze.ts:123-153`
- **Validate**: `npm run typecheck`

### Task 3: Update Preview Status & Setup Hint in `app/page.tsx`

- **File**: `app/page.tsx`
- **Action**: UPDATE
- **Implement**:
  - Import `type AiOutcome` from `@/lib/api`.
  - Define `AI_LANE_LABELS: Record<AiOutcome, string>` mapping `"applied"` → `"applied"`, `"no-key"` → `"skipped (no key)"`, `"failed"` → `"failed"`, `"not-requested"` → `"skipped (not requested)"`.
  - In `Preview`, render `value={AI_LANE_LABELS[meta.aiOutcome]}` on the AI lane Meta component.
  - Replace `!meta.aiApplied` guard on setup hint with `meta.aiOutcome === "no-key"`.
- **Mirror**: `lib/extract/palette.ts:16-27` (`ROLE_USAGE` record lookup pattern)
- **Validate**: `npm run typecheck`

### Task 4: Update Verification Assertions in `drive.ts`

- **File**: `.claude/skills/verify/scripts/drive.ts`
- **Action**: UPDATE
- **Implement**:
  - In `checkDesignReport`, assert that `(a.body.meta as { aiOutcome?: string } | undefined)?.aiOutcome === (AI_ON ? "applied" : "no-key")`.
  - In `scenarioAnalyzeImages`, assert that `(a.body.meta as { aiOutcome?: string } | undefined)?.aiOutcome === (AI_ON ? "applied" : "no-key")`.
- **Mirror**: `.claude/skills/verify/scripts/drive.ts:117-132`
- **Validate**: `npm run typecheck`

### Task 5: Update Documentation in `README.md`

- **File**: `README.md`
- **Action**: UPDATE
- **Implement**: Update AI Lane Status description in `README.md:58` to reflect that the meta panel reports whether the lane was `applied`, `skipped (no key)`, `skipped (not requested)`, or `failed`.
- **Mirror**: `README.md:58`
- **Validate**: `npm run lint`

---

## Validation

```bash
# Type check / Build
npm run typecheck

# Lint
npm run lint

# Offline Extraction Eval
npm run eval

# Full CI Gate
npm run check

# Reproduction command (BUG_FIX): red on unfixed code, green after fix
npx tsx -e "import { enrichWithAI } from './lib/analyze'; import type { Report } from './lib/schema'; const r: Report = { reportKind: 'design-system', source: { type: 'url', ref: 'http://example.com', capturedAt: '' }, palette: { provenance: 'measured', colors: [], contrast: [] } }; enrichWithAI({ report: r, markdown: '' }, []).then(res => { if (!('outcome' in res)) { console.error('FAIL: outcome missing'); process.exit(1); } });"
```

## End-to-End Verification

Execute the headless browser verification suite using the `/verify` skill harness:

1. Ensure the workspace is clean and build guard passes:
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
4. Verify all checks pass:
   - `AI lane meta reads skipped (no key)` passes in `analyze-url` and `tabs-downloads`.
   - `meta.aiOutcome is no-key` passes in `analyze-url`, `tabs-downloads`, and `analyze-images`.
   - Setup hint is displayed when no key is set.
5. Tear down the verification server:
   ```bash
   .claude/skills/verify/scripts/verify.sh down
   ```

---

## Risks

| Risk | Mitigation | Scope |
|------|------------|-------|
| Older external clients or consumers expecting boolean `aiApplied` in `meta` | `lib/api.ts` is the single shared contract created in TODO-7 (#171); `meta` is consumed exclusively by `app/page.tsx` and `app/api/analyze/route.ts`. The schema Frontmatter contract is unchanged. | In-scope |
| `mode: "structure"` caller accessing design report with skipped token enrichment | `enrichWithAI` with `requested: false` explicitly returns `outcome: "not-requested"`, so `aiOutcome` accurately reflects why token enrichment was omitted. | In-scope |
| `drive.ts` timing out during fixture analysis | Reuse established `appears` / `submitAndWait` helpers in `drive.ts`. Verification harness runs headlessly with fixture server. | In-scope |

---

## Open Questions

None. The acceptance criteria, technical notes, and codebase review findings explicitly specify the union variants (`"applied" | "no-key" | "failed" | "not-requested"`), the setup hint condition (only for `"no-key"`), and the required verification driver updates.

---

## Acceptance Criteria

- [ ] `enrichWithAI` returns the lane's outcome as `"applied" | "no-key" | "failed" | "not-requested"`.
- [ ] `meta` carries that outcome in place of `aiApplied`.
- [ ] The preview shows one label per outcome, and the setup hint only for `"no-key"`.
- [ ] With a key set and a failing model, the page does not say "no key".
- [ ] `drive.ts` asserts the new label; `npm run check` and `/verify` (`analyze-url`, `tabs-downloads`, `analyze-images`) pass.
- [ ] All validation commands (`npm run typecheck`, `npm run lint`, `npm run eval`, `npm run check`) pass.
