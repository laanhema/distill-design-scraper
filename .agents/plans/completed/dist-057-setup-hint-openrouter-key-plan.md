# Plan: Name Both AI-Key Env Vars in the Workbench Setup Hint (DIST-057)

## Summary

`app/page.tsx`'s `Preview` component renders a setup-hint paragraph (`app/page.tsx:439-451`) whenever `!meta.aiApplied` — i.e. whenever the AI lane didn't run. The hint text at line 441 tells the user to set `GEMINI_API_KEY`, but since #94/#95 `aiLaneAvailable()` (`lib/aiLane.ts:23-26`) returns true if **either** `GEMINI_API_KEY` or `OPENROUTER_API_KEY` is set, and OpenRouter wins when both are present (confirmed at full ModelCall parity by DIST-056/#104, already merged — so there is no "Gemini is the fuller-featured path" caveat to add; the issue's technical notes made that addition conditional on a degraded-fallback outcome that did not happen). This plan is a single-line copy fix in `app/page.tsx`: swap the hint's key mention from `GEMINI_API_KEY` alone to naming both env vars, reusing the "set X or Y" phrasing DIST-050 already established at `lib/analyze.ts:269` (`"...set GEMINI_API_KEY or OPENROUTER_API_KEY."`) so the two user-facing messages read consistently. Everything else about the hint — the free-key link, the `.env.local` guidance, the `(§7)` reference, the one-line length — stays as-is.

## User Story

As a user who configured OpenRouter
I want the workbench's setup hint to name every key that enables the AI lane
So that I'm not told to set a Gemini key I don't need

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT |
| Complexity | LOW |
| Systems Affected | `app/page.tsx` (`Preview` component's setup-hint paragraph) |
| GitHub Issue | #105 (DIST-057) |

---

## Patterns to Follow

### The current hint text (the bug site)

```tsx
// SOURCE: app/page.tsx:439-451
{!meta.aiApplied && (
  <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3.5 py-2 text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900/50 dark:text-neutral-400">
    💡 <strong>Setup Hint:</strong> Set <code className="font-mono text-neutral-800 dark:text-neutral-200">GEMINI_API_KEY</code> in <code className="font-mono text-neutral-800 dark:text-neutral-200">.env.local</code> to enable optional AI vision enrichment (§7). Get a free key at{" "}
    <a
      href="https://aistudio.google.com/apikey"
      target="_blank"
      rel="noreferrer"
      className="underline hover:text-neutral-900 dark:hover:text-neutral-200"
    >
      aistudio.google.com/apikey
    </a>.
  </p>
)}
```

### DIST-050's precedent wording for naming both keys (the consistency bar set by AC3)

```ts
// SOURCE: lib/analyze.ts:264-271
structureUnavailableReason:
  "Structure inference for images requires an AI key — set GEMINI_API_KEY or OPENROUTER_API_KEY." as
    | string
    | undefined,
```

### `aiLaneAvailable` — why both keys genuinely satisfy the hint (never re-implement this check elsewhere)

```ts
// SOURCE: lib/aiLane.ts:23-26
/** True when a live AI lane call is possible (an API key is configured). */
export function aiLaneAvailable(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY);
}
```

### README's provider matrix — not to be duplicated in the UI hint, only referenced implicitly

```md
# SOURCE: README.md:67-71 (full provider matrix — the hint stays a one-liner, per the issue's technical notes)
- **Google Gemini** — `GEMINI_API_KEY`, model defaults to `gemini-3.5-flash`, overridable via `GEMINI_MODEL`. A free-tier key with no credit card required is available at https://aistudio.google.com/apikey.
- **OpenRouter** — `OPENROUTER_API_KEY`, model selectable via `OPENROUTER_MODEL` (defaults to `google/gemini-3.5-flash`).

If **both** keys are set, OpenRouter wins.
```

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `app/page.tsx` | UPDATE | Change the setup-hint paragraph (lines ~439-451) to name both `GEMINI_API_KEY` and `OPENROUTER_API_KEY` |

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Update the setup-hint copy to name both env vars

- **File**: `app/page.tsx`
- **Action**: UPDATE
- **Implement**: Replace the text run inside the hint `<p>` (lines 441-449) so it reads both keys. Keep the exact same JSX structure (same wrapper `<p>`, same `<code>` styling classes, same `<a>` link, same `(§7)` reference) — only change the sentence content:

  ```tsx
  💡 <strong>Setup Hint:</strong> Set <code className="font-mono text-neutral-800 dark:text-neutral-200">GEMINI_API_KEY</code> or <code className="font-mono text-neutral-800 dark:text-neutral-200">OPENROUTER_API_KEY</code> in <code className="font-mono text-neutral-800 dark:text-neutral-200">.env.local</code> to enable optional AI vision enrichment (§7). Get a free Gemini key at{" "}
  <a
    href="https://aistudio.google.com/apikey"
    target="_blank"
    rel="noreferrer"
    className="underline hover:text-neutral-900 dark:hover:text-neutral-200"
  >
    aistudio.google.com/apikey
  </a>.
  ```

  Notes on the wording choices, to keep this a mechanical, low-risk edit:
  - `Set GEMINI_API_KEY or OPENROUTER_API_KEY in .env.local` mirrors DIST-050's `"...set GEMINI_API_KEY or OPENROUTER_API_KEY."` phrasing (AC3: consistency with `structureUnavailableReason`).
  - `Get a free Gemini key at` (rather than the prior "Get a free key at") makes the link's scope explicit now that two providers are named — the link only ever pointed at Google AI Studio, so without this the reader could wrongly infer the link issues an OpenRouter key too. This is the minimal disambiguation, not new documentation — it's still one sentence, one line of rendered text.
  - No sentence is added about Gemini being "fuller-featured": DIST-056 (#104) already landed full ModelCall-contract parity between the two providers (see `.agents/plans/completed/dist-056-openrouter-modelcall-parity-plan.md`), so the issue's conditional ("if DIST-056 lands the degraded-fallback outcome...") does not apply — nothing to caveat.
  - The `(§7)` reference and the overall one-paragraph/one-line-of-rendered-text shape are unchanged, matching the issue's "keep it to one line — this is a hint, not documentation" instruction.
- **Mirror**: the existing JSX being edited, `app/page.tsx:439-451` — same tag structure, only text content changes.
- **Validate**: `npm run typecheck`

### Task 2: Verify wording consistency and full-file correctness

- **File**: none (inspection only)
- **Action**: n/a
- **Implement**: Re-read the edited block in `app/page.tsx` and confirm against each acceptance criterion:
  1. Both `GEMINI_API_KEY` and `OPENROUTER_API_KEY` are named.
  2. The `aistudio.google.com/apikey` link and surrounding "free key" wording are still present.
  3. `.env.local` guidance is still present.
  4. The sentence structure ("set GEMINI_API_KEY or OPENROUTER_API_KEY") matches DIST-050's `lib/analyze.ts:269` wording closely enough to read as one consistent voice across the app.
  5. The hint is still exactly one rendered paragraph/line, no added sentences.
- **Mirror**: n/a
- **Validate**: manual read-through; no command

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint
```

`npm run eval` is not required — no `lib/extract/**`, `lib/emit.ts`, or `lib/analyze.ts` file is touched; this change is confined to a JSX text node in `app/page.tsx`.

## End-to-End Verification

1. **Static read-through (primary gate for this change)**: confirm the new hint text against all four acceptance criteria (Task 2) — this is a pure copy change with no branching logic, so a live render adds little beyond what inspection already confirms.
2. **Optional visual spot-check**: `npm run dev`, ensure no AI key is set in the shell running the dev server, submit any URL or image, and confirm the amber-neutral setup-hint box under the meta `<dl>` now reads the updated two-key text and still renders the working link to `aistudio.google.com/apikey`.

Expected outcome: `npm run typecheck` and `npm run lint` pass unchanged; diff confined to the text content of the `<p>` block at `app/page.tsx:439-451`; no schema, API route, or extraction-lane changes.

---

## Risks

| Risk | Mitigation | Scope |
|------|------------|-------|
| Wording drifts from DIST-050's `structureUnavailableReason` phrasing, reintroducing the inconsistency this issue exists to fix | Reuse the exact "set GEMINI_API_KEY or OPENROUTER_API_KEY" clause from `lib/analyze.ts:269` verbatim inside the hint sentence | In scope — addressed directly in Task 1 |
| Hint grows past "one line, not documentation" per the issue's technical notes | Only the key names and one disambiguating word ("Gemini" before "key") are added; no new sentence, no provider-comparison prose | In scope — verified in Task 2 |
| Someone later assumes DIST-056 landed a degraded-fallback outcome and re-adds a "Gemini is fuller-featured" caveat | Plan explicitly documents (in Summary and Task 1) that DIST-056/#104 landed full parity, citing its completed plan file, so the conditional in #105's technical notes is settled as "not applicable" rather than left ambiguous for a future editor | Out of scope to re-litigate, but flagged with evidence |
| JSX whitespace/`{" "}` token before the link gets dropped during the edit, collapsing "at" and the link together with no space | Keep the exact `{" "}` token and line break from the original, only touch the sentence text before it | In scope — call out explicitly in the diff review |

---

## Acceptance Criteria

- [ ] Given no AI key is set, the hint names both `GEMINI_API_KEY` and `OPENROUTER_API_KEY` as ways to enable the lane
- [ ] The hint still links to the free Gemini key source (`aistudio.google.com/apikey`) and keeps the `.env.local` guidance
- [ ] The wording is consistent with DIST-050's `structureUnavailableReason` message about which keys enable the lane
- [ ] `npm run typecheck` passes
- [ ] `npm run lint` passes
- [ ] Diff confined to `app/page.tsx`
