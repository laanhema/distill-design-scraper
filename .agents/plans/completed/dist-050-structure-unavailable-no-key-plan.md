# Plan: Set `structureUnavailableReason` When the AI Lane Has No API Key (DIST-050)

## Summary

`analyzeImages` (`lib/analyze.ts:233`) currently computes `wantsStructure = (mode === "structure" || mode === "both") && aiLaneAvailable()`. When no API key is configured, the `aiLaneAvailable()` conjunct makes the whole structure branch of the `Promise.all` short-circuit to its `else` arm, which explicitly sets `structureUnavailableReason: undefined` — so a keyless image request silently drops the structure pane instead of explaining why, contradicting the doc comment at `lib/analyze.ts:189-191` and the frontend type at `app/page.tsx:30-32`. This plan splits the condition per the issue's maintainer notes: `wantsStructure` becomes mode-only, and a nested check on `aiLaneAvailable()` inside the branch either runs the real vision call or resolves immediately with an explicit, persistent reason naming both provider env vars. It also fixes the caching gate in `app/api/analyze/route.ts`, which currently treats *any* non-empty `structureUnavailableReason` as a transient failure and skips `setCache` — a missing key is not transient, so the gate needs to distinguish the two cases (re-checking the same `aiLaneAvailable()` predicate, since env vars can't change mid-request, is the minimal-footprint way to do it without widening the response schema). The frontend (`app/page.tsx:347-351`) already renders `structureUnavailableReason` generically, so no UI change is needed — only verification.

## User Story

As a user analyzing images without an API key
I want to be told *why* the structure pane is missing
So that I can fix my setup instead of assuming the feature is broken

## Metadata

| Field | Value |
|-------|-------|
| Type | BUG_FIX |
| Complexity | LOW |
| Systems Affected | `lib/analyze.ts` (`analyzeImages`), `app/api/analyze/route.ts` (image branch caching gate) |
| GitHub Issue | #98 (DIST-050) |

---

## Patterns to Follow

### The bug — condition that skips the branch entirely

```ts
// SOURCE: lib/analyze.ts:233
const wantsStructure = (mode === "structure" || mode === "both") && aiLaneAvailable();
```

### The existing three-way `Promise.all` structure-outcome shape (to extend, not restructure)

```ts
// SOURCE: lib/analyze.ts:238-265
const [enriched, structureOutcome] = await Promise.all([
  wantsTokenEnrichment
    ? enrichWithAI(measuredResult, screenshotsBase64)
    : Promise.resolve({ ...measuredResult, refinements: [] as RefinementChange[] }),
  wantsStructure
    ? structureFromImages({ imagesPngBase64: screenshotsBase64, sourceRef: ref, capturedAt })
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
    : Promise.resolve({
        structureReport: undefined as StructureReport | undefined,
        structureUnavailableReason: undefined as string | undefined,
      }),
]);
```

### `aiLaneAvailable` — the single canonical availability check (never re-implement)

```ts
// SOURCE: lib/aiLane.ts:23-26
/** True when a live AI lane call is possible (an API key is configured). */
export function aiLaneAvailable(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY);
}
```

`lib/analyze.ts` already imports it (re-exported through `lib/interpret.ts:140`); `app/api/analyze/route.ts` does not yet import it and should pull it directly from `@/lib/aiLane` (the canonical source per CLAUDE.md's aiLane section), not through `lib/interpret.ts`.

### The existing (blanket, and about to become wrong) caching gate — precedent commit `skip-cache-url-structure-failure-plan.md`

```ts
// SOURCE: app/api/analyze/route.ts:177-183 (image branch)
// Don't cache a transient structure failure — replaying it verbatim for
// the full TTL would hide a one-off vision-model flake/timeout from a
// resubmission seconds later (§ code review finding #3).
if (!structureUnavailableReason) {
  setCache(cacheKey, responsePayload);
}
return NextResponse.json(responsePayload);
```

The identical pattern exists at `app/api/analyze/route.ts:224-229` for the URL branch — that branch's `structureUnavailableReason` ("Structure extraction failed for this page.") is set only from a genuine thrown exception in DOM-based extraction, never from a missing key (URL-path structure extraction doesn't require an AI key; Stage 7 AI naming degrades gracefully instead of throwing). **The URL branch is out of scope for this plan** — its failure really is always transient.

### Frontend already renders the field generically — no change needed

```tsx
// SOURCE: app/page.tsx:347-351
{status === "done" && report && meta && structureUnavailableReason && (
  <p className="mt-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
    {structureUnavailableReason}
  </p>
)}
```

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/analyze.ts` | UPDATE | Split `wantsStructure` from the availability check; add an explicit no-key branch that resolves immediately with a reason naming both env vars |
| `app/api/analyze/route.ts` | UPDATE | Import `aiLaneAvailable`; make the image-branch caching gate distinguish a persistent (no-key) reason from a transient (vision-call failure) reason, with a comment explaining the decision either way |

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Split `wantsStructure` from the AI-availability check

- **File**: `lib/analyze.ts`
- **Action**: UPDATE
- **Implement**: Change line 233 from
  ```ts
  const wantsStructure = (mode === "structure" || mode === "both") && aiLaneAvailable();
  ```
  to
  ```ts
  const wantsStructure = mode === "structure" || mode === "both";
  ```
  `wantsStructure` now means "the caller asked for structure," independent of whether an AI key is available — matching the acceptance criterion that `mode: "tokens"` must never touch this path (it already doesn't, since `wantsStructure` stays `false` for `"tokens"`).
- **Mirror**: n/a — this is the bug site itself.
- **Validate**: `npm run typecheck`

### Task 2: Nest the availability check inside the structure branch, with the no-key reason

- **File**: `lib/analyze.ts`
- **Action**: UPDATE
- **Implement**: In the `Promise.all` array (lines ~242-264), change the `wantsStructure ? … : …` ternary's truthy arm so it further branches on `aiLaneAvailable()`:
  ```ts
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
      : Promise.resolve({
          structureReport: undefined as StructureReport | undefined,
          // Distinct from the vision-call failure above: this is a
          // persistent condition (no retry will fix it without config
          // changes), not a one-off flake — see the route.ts caching gate,
          // which relies on that distinction (DIST-050).
          structureUnavailableReason:
            "Structure inference for images requires an AI key — set GEMINI_API_KEY or OPENROUTER_API_KEY." as
              | string
              | undefined,
        })
    : Promise.resolve({
        structureReport: undefined as StructureReport | undefined,
        structureUnavailableReason: undefined as string | undefined,
      }),
  ```
  Keep the exact wording `"Structure inference for images requires an AI key — set GEMINI_API_KEY or OPENROUTER_API_KEY."` from the issue's technical-notes comment — it names both provider env vars, consistent with `aiLaneAvailable()`'s OR check, and is the wording DIST-057 (#105, non-blocking) should later reconcile the setup-hint copy against.
  Do not touch the doc comment at lines 189-191 — it already documents "no API key, or the vision model failed" correctly; this change makes the code match it.
- **Mirror**: the existing `.then()`/`.catch()` arm being extended (lines ~248-260) — same shape, same `structureReport: undefined` sibling field.
- **Validate**: `npm run typecheck`

### Task 3: Make the image-branch caching gate distinguish persistent vs. transient reasons

- **File**: `app/api/analyze/route.ts`
- **Action**: UPDATE
- **Implement**:
  1. Add `import { aiLaneAvailable } from "@/lib/aiLane";` alongside the existing imports (after line 2's `analyzeImages, analyzeUrl, extractStructureFromCapture` import).
  2. Replace the image branch's caching gate (currently lines 177-182):
     ```ts
     // Don't cache a transient structure failure — replaying it verbatim for
     // the full TTL would hide a one-off vision-model flake/timeout from a
     // resubmission seconds later (§ code review finding #3).
     if (!structureUnavailableReason) {
       setCache(cacheKey, responsePayload);
     }
     ```
     with a version that re-derives transience from `aiLaneAvailable()` (env vars can't change mid-request, so re-checking here is safe and avoids widening `analyzeImages`'s return shape just to carry a cacheability flag):
     ```ts
     // Don't cache a transient structure failure — replaying it verbatim for
     // the full TTL would hide a one-off vision-model flake/timeout from a
     // resubmission seconds later (§ code review finding #3). A missing AI
     // key is different: it's a persistent condition (nothing about a retry
     // fixes it without a config change), so it's safe — and cheap — to
     // cache. `aiLaneAvailable()` is the same check `analyzeImages` used to
     // choose the wording; re-running it here (env vars are static for the
     // life of the process) is enough to tell the two reasons apart without
     // adding a second field to the response just to carry this bit (DIST-050).
     const structureFailureIsTransient = Boolean(structureUnavailableReason) && aiLaneAvailable();
     if (!structureFailureIsTransient) {
       setCache(cacheKey, responsePayload);
     }
     ```
  3. Leave the URL branch's gate (lines ~224-229) untouched — it's out of scope; its failure is always a genuine exception, never a missing-key case.
- **Mirror**: `app/api/analyze/route.ts:224-229` (URL branch, for the comment style/precedent — but do not copy its unconditional logic since the two branches now differ deliberately).
- **Validate**: `npm run typecheck && npm run lint`

### Task 4: Manually verify all three acceptance-criteria paths

- **File**: none (scratch script only, per CLAUDE.md's "Manually verifying extraction changes" pattern, adapted for this non-extraction layer)
- **Action**: n/a
- **Implement**: Write a throwaway script at `/tmp/claude-*/scratchpad/verify-dist-050.ts` (or under the project root scratch conventions — run with `npx tsx` **from the project root** so `node_modules` resolves) that:
  1. Ensures `process.env.GEMINI_API_KEY` and `process.env.OPENROUTER_API_KEY` are both unset (`delete process.env.GEMINI_API_KEY; delete process.env.OPENROUTER_API_KEY;` at the top, before any import that might read them at module-eval time — check `lib/aiLane.ts` reads them lazily inside `aiLaneAvailable()`/`getClient()`, not at import time, so this is safe).
  2. Builds a tiny synthetic image buffer (e.g. a small solid-color PNG via `sharp({ create: { width: 64, height: 64, channels: 3, background: { r: 120, g: 130, b: 200 } } }).png().toBuffer()` — check `lib/extract/imagePalette.ts`'s `DegenerateImageError` guard first to make sure a flat single-color image doesn't get rejected; add a couple of differently-colored rectangles via `sharp` `composite` if needed to avoid tripping it).
  3. Calls `analyzeImages([{ data: buf, name: "test.png" }], "structure")` and asserts `structureUnavailableReason === "Structure inference for images requires an AI key — set GEMINI_API_KEY or OPENROUTER_API_KEY."` and `structureReport === undefined`.
  4. Calls `analyzeImages([{ data: buf, name: "test.png" }], "tokens")` and asserts `structureUnavailableReason === undefined` (AC3 — never requested, nothing to explain).
  5. Logs both results.
  Delete the scratch script after use (CLAUDE.md: "don't leave them in the repo").
- **Mirror**: the "Manually verifying extraction changes" section of CLAUDE.md for the `npx tsx`-from-root and scratch-script-cleanup conventions; `lib/analyze.ts:182-283` for `analyzeImages`'s exact signature/return shape.
- **Validate**: script output shows the two assertions passing; no crash from `DegenerateImageError` or a real network call (there should be none, since `structureFromImages` is never invoked in the no-key path).

### Task 5: Confirm route-level caching decision statically (no live server needed)

- **File**: none (code inspection, not a new script)
- **Action**: n/a
- **Implement**: Re-read the diff in `app/api/analyze/route.ts` and confirm by inspection:
  - reason `undefined` (success or `mode: "tokens"`) → `structureFailureIsTransient` is `false` → cached, same as before.
  - reason set + `aiLaneAvailable()` true (a real vision-call failure while a key *is* configured) → `structureFailureIsTransient` is `true` → not cached, same as before.
  - reason set + `aiLaneAvailable()` false (the new no-key case) → `structureFailureIsTransient` is `false` → now cached (the deliberate new behavior this issue asks for).
  A live end-to-end run isn't practical for the no-key branch specifically (it never calls out to anything), so this static walk-through is the primary verification for the caching AC, same posture as the precedent plan (`skip-cache-url-structure-failure-plan.md`'s "Optional live check" note).
- **Mirror**: `.agents/plans/completed/skip-cache-url-structure-failure-plan.md`'s "End-to-End Verification" section (same shape of static-walkthrough-as-primary-gate).
- **Validate**: n/a (reasoning check, not a command)

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Extraction regression gate — not touched by this change (no lib/extract/**
# file is modified), but run per CLAUDE.md's standing instruction; must pass
# unchanged.
npm run eval
```

## End-to-End Verification

1. **Scratch-script check (Task 4)** — the primary functional gate, since `analyzeImages` has no browser/network dependency and can be exercised directly:
   - `mode: "structure"`, no key → `structureUnavailableReason` is the new no-key message, `structureReport` is `undefined`.
   - `mode: "tokens"`, no key → `structureUnavailableReason` is `undefined`.
2. **Static diff walkthrough (Task 5)** — confirms the three caching-gate outcomes in `app/api/analyze/route.ts` by inspection, since forcing a genuine transient vision-model failure isn't practical to reproduce on demand.
3. **Frontend spot-check (optional, if time permits)**: `npm run dev`, ensure no AI key is set in the shell running the dev server, upload an image with mode `structure` or `both` via the UI, and confirm the amber banner at `app/page.tsx:347-351` renders the new message text instead of the structure tab silently being absent with no explanation.

Expected outcome: typecheck/lint/eval all pass; diff confined to `lib/analyze.ts` (the `wantsStructure` split + nested no-key branch) and `app/api/analyze/route.ts` (new import + caching-gate rewrite); no schema (`lib/schema.ts`) or frontend (`app/page.tsx`) changes required.

---

## Risks

| Risk | Mitigation | Scope |
|------|------------|-------|
| Re-deriving cacheability via a second `aiLaneAvailable()` call in `route.ts` could theoretically disagree with the check `analyzeImages` made moments earlier if env vars changed mid-request | Env vars are read from `process.env` and are effectively static for the life of a running process/request; this is the same assumption `aiLaneAvailable()` itself already makes everywhere else it's called (interpret.ts, structureAI.ts) | In scope — accepted as safe, noted in the added comment |
| Widening the no-key reason string could desync from DIST-057 (#105)'s setup-hint wording, which currently only names `GEMINI_API_KEY` | Not this issue's problem to fix (#105 is explicitly non-blocking and separately scoped to `app/page.tsx:438`); this plan uses the exact wording the issue's own technical notes proposed, which already names both env vars | Out of scope — flagged only |
| Accidentally caching a *transient* vision-model failure by loosening the gate too broadly | The gate only flips to "cacheable" when `aiLaneAvailable()` is false — a real vision-call failure only reaches this reason string while a key *is* present, so `aiLaneAvailable()` is true and the gate still skips caching for it, unchanged from today | In scope — verified by the three-case walkthrough in Task 5 |
| `mode: "tokens"` accidentally starting to request structure | `wantsStructure` is still gated on `mode === "structure" \|\| mode === "both"` — only the `&& aiLaneAvailable()` conjunct was removed, not the mode check | In scope — covered by Task 4's second assertion |
| Eval regression | No `lib/extract/**`, `lib/emit.ts`, or `lib/analyze.ts`'s measured-lane functions are touched — only `analyzeImages`'s structure-outcome branching, which the eval harness doesn't exercise at all (eval never calls `analyzeImages`) | Out of scope for eval to catch, but run `npm run eval` anyway per CLAUDE.md; must pass unchanged |

---

## Acceptance Criteria

- [ ] `mode: "structure"` or `"both"` + image input + no `GEMINI_API_KEY`/`OPENROUTER_API_KEY` → `analyzeImages` (and therefore the API response) carries a `structureUnavailableReason` naming both missing keys as the cause
- [ ] That reason renders in the workbench (already true via `app/page.tsx:347-351` — verified, not changed)
- [ ] `mode: "tokens"` + image input + no key → `structureUnavailableReason` stays `undefined`
- [ ] The image-branch caching gate deliberately caches a no-key response (persistent) while still skipping cache for a genuine transient vision-model failure — both outcomes covered by an explanatory comment
- [ ] `npm run typecheck` and `npm run lint` both pass
- [ ] `npm run eval` passes unchanged
- [ ] No scratch verification scripts left in the repo
