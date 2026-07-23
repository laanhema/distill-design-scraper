# Plan: Spike — report-to-code: starter Tailwind theme / CSS from frontmatter (DIST-006)

## Summary

Time-boxed spike prototyping a generator that turns a validated `Report` object into a starter
Tailwind v4 `@theme` file and/or a plain `:root` custom-property file, mirroring the
`renderCssVariables` precedent in `lib/emit.ts`: every emitted value traces 1:1 to an existing
frontmatter field, unmeasured lanes are omitted (never defaulted), and no schema surface is added.
Per the DIST-005 spike precedent (`.agents/reports/motion-spike.md`, commit `b460275`), the
committed deliverable is a **write-up only** — the prototype lives in the scratchpad, is exercised
against real reports replayed offline from the eval corpus, spot-checked in a fresh Tailwind v4
project, and its findings + delivery-surface recommendation land in
`.agents/reports/tailwind-theme-spike-report.md`. No `lib/` changes, no `eval/corpus` changes.

## User Story

As a frontend developer
I want a generated starter Tailwind theme (or plain CSS custom-property file) derived from the design report's frontmatter
So that adopting an extracted design system is a file drop instead of manual transcription.

## Metadata

| Field | Value |
|-------|-------|
| Type | SPIKE (research prototype + write-up; no production code committed) |
| Complexity | MEDIUM (time-boxed 1–2 days) |
| Systems Affected | none committed — prototype touches emit-shaped code only in scratchpad; write-up in `.agents/reports/` |
| GitHub Issue | #7 |

---

## Patterns to Follow

### The 1:1-traceability precedent — `renderCssVariables`

```ts
// SOURCE: lib/emit.ts:296-338
function renderCssVariables(report: Report): string {
  const lines: string[] = ["## CSS variables", "", "```css", ":root {"];
  for (const c of report.palette.colors) {
    lines.push(`  --color-${c.role}: ${c.hex};`);
  }
  if (report.typography) { /* --font-family, --font-size-<token>, --font-weight-<token>, ... */ }
  if (report.spacing)    { /* --space-<i>: <px>px */ }
  if (report.radius)     { /* --radius-<i> */ }
  if (report.elevation)  { /* --shadow-<name> */ }
  lines.push("}", "```");
  return lines.join("\n");
}
```

Every lane is guarded by `if (report.<field>)` — an absent lane emits nothing. The Tailwind
emitter must follow this exactly (acceptance criterion 2). Also reuse `cssFontName`
(`lib/emit.ts:286-288`) semantics for quoting family names.

### Offline report replay (how to get real `Report` objects without a browser)

```ts
// SOURCE: eval/run.ts:4,52
import { extractFromCapture, type Capture } from "@/lib/analyze";
const { report } = await extractFromCapture(capture); // capture = eval/corpus/<slug>/capture.json
```

Corpus slugs available: `clean-light`, `dark-mode` (the latter exercises `paletteDark`).

### Scratch-script conventions

- Run with `npx tsx` **from the project root** (CLAUDE.md: tsx resolves `node_modules` relative to
  the script location — running from `/tmp` fails). Keep the script in the session scratchpad;
  delete nothing from the repo because nothing lands in the repo.
- No browser needed: `extractFromCapture` is deliberately offline; no SSRF allowlist required.

### Spike write-up shape

```
// SOURCE: .agents/reports/motion-spike.md (DIST-005 precedent)
Findings → prototype description → proposed (not implemented) shape → go/no-go recommendation
```

Naming: recent reports use `<kebab-name>-report.md` (e.g.
`motion-transition-token-spike-report.md`) — use `tailwind-theme-spike-report.md`.

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `<scratchpad>/spike-tailwind-theme.ts` | CREATE (scratch, not committed) | Prototype `emitTailwindTheme(report)` / `emitThemeCss(report)` + corpus replay driver |
| `<scratchpad>/tw-spotcheck/` | CREATE (scratch, not committed) | Fresh Tailwind v4 project for the build spot-check |
| `.agents/reports/tailwind-theme-spike-report.md` | CREATE | The spike deliverable: findings, mapping table, spot-check result, recommendation |

No `lib/`, `app/`, `eval/` changes. `npm run eval` must pass byte-identical to baseline.

---

## Tasks

### Task 1: Prototype the emitter in scratchpad

- **File**: `<scratchpad>/spike-tailwind-theme.ts`
- **Action**: CREATE
- **Implement**: An `emitTailwindTheme(report: Report): string` producing a Tailwind v4
  `@theme { … }` block, and (same script) an `emitThemeCss(report: Report): string` producing the
  plain `:root { … }` variant, both derived **only** from fields the report actually carries:
  - `palette.colors` → `--color-<role>: <hex>` (Tailwind v4 `--color-*` namespace → generates
    `bg-<role>`, `text-<role>`, etc. utilities for free).
  - `typography.families[0]` → `--font-<role>` with the full measured `stack` (reuse the
    `cssFontName` quoting rule). `typography.scale` → `--text-<token>: <sizePx>px` (v4 font-size
    namespace); weight/line-height/letter-spacing → `--font-weight-<token>` / `--leading-<token>` /
    `--tracking-<token>`. Decide during the spike whether `sizePxMobile` is expressible without
    inventing a breakpoint (if not: omit and document — do not fabricate a `--breakpoint-*`).
  - `spacing.scale` → `--spacing-<i>` (or document why v4's single `--spacing` base unit +
    `baseUnitPx` is/isn't the better mapping — `baseUnitPx` is a real frontmatter field, so either
    is traceable).
  - `radius.scale` → `--radius-<i>`; `elevation.shadows` → `--shadow-<name>`.
  - `paletteDark` → decide the honest mapping: `@theme` has no dark variant, so likely a
    `@media (prefers-color-scheme: dark) { :root { … } }` override block appended after the theme,
    emitted **only when `paletteDark` exists**. Document the choice.
  - `recipes` / `states` / `identity` / `imageMood` → explicitly out of scope for a *token* theme
    file; write up why (component-level, not theme tokens) rather than force a mapping.
  - Header comment in the generated file citing source URL + `capturedAt` (both are frontmatter
    fields, so this stays 1:1).
- **Mirror**: `lib/emit.ts:296-338` — same conditional-lane structure, same value formatting.
- **Validate**: script runs via `npx tsx` from project root; visually inspect output.

### Task 2: Exercise against real + degenerate reports

- **File**: same scratch script (driver section)
- **Action**: UPDATE
- **Implement**: Replay both corpus captures (`eval/corpus/clean-light/capture.json`,
  `eval/corpus/dark-mode/capture.json`) through `extractFromCapture` → generate both output
  flavors per report and write them to the scratchpad. Then strip optional lanes off a copy
  (`delete report.typography`, `paletteDark`, `spacing`, `radius`, `elevation`) and confirm the
  corresponding output sections vanish entirely (acceptance criterion 2) — assert, don't eyeball.
- **Mirror**: `eval/run.ts:52` for the replay; `buildReport`'s spread-conditional style
  (`lib/emit.ts:41-55`) for constructing the stripped variant.
- **Validate**: driver exits 0 with assertions passing.

### Task 3: Spot-check in a fresh Tailwind v4 project

- **File**: `<scratchpad>/tw-spotcheck/`
- **Action**: CREATE
- **Implement**: Minimal fresh project — `package.json` + `npm install tailwindcss @tailwindcss/cli`
  (repo already pins `tailwindcss ^4.0.0`; if network is a problem, `npm install
  /home/lauri/github/distill-design-scraper/node_modules/tailwindcss` or reuse the repo install).
  `input.css` = `@import "tailwindcss";` + the generated `@theme` file's contents; a small
  `index.html` using a few generated utilities (`bg-primary`, `text-h1`-ish classes as actually
  generated). Run `npx @tailwindcss/cli -i input.css -o out.css` and verify it builds without
  errors and the expected utilities/values appear in `out.css`. Record exact commands + output
  summary for the write-up (acceptance criterion 4).
- **Validate**: build exits 0; generated values present in `out.css`.

### Task 4: Write the spike report

- **File**: `.agents/reports/tailwind-theme-spike-report.md`
- **Action**: CREATE
- **Implement**: Following the `motion-spike.md` structure:
  1. **Findings** — the full frontmatter-field → theme-variable mapping table, flagging every
     field that has no honest mapping (and why it's omitted, not defaulted).
  2. **Prototype** — what was built, sample output for both corpus sites (including the
     dark-palette handling), the omission-behavior assertion results.
  3. **Spot-check** — fresh-project build commands + result.
  4. **Recommendation** (acceptance criterion 3) — delivery surface: candidates are
     (a) a new exported `emitTailwindTheme(report)` in `lib/emit.ts` + a second download button in
     `app/page.tsx` next to `downloadActiveMarkdown` (`app/page.tsx:133-148`), (b) a fourth tab
     (`app/page.tsx:55` — `"preview" | "tokens" | "structure"`), (c) appending a fenced block to
     the markdown body like `renderCssVariables`. State which one, whether Tailwind v4 `@theme`,
     plain `:root`, or both ship, and confirm it stays a **derived view — no schema change**
     (expected outcome given the precedent, but the spike must say so explicitly). Go/no-go for a
     follow-up implementation story.
- **Mirror**: `.agents/reports/motion-spike.md`
- **Validate**: report covers all four acceptance criteria from issue #7.

### Task 5: Repo-cleanliness validation

- **File**: n/a
- **Action**: VERIFY
- **Implement**: Confirm `git status` shows only the new report file; scratch artifacts stay in
  the scratchpad. Run the validation commands below — all must pass with **zero baseline change**
  (this spike touches no extraction code, so `UPDATE_BASELINE` must not be used).
- **Validate**: see below.

---

## Validation

```bash
npm run typecheck   # tsc --noEmit — must pass (should be a no-op: no lib/ changes)
npm run lint        # next lint — must pass
npm run eval        # regression gate — must pass against the untouched baseline
```

---

## Risks

| Risk | Mitigation |
|------|------------|
| Tailwind v4 `@theme` namespace mismatch (guessed variable names don't generate utilities) | The spot-check project is the ground truth — verify utilities actually appear in `out.css`, adjust namespaces from Tailwind docs, and record the verified mapping in the write-up |
| `spacing`/`radius` scales are positional (`--space-1..n`) which Tailwind v4 treats differently than its default numeric spacing scale | Prototype both mappings if ambiguous; the write-up recommends one — this is exactly the kind of question the spike exists to answer |
| `paletteDark`/`sizePxMobile` tempt invented structure (breakpoints, dark variants) | Hard rule from CLAUDE.md: omit rather than fabricate; document each omission in the findings table |
| Scope creep into implementing the production emitter/UI | DIST-005 precedent: deliverable is the report; the recommendation section spawns a follow-up story instead |
| Fresh-project install needs network | Fall back to installing from the repo's `node_modules` copy of `tailwindcss`/`@tailwindcss/postcss` |

---

## Acceptance Criteria

- [ ] Prototype emits valid Tailwind v4 `@theme` and/or `:root` CSS where every value traces 1:1 to an existing frontmatter field — zero invented values
- [ ] Unmeasured lanes produce omitted output sections (asserted, not just eyeballed)
- [ ] Write-up recommends delivery surface + derived-view-vs-schema-change, with go/no-go
- [ ] Generated output builds without errors in a fresh Tailwind project (documented spot-check)
- [ ] `npm run typecheck`, `npm run lint`, `npm run eval` all pass with no baseline change
- [ ] Only `.agents/reports/tailwind-theme-spike-report.md` is new in the repo
