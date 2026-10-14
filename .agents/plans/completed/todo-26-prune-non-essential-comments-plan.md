# Plan: TODO-26: Prune non-essential comments across the codebase

## Summary

The sources under `lib/`, `app/` and `eval/` carry 1,957 comment lines in 51 TypeScript files plus `app/distill-theme.css`. Much of that is narration. There are 197 comments that cite planning artifacts no reader can follow: 123 `§` sections of a PRD numbering that `.agents/PRDs/PRD.md` no longer has (`§P5-2` and `§P8-3` match nothing there), plus `DIST-0nn` ids, `#nn` issue numbers, `Phase N` labels and `P3-1` item codes. Other comments retell history ("An earlier revision of this file…", "The old 1024 was…", "same as before this fix") or restate the next line ("Sort clusters by area weight descending", "Cleanup temporary attribute"). This plan prunes those comments. It keeps every comment that carries a *why*: the security and bounded-resource invariants (SSRF, DNS rebinding, body and rate limits, cache bounds), the Playwright and Chromium workarounds, the color-math and threshold rationale, the "measured, never faked" omission points, the ordering constraints, and the AI-lane provider facts.

No code, type or string changes. A scratch gate (End-to-End Verification §1, verbatim) proves it. The gate parses each file at `main` and in the working tree and compares the token streams with comments ignored, so any change to code, types or string contents fails it. It also fails while any planning or ticket reference is left in a comment, fails when a listed essential comment goes missing, and fails when a tool directive (`eslint-disable-next-line`, `@deprecated`) changes. Run on `main`, it exits 1 because of the 197 references. The heaviest file, `lib/ingest.ts`, was pruned while planning as a worked sample of the rubric and saved as the prototype patch (Metadata). `/implement` applies it first. The tasks below cover the other files. Every `file:line` in this plan is a line of `main` at `37f57d8`, before the patch.

Measured while planning, on `main` at `37f57d8`:

- Comment inventory (scratch `node` script using the repo's `typescript`): 962 comment ranges, which merge into 598 comment blocks. The heaviest files by comment lines (`grep -cE '^\s*(//|/\*|\*)'`) are `lib/ingest.ts` 153, `lib/extract/styleDump.ts` 136, `lib/extract/palette.ts` 103, `lib/aiLane.ts` 98, `lib/extract/structureSchema.ts` 85, `lib/interpret.ts` 84 and `lib/schema.ts` 72.
- The gate on `main`, unchanged: `ok` for files added/removed, scope, code identity and directives; `FAIL no planning or ticket reference left in a comment: 197 found`; `ok essential comments kept`; `info … 1957 on main, 1957 now (0% fewer)`; exit 1.
- The gate on `main` plus the prototype patch: the same, except `186 found` and `1957 on HEAD, 1869 now (4% fewer)`. `npx tsc --noEmit` exits 0, `npx eslint lib/ingest.ts` exits 0, and `npx tsx eval/run.ts` prints `combined 100%` for `clean-light`, `dark-mode` and `adversarial-shell`, `aggregate combined: 100%`, `✓ all gates passed`. Start green, stay green.
- Negative controls of the gate, run on the prototype worktree. Each line failed or passed as stated:
  - Deleting a JSX comment (`app/page.tsx:369`): code identity stays `ok`.
  - Changing `30_000` to `31_000`: code identity `FAIL lib/ingest.ts`.
  - Widening `elapsedMs: number` to `number | undefined`: `FAIL` (types are covered).
  - Changing one word inside the `SYSTEM_PROMPT` template of `lib/interpret.ts`: `FAIL` (string contents are covered).
  - Deleting the `eslint-disable-next-line` at `app/page.tsx:302`: directives `FAIL app/page.tsx`.
  - Deleting the `MERGE_DELTA_E` comment (`lib/extract/palette.ts:37-40`): essential `FAIL … MERGE_DELTA_E`. The module header above it does not count, because a blank line separates it.
  - Deleting the `page.route()` paragraph of the redirect guard: essential `FAIL … /route\(\)/; … /34994/`.
  - Deleting a CSS comment: `ok`. Changing `@theme inline` to `@theme`: `FAIL app/distill-theme.css`.
- `npm run check` and `npm run eval` read every changed file. But eval replays captures offline, so it never executes the in-page code (`page.evaluate` callbacks in `lib/extract/styleDump.ts` and `lib/extract/structure/harvester.ts`, and the `createStateScanner` source that is serialized with `.toString()` and rebuilt in the page with `new Function`), nor `lib/ingest.ts`, the route or the UI. The gate proves the token streams identical. The verify scenarios of End-to-End Verification §2 execute those paths.
- Nothing outside the code points at a comment: `docs/`, `AGENTS.md`, `README.md`, `PROJECT-GUIDE.md` and the verify skill hold no `file:line` reference into `lib/`, `app/` or `eval/`, and no "see the comment" pointer. Inside the code there are two such pointers:
  - `lib/aiLane.ts:142` says "see its doc comment below" about `parseJsonLoose`. That doc comment is on the keep list.
  - `lib/extract/structure/squash.ts:84` cites `pruner.ts:42-46`. That reference is already stale: the sticky/fixed suffix is at `lib/extract/structure/pruner.ts:35-41`. Task 5 replaces it with the symbol `pruneAndCollapse`.
- One comment contradicts the code. The `lib/extract/palette.ts:28` header says Stage B merges at "ΔE ≈ 2.5", but `MERGE_DELTA_E = 1.5` (`:41`). The 2.5 is the image lane's `MERGE_DELTA_E` (`lib/extract/imagePalette.ts:22`). Task 4 corrects it.
- Forward references to #212: none in source, docs or prior plans. Only `.agents/issues/todo-issues.md:1022` (the issue entry) and two reports name it.
- `§` also appears in strings, which are not comments: the `eval/run.ts` banner prints `measured lane (§10)`. Strings are out of scope, because changing one changes output, and the gate fails if one changes.

Decisions (none changes a result):

- **Ticket and planning references go, the reasons stay.** Strip `§…`, `DIST-nnn`, `TODO-n`, `#nn`, `issue #nn`, `review S6`, `code review finding #3`, `Phase N` and `Pn-m` from comments. Where the reference backed a fact (e.g. `#209`: "temperature 0 alone did not repeat the reply until a seed was sent"), keep the fact in words. The trail lives in `git log` / `git blame`. An upstream reference that proves a third-party behavior stays: `microsoft/playwright#34994` (the gate's `#nn` rule skips a reference preceded by `/`).
- **Stage names stay.** "Stage 4b", "Stage 7", "Stage E" and "Stage A–D" are the vocabulary of `docs/architecture/structure-lane.md:3-10` and `docs/architecture/orchestration.md:3`, so the stage labels in `lib/extract/structure/index.ts`, `lib/extract/palette.ts` and `lib/extract/imagePalette.ts` and the stage-table headers stay, without their `§` suffixes. "Track A"/"Track B" also stay (`orchestration.md:3`).
- **Empty `catch {}` is fine.** Removing a "try the next pattern" comment leaves `} catch {}`. ESLint passes, and `lib/extract/structure/structureEmit.ts:117` already has one. Keep the comment only when it says *why* swallowing is safe and the code does not show it.
- **Out of scope: everything outside `lib/`, `app/`, `eval/` and the comments in non-code files.** That covers `next.config.mjs`, `Dockerfile`, `scripts/`, `.claude/skills/verify/scripts/`, `eval/corpus/*/expected.yaml` (`AGENTS.md` says `adversarial-shell/expected.yaml` documents why it asserts the correct names), `eval/fixtures/*` and `app/distill-theme.css`. The CSS file's two comments are a usage note and a *why* (`inline`), so it stays unchanged. The gate fails on any changed file outside the three directories (except `.agents/` and `TODO.md`).

## User Story

As a maintainer of Distill (human or agent)
I want each comment in the code to say something the code cannot
So that the comments that guard an invariant stand out instead of drowning in narration and dead references

## Metadata

| Field | Value |
|-------|-------|
| Type | REFACTOR |
| Complexity | MEDIUM |
| Systems Affected | comments only, in `lib/**` (ingestion, security, cache, AI lane, tokens lane, structure lane, schema, emit, orchestration), `app/page.tsx`, `app/api/analyze/route.ts`, `eval/*.ts` |
| GitHub Issue | #212 |
| PRD Phase | N/A |
| Prototype Patch | `.agents/plans/todo-26-prune-non-essential-comments-prototype.patch` (covers `lib/ingest.ts` only) |

---

## Environment Findings

| Probe | Result |
|---|---|
| `typescript` for scratch scripts | Resolved with `createRequire("/home/lauri/github/distill-design-scraper/package.json")`. A script in the scratch dir runs with plain `node` from any directory, and `tsx` is not needed |
| Gate on `main` | exit 1, `197 found` references, all other checks `ok` |
| Gate on `main` + patch | exit 1, `186 found`, `1957 → 1869` comment lines |
| `tsc --noEmit`, `eslint lib/ingest.ts`, `tsx eval/run.ts` on `main` + patch | exit 0 / 0 / 0, eval 100% on all three fixtures |
| `git apply --check` of the patch on `main` | passes; no `PROTO` line |
| Verify scenarios | `analyze-url`, `tabs-downloads`, `tab-layout`, `analyze-images`, `error`, `cross-origin` (`.claude/skills/verify/SKILL.md`). All use local fixtures with the AI lane off, so no network and no paid calls |

---

## Patterns to Follow

### Keep: a comment that gives the reason for a value

```ts
// SOURCE: lib/extract/palette.ts:37-41
// Stage B near-duplicate threshold. Kept low (near the just-noticeable ΔE)
// because real design systems place `background` and `surface` only 2–4 ΔE
// apart on purpose — a looser merge collapses that pair and loses `surface`.
// DOM colors are exact strings, so genuine duplicates sit at ΔE≈0 anyway.
const MERGE_DELTA_E = 1.5;
```

### Keep: a browser workaround that the code alone would invite someone to "fix"

```ts
// SOURCE: lib/extract/styleDump.ts:403-406
      // `in`, not `instanceof HTMLInputElement`: an element that a script
      // created in another frame's document and moved here is no instance of
      // this window's classes, but it does carry `type`.
      if (el.tagName === "INPUT" && "type" in el) {
```

### Keep the reason, drop the ticket

```ts
// SOURCE: lib/interpret.ts:46-50 (before)
// Temperature 0 is not enough on the code default `google/gemini-3.5-flash`:
// the same request still got a different reading on each call until a seed was
// sent (#209). 7 is the only value measured; after changing it, rerun
// `npm run eval:ai`.
```

After: the same sentences without ` (#209)`.

### Remove: a comment that restates the code or a self-describing name

```ts
// SOURCE: lib/extract/imagePalette.ts:173-176
  // Sort clusters by area weight descending
  ...
  // Step 2: Assign roles to top clusters
```

```ts
// SOURCE: lib/extract/styleDump.ts:796
    // Cleanup temporary attribute
```

### Condense: a history essay down to the invariant

The worked example is the prototype patch for `lib/ingest.ts`. It cuts the 45-line redirect-guard essay (`lib/ingest.ts:363-407`) to three short paragraphs: why the validations are awaited, why `page.route()` cannot replace them (with `microsoft/playwright#34994`), and the residual DNS-rebinding gap. It cuts the `panoramaShot` doc (`:41-52`) to "deliberately not `fullPage: true`, which duplicates fixed/sticky elements; don't switch to it", without the DIST-051 history. And it removes the field docs that repeat the field name (`title`, `viewport`, `elapsedMs`, `bannerDismissed`, `navTimeoutMs`).

### Rubric (apply to every comment)

1. **Keep** a comment that says why, what must not change, or what would break. That covers: security and resource bounds; browser, Playwright and bundler workarounds; thresholds and their measurements; ordering constraints ("check before the generic Button branch"); drift guards ("one source, so the two can't disagree"); "omitted, never faked" decisions at the point of omission; the AI provider's observed behavior; units the name does not carry (`// tokens/ms`); and a field doc on an exported type when the field name does not say what the value means (`areaWeight`, `imageSourced`, `provenance` on a swatch).
2. **Drop** every planning or ticket reference from a kept comment, rewording so the sentence still reads.
3. **Drop** history: what the code used to do, what an earlier fix changed, which phase delivered it. If the history *is* the reason (a known-bad alternative), keep it as a present-tense warning ("deliberately not X, which does Y").
4. **Remove** a comment that only restates the next statement, the function or field name, or the type.
5. **Condense** a long comment to its invariant. Prefer one or two sentences. Keep the security comments complete in substance.
6. **Collapse a repeated rationale.** A rationale stated in two places stays once; the other place gets a short pointer or nothing. Two examples: the "don't cache a transient structure failure" note at `app/api/analyze/route.ts:202` and `:245`, and the "structure-only caller skips the AI pass" note at `lib/analyze.ts:254` and `:365`. The three prompt-injection notes stay, one at each call site, because each names its own input.
7. **Fix** a comment that contradicts the code. Do not delete it to make the problem go away.
8. **Never touch** code, strings, template literals, `eslint-disable-next-line` (`app/page.tsx:302,655,665`) or `@deprecated` (`app/api/analyze/route.ts:53`).

---

## Files to Change

| File | Action | Covered by the patch? |
|------|--------|---------|
| `lib/ingest.ts` | UPDATE | yes, completely |
| `app/api/analyze/route.ts`, `lib/api.ts`, `lib/cache.ts`, `lib/env.ts`, `lib/security/ssrfGuard.ts`, `lib/security/rateLimiter.ts` | UPDATE | no (Task 2) |
| `lib/aiLane.ts`, `lib/interpret.ts`, `lib/extract/structure/structureAI.ts`, `lib/extract/structureFromImage.ts` | UPDATE | no (Task 3) |
| `lib/extract/styleDump.ts`, `palette.ts`, `imagePalette.ts`, `typography.ts`, `tokens.ts`, `recipes.ts`, `states.ts`, `motion.ts`, `mode.ts`, `roleMatch.ts`, `imageMediaType.ts`, `lib/color.ts` | UPDATE | no (Task 4) |
| `lib/extract/structureSchema.ts`, `lib/extract/structure/*.ts` (all 15) | UPDATE | no (Task 5) |
| `lib/schema.ts`, `lib/emit.ts`, `lib/emitTailwind.ts`, `lib/analyze.ts` | UPDATE | no (Task 6) |
| `app/page.tsx` | UPDATE | no (Task 7) |
| `eval/run.ts`, `eval/score.ts`, `eval/scoreStructure.ts`, `eval/stability.ts`, `eval/corpus.ts`, `eval/capture.ts` | UPDATE | no (Task 8) |
| `app/distill-theme.css`, `app/layout.tsx`, `app/globals.css` | none (no comment to prune; the CSS file's two comments are kept) | n/a |

---

## Tasks

Execute in order. Each task is atomic and verifiable. `GATE` below means `node <scratch>/check-comments.mjs main`, with the script of End-to-End Verification §1 saved to the session's scratch dir. `REFS <path…>` means `SHOW=999 node <scratch>/check-comments.mjs main | grep -E '^ {7}(<path>|<path>…)' | wc -l`; it must print `0` for the task's files.

### Task 1: Save the gate and confirm the starting point

- **File**: `<scratch>/check-comments.mjs` (scratch only; never in the repo)
- **Action**: CHECK
- **Implement**: Write the script of End-to-End Verification §1 to the scratch dir. Run it with the patch applied.
- **Validate**: `GATE` prints `ok` for the first four checks, `FAIL … 186 found`, `ok essential comments kept`, and `info … 1957 on main, 1869 now (4% fewer)`, and exits 1. Any other `FAIL` means the patch did not apply cleanly. Stop and report.

### Task 2: Security, API route, cache, env

- **File**: `app/api/analyze/route.ts`, `lib/api.ts`, `lib/cache.ts`, `lib/env.ts`, `lib/security/ssrfGuard.ts`, `lib/security/rateLimiter.ts`
- **Action**: UPDATE (comments only)
- **Implement**:
  - `route.ts`:
    - Keep `:24`, `:26`, `:34-41` (the body ceiling), `:68-73`, `:89`, `:134`, `:161`, `:259` and `:267` (the generic error message).
    - `:30`: drop the "MAX_IMAGES is imported…" sentence.
    - `:63`: drop "was the original gap" and keep the multi-token MIME reason.
    - `:194`: drop `(#179)`.
    - `:202`: keep the transient-vs-persistent reasoning and drop `(§ code review finding #3)` and `(DIST-050)`.
    - `:245`: shorten to one line pointing at the image path's rule (rubric 6).
    - `:218`: remove (it restates the code).
    - `:267`: drop `§9:` and `(issue #27 / review S6)`.
  - `lib/api.ts`: `:4` drop `(DIST-071, TODO-7)` and keep the type-only-import reason; `:20` drop `(#179)`; `:36` drop `§P6-2 step 2`.
  - `lib/cache.ts`:
    - `:3`: drop `Phase 5:` and `(§9)`, and drop the history clause "since expiry was only ever checked on read". Keep the three bounding mechanisms, condensed.
    - Remove `:29`'s trailing `// 10 minutes` (the expression shows it), `:37` and `:44`, which restate the names.
    - Keep `:29-33` (the cap rationale), `:54`, `:75`, `:86`, `:95`, `:99` and `:110`.
  - `lib/env.ts`: `:1` drop `(§6 "Bounded everything")` and the "Used by" list, and keep the purpose; `:11` remove; `:20` keep.
  - `lib/security/rateLimiter.ts`:
    - Keep the header, `:74` and `:120` (`tokens/ms`).
    - `:82`: drop "the AC calls out".
    - `:101`: drop "the AC requires" and keep the env-var list and defaults.
    - `:18`: shorten.
  - `lib/security/ssrfGuard.ts`:
    - Keep the header (DNS rebinding, fail closed, egress filtering) and every range comment.
    - Drop the three `(DIST-073)`.
    - Reword "Beyond the literal AC list" (`:54`) and "Not in the AC's literal list" (`:140`) as the reason ("same class of reserved address…").
    - Remove `:82` ("Expand `::` shorthand…"), which restates the next lines.
- **Mirror**: the patch's `lib/ingest.ts`; the rubric above
- **Validate**: `npm run typecheck && npm run lint`, then `GATE` (code identity, directives and essential checks `ok`), then `REFS app/api/analyze/route.ts lib/api.ts lib/cache.ts lib/env.ts lib/security/` → `0`

### Task 3: AI lane

- **File**: `lib/aiLane.ts`, `lib/interpret.ts`, `lib/extract/structure/structureAI.ts`, `lib/extract/structureFromImage.ts`
- **Action**: UPDATE (comments only)
- **Implement**:
  - `lib/aiLane.ts`:
    - Keep the header (the only file that talks to a provider), condensed.
    - Keep `:21` and `:25`, and keep `:27`, `:33` and `:39` (the `max_tokens`, temperature and seed facts) without `(#209)`.
    - Keep `:50`, `:57` (without "named in issue #104's technical-notes comment"), `:75` and `:134` (the non-strict reason, including the pointer to `parseJsonLoose`).
    - Keep `:159` without `#207` and "as before", and keep `:193`.
    - `:206`: drop the "ΔE-matcher precedent" sentence and keep "never validates shape; Zod is the gate".
    - Keep `:231`.
    - Remove `:14`, `:19`, `:220` and `:253`, which restate names or code.
  - `lib/interpret.ts`:
    - Header: drop the `§` refs and condense the two paragraphs to the grounding rule and the fallback rule.
    - `:32` (`MAX_TOKENS`): drop "The old 1024 was sized…" and keep "thinking shares the budget and no thinking cap is sent, so 2048 covers prelude plus answer".
    - `:40`: drop `(#200)`. `:46`: drop `(#209)`.
    - `:62` (`OUTPUT_SCHEMA`): drop "It used to be a hand-written copy… (#177)", and keep "generated from the Zod gate", the non-strict caveat and the `io: "output"` paragraph.
    - `:86`, `:96`, `:100`, `:172`, `:185` and `:205`: drop the `§` refs.
    - `:138`: keep the prompt-injection note without `(issue #27 / review S6)`.
    - Remove `:132` and `:257`.
  - `structureAI.ts`:
    - Drop the refs at `:23`, `:30`, `:69`, `:76`, `:80`, `:180` and `:196`.
    - Keep `:115` (prompt injection) without its ref.
    - Keep `:86`, `:109`, `:228`, `:285`, `:293` and `:297`.
    - Remove `:201`, `:211`, `:215`, `:225` and `:242`.
  - `structureFromImage.ts`:
    - `:9`: drop `§P6-2 step 2 —`.
    - `:139`: drop `(§6/§9 fallback convention…)` and keep "returns null, never throws".
    - Keep `:154` without its ref.
    - Keep the rest.
- **Mirror**: the "keep the reason, drop the ticket" pattern above
- **Validate**: `npm run typecheck && npm run lint`, `GATE`, `REFS lib/aiLane.ts lib/interpret.ts lib/extract/structure/structureAI.ts lib/extract/structureFromImage.ts` → `0`

### Task 4: Tokens lane and style dump

- **File**: `lib/extract/styleDump.ts`, `palette.ts`, `imagePalette.ts`, `typography.ts`, `tokens.ts`, `recipes.ts`, `states.ts`, `motion.ts`, `mode.ts`, `roleMatch.ts`, `imageMediaType.ts`, `lib/color.ts`
- **Action**: UPDATE (comments only)
- **Implement**:
  - `styleDump.ts`:
    - Keep the header (the channel prior; runs in the page, so self-contained), `NODE_CAP` `:107`, `:110`, `:116`, `:127`, the `__name` shim `:330`, `:347`, `:356`, `:403`, `:437`, `:667` and `:675`.
    - `createStateScanner` `:160`: drop the DIST-048 drift history, and keep "defined once, serialized with `.toString()` and rebuilt in the page; must stay self-contained, no closures or imports".
    - `resolveVarRefs` `:189`: condense to its contract (reads custom properties off the element; bounded passes, innermost first; unresolved refs stay literal).
    - Drop the `§` refs at `:58`, `:81`, `:85`, `:89`, `:320`, `:425` and `:626`.
    - Remove `:54`, `:68`, `:76`, `:103`, `:342`, `:351`, `:523` and `:796`.
  - `palette.ts`:
    - Header: keep the stage table. Fix "ΔE ≈ 2.5" so it matches `MERGE_DELTA_E` (1.5), or drop the number. Replace "Stage E (AI relabelling) is Phase 2 and never runs here — Phase 1 is the measured lane only" with "Stage E (AI relabelling) runs in `lib/interpret.ts`, never here".
    - Keep every constant's comment (`:37-58`).
    - Keep the section banners (`:86`, `:133`, `:188`, `:197`, `:391`), but drop `(§5)`.
    - Keep `:144`, `:155`, `:158`, `:175`, `:218`, `:253`, `:265`, `:280`, `:285`, `:287`, `:296`, `:319`, `:349`, `:374` and `:480`.
    - Drop the `§` refs at `:76`, `:304`, `:352`, `:430`, `:449`, `:494`, `:501` and `:546`.
    - Remove `:68`, `:97`, `:231` and `:364` (`:364` repeats `:319`).
    - `:291`: keep only "wrapping past 360°".
  - `imagePalette.ts`:
    - `:15`: drop `Phase 3 —` and the `§` refs.
    - `:24`, `:58` and `:137`: drop `(issue #22)` and `(issue #21)`, and keep the reasons.
    - Keep the Stage 1/Stage 2 labels and the role-rule labels `:183-252`, which summarize the heuristic.
    - `:269`: drop `§P5-1`.
    - Remove `:41`, `:166`, `:173`, `:176` and `:274`.
  - `typography.ts`:
    - Header: drop `§5` and `(Phase 3)`.
    - `:131`: drop `— DIST-031` and "With no <h1>-tagged samples, behaviour is unchanged."
    - `:194`: drop `(DIST-031)`. `:288`: drop `§`.
    - Remove `:35`, `:80`, `:96` and `:172`.
    - Keep the rest.
  - `tokens.ts`: remove `:12` (`Phase 4… (§5)`), `:46`, `:98` and `:121`; keep `:6`, `:57`, `:69`, `:78`, `:103`, `:130` and `:150`.
  - `recipes.ts`:
    - `:7`: drop `(§P8-1)`.
    - `:228`: drop "renders byte-identical to a pre-variant report" and keep "the field stays omitted".
    - Remove `:93` (the name `modal` plus its signature say it).
    - Keep the rest.
  - `states.ts`: `:16` drop `(§P5-1)`; remove `:38`; keep `:6`, `:46` and `:56`.
  - `motion.ts`: `:5` drop `(§P6)`; remove `:57`.
  - `mode.ts`: drop `(DIST-068 / §12 Phase 8 P2-1)` and the "Used by" list; keep the tie-break rule, the empty-input rule and the note on `recipes.ts`'s own `modal`.
  - `roleMatch.ts`: `:4` drop `§P3-1`.
  - `imageMediaType.ts`: remove `:28`.
  - `lib/color.ts`: header and `:31`/`:74` drop `§`; remove `:21` and `:58`; keep the rest.
- **Mirror**: `lib/extract/palette.ts:37-41`, `lib/extract/styleDump.ts:403-406`
- **Validate**: `npm run typecheck && npm run lint && npm run eval` (100% on all three fixtures, never `UPDATE_BASELINE`), `GATE`, `REFS lib/extract/styleDump.ts lib/extract/palette.ts lib/extract/imagePalette.ts lib/extract/typography.ts lib/extract/tokens.ts lib/extract/recipes.ts lib/extract/states.ts lib/extract/motion.ts lib/extract/mode.ts lib/extract/roleMatch.ts lib/color.ts` → `0`

### Task 5: Structure lane

- **File**: `lib/extract/structureSchema.ts`, `lib/extract/structure/{index,ontology,pruner,repetition,responsive,regionMetrics,scaleMatch,sections,squash,structureEmit,annotationSegments,harvester,tokenLink,styleMatch}.ts` (`structureAI.ts` is Task 3)
- **Action**: UPDATE (comments only)
- **Implement**:
  - Every file: drop `§5b`, `§3, family 2`, `§P2-2`, `§P3-1`, `§P5-2`, `§P5-3`, `§P7-1`, `§P7-2`, `P2-2`, `P3-2`, `#30`, `#34`, `#35`, `#36`, `#175`, `DIST-013`, `DIST-024`, `DIST-028`, `DIST-029`, `DIST-030`, `DIST-063`, `DIST-066`, `DIST-067` and `§12 Phase 8 P2-1`.
  - `index.ts`:
    - Keep the stage labels `:78-169`, which match `docs/architecture/structure-lane.md`.
    - Remove `:26`.
    - Keep `:27` (forced heuristic naming keeps eval offline).
  - `squash.ts:84`: replace `pruner.ts:42-46` with `pruneAndCollapse`.
  - `sections.ts:232`: drop "Body placement in the markdown document is DIST-029".
  - `pruner.ts`: remove `:9` and `:18`; keep `:35`, `:43`, `:54`, `:59` and `:82`.
  - `repetition.ts`: remove `:9`, `:19` and `:26`; keep `:48`, `:68` and `:77`.
  - `harvester.ts`: remove `:94` and `:122`; keep `:4`, `:22`, `:45`, `:84` and `:100`.
  - `structureSchema.ts`:
    - Remove the bare labels `:3`, `:16`, `:31`, `:95`, `:129`, `:163` and `:203`, and the field docs `:66`, `:68` and `:70`, which restate the name.
    - Keep the field docs that state when a field is absent or what it measures (`:25`, `:36`, `:72-89`, `:102-120`, `:136`, `:146`, `:173`, `:208`, `:215`) and the trailing `:185` and `:218`.
  - `annotationSegments.ts`: keep the "MUST be added here so both consumers stay in sync" rule.
  - `scaleMatch.ts`: keep the tolerance rationale, drop the "Used by" refs to item codes.
- **Mirror**: the rubric; `docs/architecture/structure-lane.md:3-10` for the stage vocabulary
- **Validate**: `npm run typecheck && npm run lint && npm run eval` (the structure lane is scored), `GATE`, `REFS lib/extract/structureSchema.ts lib/extract/structure/` → `0`

### Task 6: Schema, emit, orchestration

- **File**: `lib/schema.ts`, `lib/emit.ts`, `lib/emitTailwind.ts`, `lib/analyze.ts`
- **Action**: UPDATE (comments only)
- **Implement**:
  - `lib/schema.ts`:
    - Header: replace the Phase-1 history with the present contract: frontmatter is the contract, the body is derived from it, and an unmeasured lane is optional and omitted, never faked.
    - Drop the `§` refs at `:17`, `:37`, `:41`, `:57`, `:62`, `:107`, `:152`, `:185`, `:216`, `:250`, `:273`, `:279`, `:291` and `:300`, and drop `(#177)` at `:300`.
    - Keep `:17` (refinable roles and why), `:37`, `:41`, `:59`, `:62`, `:89`, `:107`, `:152`, `:185`, `:279`, `:283`, `:300` and `:322`.
  - `lib/emit.ts`:
    - Header: drop `(§3, §4 module 4)`.
    - `:318`: drop `(§P8-4)`.
    - Remove `:185`.
    - Keep the rest (font lookup, name normalisation, provenance suffix).
  - `lib/emitTailwind.ts`: `:8` drop `(DIST-071)` and keep the bundle reason.
  - `lib/analyze.ts`:
    - Drop the `§` refs at `:26`, `:120`, `:209` and `:344`, `P3-1` at `:91`, `Phase 3 / §P6-1` at `:195`, `(DIST-050)` at `:282` and `(#175)` at `:370`.
    - `:163`: keep the invariant ("spread, so every measured lane survives") and drop the motion history.
    - `:365`: shorten, because it repeats `:254`.
    - Keep `:48`, `:187`, `:313` and `:331`.
- **Mirror**: the rubric
- **Validate**: `npm run typecheck && npm run lint && npm run eval`, `GATE`, `REFS lib/schema.ts lib/emit.ts lib/emitTailwind.ts lib/analyze.ts` → `0`

### Task 7: UI

- **File**: `app/page.tsx`
- **Action**: UPDATE (comments only)
- **Implement**:
  - `:17`: drop "previews used to live in a separate array… (#23)" and keep "kept in one entry so the pairing can never drift".
  - Drop `(#101, #173)` at `:44`, `(#101)` at `:61`, `(#23)` at `:85` and `:153`, `(#173, #179)` at `:111`, and `(§P6-2 step 2)` at `:122`.
  - Keep `:34`, `:164`, `:369` and `:432`.
  - Never touch the three `eslint-disable-next-line` comments.
- **Mirror**: the rubric
- **Validate**: `npm run typecheck && npm run lint`, `GATE`, `REFS app/` → `0`

### Task 8: Eval harness

- **File**: `eval/run.ts`, `eval/score.ts`, `eval/scoreStructure.ts`, `eval/stability.ts`, `eval/corpus.ts`, `eval/capture.ts`
- **Action**: UPDATE (comments only)
- **Implement**:
  - Drop `(§10)` from every header, `§P8-3` at `eval/capture.ts:33`, `DIST-013` at `eval/run.ts:78`, `eval/score.ts:28` and `:135`, and `DIST-028` at `eval/scoreStructure.ts:21` and `:65`.
  - `eval/stability.ts`: keep the pinning rationale and drop `(#200)` and `(#209)`.
  - Keep `eval/run.ts:30`, `:32`, `:46` and `:90` (why a structure crash scores 0), `eval/score.ts:15` and `:135` (the weights rationale), and `eval/scoreStructure.ts:106`.
  - Remove `eval/run.ts:164` ("Per-site table.").
  - Do not touch the `measured lane (§10)` string that `eval/run.ts` prints, nor any `expected.yaml`.
- **Mirror**: the rubric
- **Validate**: `npm run typecheck && npm run lint && npm run eval`, `GATE`, `REFS eval/` → `0`

### Task 9: Sweep, then the full gate

- **File**: all of the above
- **Action**: CHECK
- **Implement**: Run `node <scratch>/check-comments.mjs --dump` and read every remaining comment once against the rubric. Then run the gate, the verify scenarios (End-to-End Verification §2) and `npm run check` (no `verify.sh` instance may be up).
- **Validate**: `GATE` prints `all checks ok`, with `0 found` and an `info` line showing at least 35% fewer comment lines (see Open Question 3). `npm run check` exits 0 with eval at 100% on all three fixtures.

---

## Validation

```bash
# Type check
npm run typecheck

# Lint (empty `catch {}` is allowed; precedent lib/extract/structure/structureEmit.ts:117)
npm run lint

# Eval gate: must print combined 100% for clean-light, dark-mode, adversarial-shell; never set UPDATE_BASELINE
npm run eval

# Comment gate (script in End-to-End Verification §1, saved to the scratch dir): exits 0 only when done
node <scratch>/check-comments.mjs main

# Everything CI runs: typecheck → lint → build → eval (run `verify.sh down` first)
npm run check
```

## End-to-End Verification

### 1. The comment gate (all four acceptance criteria)

Save this verbatim as `<scratch>/check-comments.mjs`, outside the repo. Run it with plain `node` from any directory. It loads `typescript` from the repo's `node_modules`. `BASE` defaults to `main`. Set `REPO=<path>` to check another worktree, and `SHOW=<n>` to list more references.

```js
// Comment-pruning gate for issue #212. Usage, from any directory:
//   node check-comments.mjs [BASE]        (BASE defaults to main)
//   node check-comments.mjs --dump        (list every remaining comment, one per line)
// Compares the working tree of the repository with BASE and exits 1 on any FAIL.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const ROOT = process.env.REPO ?? "/home/lauri/github/distill-design-scraper";
const BASE = process.argv.slice(2).find((a) => !a.startsWith("--")) ?? "main";
const ts = createRequire("/home/lauri/github/distill-design-scraper/package.json")("typescript");
const git = (...args) => execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", maxBuffer: 1 << 26 });
const SCOPE = /^(lib|app|eval)\/.*\.(ts|tsx|mjs|css)$/;

// Declarations that must still carry a comment (leading, or trailing on the same statement).
const KEEP_DECLS = {
  "app/api/analyze/route.ts": ["runtime", "MAX_IMAGE_PAYLOAD_BYTES", "readBodyWithinLimit", "structureFailureIsTransient"],
  "lib/aiLane.ts": ["maxOutputTokens", "temperature", "seed", "SEEDED_PROVIDER", "callModel", "parseJsonLoose", "retryOnce"],
  "lib/interpret.ts": ["MAX_TOKENS", "TEMPERATURE", "SEED", "OUTPUT_SCHEMA"],
  "lib/cache.ts": ["DEFAULT_MAX_ENTRIES"],
  "lib/env.ts": ["parsePositiveInteger"],
  "lib/security/ssrfGuard.ts": ["isBlockedIpv6", "parseAllowlist", "assertSafeUrl"],
  "lib/security/rateLimiter.ts": ["extractClientId", "assertWithinRateLimit"],
  "lib/ingest.ts": ["panoramaShot", "MAX_PANORAMA_VIEWPORTS", "capturePage", "redirectSsrfError"],
  "lib/extract/styleDump.ts": ["NODE_CAP", "CROSS_ORIGIN_SHEET_TIMEOUT_MS", "CrossOriginSheetCache", "resolveVarRefs"],
  "lib/extract/structure/harvester.ts": ["collectVisibleText"],
  "lib/extract/palette.ts": ["MERGE_DELTA_E", "NEAREST_CACHE_BITS", "MIN_TEXT_CONTRAST", "AREA_DROP_THRESHOLD", "DARK_SCHEME_BACKGROUND_DELTA_E"],
};
// Facts that must survive somewhere in the comments of the file (wording may change).
const KEEP_TEXT = {
  "lib/ingest.ts": [/fullPage/, /route\(\)/, /34994/, /DNS/, /networkidle/],
  "lib/extract/styleDump.ts": [/__name/, /instanceof/, /self-contained/],
  "lib/security/ssrfGuard.ts": [/DNS/, /egress/, /RFC 6598/, /::ffff/],
  "lib/security/rateLimiter.ts": [/X-Forwarded-For/i, /unbounded/],
  "lib/cache.ts": [/unbounded/, /unref/],
  "app/api/analyze/route.ts": [/bodyParser/, /Content-Length/, /transient/],
  "lib/interpret.ts": [/[Pp]rompt-injection/],
  "lib/extract/structure/structureAI.ts": [/[Pp]rompt-injection/],
  "lib/extract/structureFromImage.ts": [/[Pp]rompt-injection/],
  "eval/run.ts": [/structureScore = 0|REGRESSION_EPS/],
};
// Planning-artifact and ticket references: dangling PRD sections, DIST/TODO ids, issue numbers, phase labels.
const BANNED = /§|\bDIST-\d+|\bTODO-\d+|(?<![\w/])#\d+\b|\breview S\d+|\bPhase[ -]\d+|\bP\d+-\d+\b/;
const DIRECTIVE = /eslint-disable|@ts-|@deprecated|@type\b/g;

const isJsDoc = (n) => n.kind >= ts.SyntaxKind.FirstJSDocNode && n.kind <= ts.SyntaxKind.LastJSDocNode;
function parse(file, text) {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}
function tokens(sf) {
  const out = [];
  const visit = (n) => {
    if (isJsDoc(n)) return;
    if (n.kind === ts.SyntaxKind.JsxExpression && !n.expression) return; // {/* comment */}
    const kids = n.getChildren(sf);
    if (kids.length === 0) {
      let t = n.getText(sf);
      if (n.kind === ts.SyntaxKind.JsxText) { t = t.replace(/\s+/g, " ").trim(); if (!t) return; }
      out.push(`${n.kind}:${t}`);
    } else kids.forEach(visit);
  };
  visit(sf);
  return out;
}
function comments(sf) {
  const text = sf.getFullText(); const seen = new Map();
  const add = (rs) => rs?.forEach((r) => seen.set(r.pos, r));
  const visit = (n) => { add(ts.getLeadingCommentRanges(text, n.getFullStart())); add(ts.getTrailingCommentRanges(text, n.getEnd())); n.getChildren(sf).forEach((c) => isJsDoc(c) || visit(c)); };
  visit(sf);
  return [...seen.values()].map((r) => ({ r, text: text.slice(r.pos, r.end), line: sf.getLineAndCharacterOfPosition(r.pos).line + 1,
    lines: text.slice(r.pos, r.end).split("\n").length }));
}
function hasComment(sf, name) {
  const text = sf.getFullText(); let found = null;
  const visit = (n) => {
    if (found !== null || isJsDoc(n)) return;
    if (n.name && ts.isIdentifier(n.name) && n.name.text === name) {
      const holder = ts.isVariableDeclaration(n) ? n.parent.parent : n;
      const lead = ts.getLeadingCommentRanges(text, holder.getFullStart()) ?? [];
      const attached = lead.length > 0 && !/\n\s*\n/.test(text.slice(lead.at(-1).end, holder.getStart(sf))); // no blank line in between
      found = attached || Boolean(ts.getTrailingCommentRanges(text, holder.getEnd())?.length);
      return;
    }
    n.getChildren(sf).forEach(visit);
  };
  visit(sf);
  return found;
}
const stripCss = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s+/g, "");

let failed = false;
const report = (ok, msg) => { if (!ok) failed = true; console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); };

const baseFiles = git("ls-tree", "-r", "--name-only", BASE, "lib", "app", "eval").split("\n").filter((f) => SCOPE.test(f));
const headFiles = git("ls-files", "--cached", "--others", "--exclude-standard", "lib", "app", "eval").split("\n").filter((f) => SCOPE.test(f) && existsSync(`${ROOT}/${f}`));
// node check-comments.mjs --dump  → prints file:line: <comment, newlines folded>, then exits
if (process.argv.includes("--dump")) {
  for (const f of headFiles.filter((x) => !x.endsWith(".css")))
    for (const c of comments(parse(f, readFileSync(`${ROOT}/${f}`, "utf8"))).sort((x, y) => x.r.pos - y.r.pos))
      console.log(`${f}:${c.line}: ${c.text.replace(/\s*\n\s*\*?\s*/g, " ")}`);
  process.exit(0);
}
const added = headFiles.filter((f) => !baseFiles.includes(f)), removed = baseFiles.filter((f) => !headFiles.includes(f));
report(!added.length && !removed.length, `no source file added or removed${added.length || removed.length ? `: +${added} -${removed}` : ""}`);

const changed = [...new Set([...git("diff", "--name-only", BASE).split("\n"), ...git("ls-files", "--others", "--exclude-standard").split("\n")])]
  .filter((f) => f && !f.startsWith(".agents/") && f !== "TODO.md");
const outside = changed.filter((f) => !SCOPE.test(f));
report(!outside.length, `only lib/, app/ and eval/ sources changed${outside.length ? `: ${outside.join(", ")}` : ""}`);

let codeDiff = [], baseLines = 0, headLines = 0, banned = [], directiveDiff = [];
for (const f of baseFiles.filter((x) => headFiles.includes(x))) {
  const before = git("show", `${BASE}:${f}`), after = readFileSync(`${ROOT}/${f}`, "utf8");
  if (f.endsWith(".css")) { if (stripCss(before) !== stripCss(after)) codeDiff.push(f); continue; }
  const a = parse(f, before), b = parse(f, after);
  if (tokens(a).join("\n") !== tokens(b).join("\n")) codeDiff.push(f);
  const ca = comments(a), cb = comments(b);
  baseLines += ca.reduce((s, c) => s + c.lines, 0); headLines += cb.reduce((s, c) => s + c.lines, 0);
  for (const c of cb) if (BANNED.test(c.text)) banned.push(`${f}:${c.line} ${c.text.match(BANNED)[0]}`);
  const dir = (cs) => cs.flatMap((c) => c.text.match(DIRECTIVE) ?? []).join("|");
  if (dir(ca) !== dir(cb)) directiveDiff.push(f);
}
report(!codeDiff.length, `code and types identical once comments are ignored${codeDiff.length ? `: ${codeDiff.join(", ")}` : ""}`);
report(!directiveDiff.length, `tool-directive comments (eslint-disable, @ts-, @deprecated, @type) unchanged${directiveDiff.length ? `: ${directiveDiff.join(", ")}` : ""}`);
report(!banned.length, `no planning or ticket reference left in a comment: ${banned.length} found${banned.length ? `\n       ${banned.slice(0, Number(process.env.SHOW ?? 12)).join("\n       ")}${banned.length > 12 ? "\n       …" : ""}` : ""}`);

const missing = [];
for (const [f, names] of Object.entries(KEEP_DECLS)) {
  const sf = parse(f, readFileSync(`${ROOT}/${f}`, "utf8"));
  for (const n of names) { const h = hasComment(sf, n); if (h !== true) missing.push(`${f} ${n}${h === null ? " (not found)" : ""}`); }
}
for (const [f, res] of Object.entries(KEEP_TEXT)) {
  const all = comments(parse(f, readFileSync(`${ROOT}/${f}`, "utf8"))).map((c) => c.text).join("\n");
  for (const re of res) if (!re.test(all)) missing.push(`${f} ${re}`);
}
report(!missing.length, `essential comments kept${missing.length ? `: missing ${missing.join("; ")}` : ""}`);

console.log(`info comment lines in lib/, app/, eval/ sources: ${baseLines} on ${BASE}, ${headLines} now (${baseLines ? Math.round((100 * (baseLines - headLines)) / baseLines) : 0}% fewer)`);
console.log(failed ? "FAILED" : "all checks ok");
process.exit(failed ? 1 : 0);
```

Expected:

| When | Output | Exit |
|---|---|---|
| `main`, unchanged | 4× `ok`, `FAIL … 197 found`, `ok essential comments kept`, `info … 1957 on main, 1957 now (0% fewer)` | 1 |
| after the patch (Task 1) | the same with `186 found`, `1957 on main, 1869 now (4% fewer)` | 1 |
| after Task 9 | 6× `ok` (`0 found`), `info … ≥35% fewer`, `all checks ok` | 0 |

For the Task 9 sweep, `node <scratch>/check-comments.mjs --dump` lists every remaining comment as `file:line: text`, with newlines folded (962 lines on `main`).

### 2. The running app (third acceptance criterion: runtime behavior unchanged)

The gate proves the token streams identical. These scenarios execute the code that eval never runs: `lib/ingest.ts` and the SSRF redirect guard, the in-page `page.evaluate` callbacks of `styleDump.ts` and `harvester.ts`, the `createStateScanner` source that is rebuilt in the page, the route and the UI. All use local fixtures with the AI lane off, so there is no network and no paid call.

```bash
V=.claude/skills/verify/scripts/verify.sh
$V up > /tmp/verify-up.log 2>&1; tail -1 /tmp/verify-up.log   # expect: ready: app http://127.0.0.1:<port> …
$V doctor                                                      # every line ok
$V drive analyze-url                                           # clean-light
$V drive analyze-url --target adversarial-shell
$V drive tabs-downloads
$V drive analyze-images
$V drive cross-origin                                          # cross-origin hover/focus + @keyframes, stalled sheet skipped, < 20 s
$V drive error                                                 # 10.0.0.1 blocked by the SSRF guard: 400 + error banner
$V down
```

Expected: every scenario prints only `ok` lines and exits 0, and each evidence dir's `console-errors.txt` is empty. Run them once each.

### 3. Full gate (fourth acceptance criterion)

With no `verify.sh` instance up: `npm run check` exits 0, and `npm run eval` inside it prints `combined 100%` for each fixture and `✓ all gates passed`.

## Risks

| Risk | Mitigation | Scope |
|------|------------|-------|
| A *why* comment is judged a *what* and deleted | The gate's keep list (11 files of declarations, 10 files of fact patterns) fails on the security, workaround and threshold comments. The rubric lists what to keep. The Task 9 sweep re-reads every remaining comment, and `/review` reads the diff | in scope |
| An edit slips into code, a type or a string (e.g. a prompt template) while comments are cut | The gate compares full token streams, string and template contents included. Proven by the negative controls in the Summary | in scope |
| Comments inside `page.evaluate` callbacks and the serialized `createStateScanner` source are part of the code shipped to the browser | Removing a comment cannot change the parsed code (the gate). The `cross-origin`, `analyze-url` and `analyze-images` scenarios execute both serialized paths | in scope |
| Removing the only comment in a `catch {}` trips a lint rule | `eslint lib/ingest.ts` passes on the patch, which has two such blocks, and `structureEmit.ts:117` is a precedent. `npm run lint` runs after each task | in scope |
| A pruned comment leaves a neighbour's pointer dangling (`aiLane.ts:142` → `parseJsonLoose`, `squash.ts:84` → `pruner.ts:42-46`) | `parseJsonLoose` is on the keep list. Task 5 replaces the line reference with `pruneAndCollapse` | in scope |
| A stale comment survives because it carries no ticket reference (e.g. the palette header's "ΔE ≈ 2.5") | Rubric 7, the palette fix in Task 4, and the Task 9 sweep | in scope; a fix outside the comments themselves is out of scope |
| The diff touches about 50 files at once and conflicts with other open branches | Land it as one PR soon after it is ready. Other branches rebase onto a comments-only diff | flag only |
| `git blame` noise on comment lines | Accepted cost of the cleanup | flag only |
| Planning references in non-comment places (`eval/run.ts` prints `(§10)`; `expected.yaml` headers cite `§10`) | Out of scope: changing output or test data is not comment pruning. Listed under Open Questions as a possible follow-up | out of scope |

## Open Questions

1. **Remove every ticket and PRD reference from comments, including those that back a measured fact (`#209` seed, `#200` temperature, `#177` schema)?** Proposed default: yes. Keep the fact in words and let `git log` hold the trail, because the `§` numbering no longer exists in the PRD and readers cannot follow a bare `#nn` from the code. Exception: upstream references that prove third-party behavior (`microsoft/playwright#34994`).
2. **Prune outside `lib/`, `app/` and `eval/` too (`next.config.mjs`, `scripts/`, `.claude/skills/verify/scripts/`, `eval/corpus/*/expected.yaml`, `eval/fixtures/*`)?** Proposed default: no. The issue's first criterion names those three directories, `next.config.mjs` holds the bundling *why* that the issue's notes ask to keep, and `AGENTS.md` protects the `expected.yaml` notes. The `(§10)` string printed by `eval/run.ts` stays too, because it is output, not a comment.
3. **How much should the comment count drop?** Proposed default: no hard target. The rubric decides, not a number. Treat less than 35% fewer comment lines as a sign that the "what" comments were not removed, and look again in the Task 9 sweep. The `lib/ingest.ts` sample removed 88 of the 1,957 comment lines on its own.

## Acceptance Criteria

- [ ] All tasks completed
- [ ] Type check passes (`npm run typecheck`)
- [ ] Lint passes (`npm run lint`)
- [ ] Eval unchanged: 100% on `clean-light`, `dark-mode`, `adversarial-shell` (`npm run eval`), baseline untouched
- [ ] The comment gate prints `all checks ok`: code, types and strings identical; tool directives unchanged; no planning or ticket reference in a comment; every listed essential comment present
- [ ] The verify scenarios of End-to-End Verification §2 pass
- [ ] `npm run check` passes
- [ ] Follows existing patterns (the rubric; the prototype patch for `lib/ingest.ts`)
