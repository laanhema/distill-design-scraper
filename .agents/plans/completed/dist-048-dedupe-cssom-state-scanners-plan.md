# Plan: DIST-048 — Deduplicate the two CSSOM state scanners and fix the cross-origin property-name mismatch

## Summary

`lib/extract/styleDump.ts` has two independently-drifted copies of the `:hover`/`:focus-visible` CSSOM scanner: the same-origin pass (inside the main `page.evaluate`, ~lines 415-538) and the cross-origin re-fetch pass (a *separate* `page.evaluate` per re-fetched stylesheet, ~lines 570-688). The cross-origin copy's `STATE_PROPS` maps to camelCase computed-property names (`backgroundColor`, `borderColor`, `boxShadow`), but `getComputedStyle().getPropertyValue()` only accepts kebab-case, so `from` is always `""` for those three and only `color` (spelled the same both ways) ever survives. `resolveVarRefs` has also drifted (3-pass vs 5-pass, and slightly different fallback-parsing regexes). The fix consolidates `STATE_PROPS`, `resolveVarRefs`, `applyRule`, and `scanRules` into one function defined once at module scope, whose source is captured via `.toString()` and reconstructed inside *both* `page.evaluate` calls via `new Function(...)` (the maintainer's preferred, smaller-diff Option 1) — each call site still supplies its own way of locating "the record for this element" (a live `Map` in the same-origin pass, a `data-distill-id`-keyed lookup in the cross-origin pass), so the merge-only invariant and the two calls' different DOM realities are preserved while the actual scanning logic exists exactly once.

## User Story

As a design engineer relying on the states lane
I want hover/focus deltas from cross-origin stylesheets to capture background, border, and shadow — not just text color
So that the cross-origin state lane reports what it claims to measure, and the two scanners can't silently drift apart again

## Metadata

| Field | Value |
|-------|-------|
| Type | BUG_FIX / REFACTOR |
| Complexity | MEDIUM |
| Systems Affected | `lib/extract/styleDump.ts` (only) |
| GitHub Issue | #96 |

---

## Patterns to Follow

### The `__name` passthrough shim precedent (why `new Function` reconstruction is safe here)

```ts
// SOURCE: lib/extract/styleDump.ts:116-125
await page.evaluate(() => {
  const g = globalThis as unknown as { __name?: (fn: unknown) => unknown };
  g.__name ??= (fn) => fn;
});
```
This primer already runs before the main-pass `page.evaluate`, and `globalThis` state persists across separate `page.evaluate()` calls on the same page — so a reconstructed function containing bundler-injected `__name(...)` wrapping (from `tsx`/esbuild `keepNames`) will find `__name` already defined in *both* the main pass and the later cross-origin pass. No new shim needed; just confirm this ordering isn't disturbed.

### The self-contained-callback constraint (both call sites)

```ts
// SOURCE: CLAUDE.md, "Design-tokens lane" §1
// "Its main pass is a self-contained page.evaluate callback (no imports
//  allowed inside it — plain DOM APIs only)"
```
The shared scanner must be defined as a plain module-scope TypeScript function with **zero references to anything outside its own body** (no closures over other module-scope helpers, no imports) — its `.toString()` output is shipped into the page as a string and reconstructed there via `new Function("return (" + src + ")")()"`, exactly like Playwright already does implicitly for the outer callback itself.

### Merge-only semantics at the outer Node-side merge (must not change)

```ts
// SOURCE: lib/extract/styleDump.ts:696-719
for (const { id, states } of extra.updates) {
  const node = dump.nodes[id];
  if (node) {
    const existingStates = node.states ?? [];
    for (const st of states) {
      const existing = existingStates.find((s) => s.state === st.state);
      if (existing) {
        for (const ch of st.changes) {
          if (!existing.changes.some((e) => e.property === ch.property)) {
            existing.changes.push(ch);
          }
        }
      } else {
        existingStates.push(st);
      }
    }
    node.states = existingStates;
  }
}
```
This Node-side merge (a same-origin value always wins; cross-origin only fills in *missing* properties) is untouched by this change — it already only appends changes for properties the same-origin pass didn't already record. Keep the second `page.evaluate` returning the same `{ updates: [{id, states}], keyframes }` shape so this code needs zero edits.

### The two `STATE_PROPS` copies (source of the bug)

```ts
// SOURCE: lib/extract/styleDump.ts:415-420 (same-origin — correct, kebab-case)
const STATE_PROPS: Record<string, string> = {
  "background-color": "background-color",
  "color": "color",
  "border-color": "border-top-color",
  "box-shadow": "box-shadow",
};
```
```ts
// SOURCE: lib/extract/styleDump.ts:570-575 (cross-origin — wrong, camelCase)
const STATE_PROPS: Record<string, string> = {
  "background-color": "backgroundColor",
  color: "color",
  "border-color": "borderColor",
  "box-shadow": "boxShadow",
};
```
`cs.getPropertyValue(computedProp)` (both passes, e.g. line 487 / 640) only accepts kebab-case; the camelCase copy makes `from` empty for 3 of 4 properties, so the `if (!from || from === to) continue` guard (line 488 / 641) discards them. The unified `STATE_PROPS` must use the same-origin (kebab-case) mapping verbatim.

### `resolveVarRefs` — the two drifted variants (pick same-origin's 3-pass)

```ts
// SOURCE: lib/extract/styleDump.ts:436-452 (same-origin — 3 passes, chosen survivor)
function resolveVarRefs(value: string, cs: CSSStyleDeclaration): string {
  let result = value;
  for (let pass = 0; pass < 3 && result.includes("var("); pass++) {
    const next = result.replace(
      /var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,\s*([^()]*))?\)/g,
      (match, name: string, fallback?: string) => {
        const resolved = cs.getPropertyValue(name).trim();
        if (resolved) return resolved;
        if (fallback !== undefined) return fallback.trim();
        return match;
      },
    );
    if (next === result) break;
    result = next;
  }
  return result;
}
```
The cross-origin copy (lines 577-595) uses a 5-pass loop and a slightly more permissive fallback regex (`[^()]+|\([^()]*\)` vs `[^()]*`). Per the maintainer's explicit instruction ("Take the *same-origin* `resolveVarRefs` ... as the single survivor"), and because it's the only choice that guarantees the same-origin path stays byte-identical for `npm run eval`, **the 3-pass same-origin variant (including its exact regex) is the survivor.** Note this explicitly in the commit message, since the issue itself flags the pass-count drift as something to call out.

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/extract/styleDump.ts` | UPDATE | Consolidate `STATE_PROPS`/`resolveVarRefs`/`applyRule`/`scanRules` into one module-scope factory shared by both `page.evaluate` calls |

No other files change: `NodeStyle.states` shape, the `Capture`/`StyleDump` types, and every downstream consumer (`states.ts`, `motion.ts`'s keyframe reuse, `eval/scoreStructure.ts`, etc.) are unaffected — this is purely an internal-to-`styleDump.ts` refactor plus a bugfix in what values get captured.

---

## Tasks

### Task 1: Define the shared scanner factory at module scope

- **File**: `lib/extract/styleDump.ts`
- **Action**: UPDATE
- **Implement**:
  Add one new module-scope function, e.g. `function createStateScanner()` (placed above `collectStyleDump`, outside any `page.evaluate`), that is **completely self-contained** (references only its own parameters/locals, DOM globals, and TS types — no reference to anything else in the module). Its body:
  - Declares `STATE_PROPS` using the same-origin (kebab-case) mapping verbatim (see Patterns above).
  - Declares `resolveVarRefs(value, cs)` using the same-origin 3-pass variant verbatim.
  - Declares `applyRule(rule, getRecord)`, where `getRecord: (el: Element) => { interactive?: boolean; states?: { state: "hover" | "focus"; changes: { property: string; from: string; to: string }[] }[] } | undefined` replaces the direct `elementRecords.get(el)` closure reference. The body is otherwise identical to the existing same-origin `applyRule` (lines 454-510): resolve state from selector, split compound selectors, `querySelectorAll` the base selector in a try/catch, call `getRecord(el)`, keep the `if (!record || !record.interactive) continue` gate, dedupe changes by property name, push/merge into `record.states`.
  - Declares `scanRules(rules, getRecord, onKeyframe)`, where `onKeyframe: (kf: { name: string; steps: { offset: string; properties: string[] }[] }) => void` replaces the closure-captured `keyframes` array push. Otherwise identical to the existing same-origin `scanRules` (lines 514-538): recurse into `CSSMediaRule`, call `applyRule` for `CSSStyleRule`, extract `CSSKeyframesRule` steps and call `onKeyframe`.
  - Returns `{ scanRules }` (only `scanRules` needs to be exposed; it internally uses `STATE_PROPS`/`resolveVarRefs`/`applyRule` as private closures).
  Add a short comment above it explaining *why* it exists outside both `page.evaluate` calls: its source is captured via `.toString()` and reconstructed in-page via `new Function(...)` inside both the main pass and the cross-origin pass, so this is the **only** place `STATE_PROPS`/`resolveVarRefs`/`applyRule`/`scanRules` are defined — mirroring the existing `__name` shim's use of the same "runs in Node, source shipped into the page" pattern.
- **Mirror**: `lib/extract/styleDump.ts:415-538` (the same-origin implementation being lifted almost verbatim, minus its closure references)
- **Validate**: `npm run typecheck`

### Task 2: Wire the reconstructed scanner into the same-origin pass

- **File**: `lib/extract/styleDump.ts`
- **Action**: UPDATE
- **Implement**: In the call `page.evaluate((cap) => {...}, NODE_CAP)` (line 127), add a second argument: the scanner's source string, e.g. `page.evaluate(({ cap, scannerSrc }) => {...}, { cap: NODE_CAP, scannerSrc: createStateScanner.toString() })` (adjust argument packaging to match the existing single-arg call convention — either switch to one object arg or pass a tuple; keep `cap` behavior unchanged). Inside the callback, delete the inline `STATE_PROPS`/`resolveVarRefs`/`applyRule`/`scanRules` definitions (lines 415-538) and replace the scan-rules loop (lines 540-551) with:
  ```js
  const { scanRules } = new Function("return (" + scannerSrc + ")")()();
  const keyframes = [];
  const crossOriginHrefs = [];
  for (const sheet of document.styleSheets) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch {
      if (sheet.href) crossOriginHrefs.push(sheet.href);
      continue;
    }
    if (rules) {
      scanRules(
        rules,
        (el) => elementRecords.get(el),
        (kf) => {
          if (!keyframes.some((k) => k.name === kf.name)) keyframes.push(kf);
        },
      );
    }
  }
  ```
  Keep `elementRecords` (the `Map<Element, Record<string, unknown>>` populated during the node walk) exactly as-is — it's still the same-origin pass's own way of finding "the record for this element," just now passed in as a `getRecord` callback instead of being closed over by an inline `applyRule`.
- **Mirror**: `lib/extract/styleDump.ts:208-216` (`elementRecords` population), `:540-551` (existing scan-rules loop being replaced)
- **Validate**: `npm run typecheck`

### Task 3: Wire the reconstructed scanner into the cross-origin pass

- **File**: `lib/extract/styleDump.ts`
- **Action**: UPDATE
- **Implement**: Before the per-href re-fetch loop (around line 562), compute the set of interactive node ids the same-origin pass already found, e.g. `const interactiveIds = new Set(dump.nodes.flatMap((n, i) => (n.interactive ? [i] : [])));` — Node-side, from the already-returned `dump`. Pass both `cssText` and `{ scannerSrc: createStateScanner.toString(), interactiveIds: [...interactiveIds] }` into the inner `page.evaluate` call (line 569). Inside that callback, delete the inline `STATE_PROPS`/`resolveVarRefs`/`applyRule`/`scanRules` definitions (lines 570-687) and replace with:
  ```js
  const { scanRules } = new Function("return (" + scannerSrc + ")")()();
  const interactiveIdSet = new Set(interactiveIds);
  const recordsById = new Map();
  function getRecord(el) {
    const idStr = el.getAttribute("data-distill-id");
    if (!idStr) return undefined;
    const id = parseInt(idStr, 10);
    let rec = recordsById.get(id);
    if (!rec) {
      rec = { interactive: interactiveIdSet.has(id), states: [] };
      recordsById.set(id, rec);
    }
    return rec;
  }
  const keyframes = [];
  const doc = document.implementation.createHTMLDocument("");
  const style = doc.createElement("style");
  style.textContent = text;
  doc.head.appendChild(style);
  const sheet = style.sheet;
  if (!sheet || !sheet.cssRules) return null;
  scanRules(sheet.cssRules, getRecord, (kf) => {
    if (!keyframes.some((k) => k.name === kf.name)) keyframes.push(kf);
  });
  const updates = Array.from(recordsById.entries())
    .filter(([, rec]) => rec.states.length > 0)
    .map(([id, rec]) => ({ id, states: rec.states }));
  return { updates, keyframes };
  ```
  This closes the latent divergence where the cross-origin `applyRule` never checked `record.interactive` at all (it matched *any* element with a `data-distill-id`, interactive or not) — unifying `applyRule` naturally applies the same gate both passes now share. Note this as a secondary fix in the commit message. The outer Node-side merge code (lines 696-734, consuming `extra.updates`/`extra.keyframes`) needs **no changes** — the returned shape is identical to today's.
- **Mirror**: `lib/extract/styleDump.ts:604-693` (existing cross-origin implementation being replaced), `:696-734` (merge code that must keep working unmodified)
- **Validate**: `npm run typecheck`

### Task 4: Full-file review pass

- **File**: `lib/extract/styleDump.ts`
- **Action**: UPDATE (cleanup)
- **Implement**: Re-read the whole file top to bottom. Confirm: (a) `STATE_PROPS`, `resolveVarRefs`, `applyRule`, `scanRules` now appear exactly once, inside `createStateScanner`; (b) nothing outside `createStateScanner` still references the old inline names in a way that would now be dangling; (c) the `cleanup temporary attribute` step (lines 743-746) and `delete dump.crossOriginHrefs` (line 748) are untouched; (d) no stray unused variables/imports trip lint.
- **Validate**: `npm run lint && npm run typecheck`

### Task 5: Regression gate — same-origin path must stay byte-identical

- **File**: n/a (verification only)
- **Action**: VERIFY
- **Implement**: Run `npm run eval`. It must pass **unchanged** against `eval/baseline.json` — no committed capture exercises cross-origin stylesheets (per the issue and CLAUDE.md), so this only proves the same-origin scanner's observable output didn't shift. **Do not** run `UPDATE_BASELINE=1` unless eval reports an unexpected diff, which would itself mean something regressed and needs investigating, not blessing.
- **Validate**: `npm run eval`

### Task 6: Live-render verification of the cross-origin fix

- **File**: scratch `dist-048-verify.mts` (project root, deleted after use — not committed)
- **Action**: CREATE, then DELETE
- **Implement**: No committed eval capture exercises cross-origin stylesheets by construction, so this needs a real render. Per CLAUDE.md "Manually verifying extraction changes" and the issue's technical notes:
  1. Stand up **two** local `http.createServer` instances on different ports so the stylesheet is genuinely cross-origin from the page's perspective (e.g. page on `http://localhost:4001`, stylesheet on `http://localhost:4002`, the latter served **without** CORS headers).
  2. Page HTML: one interactive element (e.g. a `<button>` or `<a>`) with a `<link rel="stylesheet" href="http://localhost:4002/style.css">`. The stylesheet declares a `:hover` rule on that element changing `background-color`, `border-color`, and `box-shadow` (plus `color`, as a control) to values distinct from the base computed style.
  3. Call `renderUrl` + `captureFromRender` + `extractFromCapture` (from `lib/analyze.ts`) against the page URL with `SSRF_ALLOWLIST_HOSTS=localhost` set, run via `npx tsx dist-048-verify.mts` from the project root.
  4. Assert the resulting report's `states` entry (or the raw `NodeStyle.states` on the element, whichever is easier to inspect before the full `states.ts` aggregation) contains **all four** properties (`background-color`, `border-color`, `box-shadow`, `color`) with non-empty, distinct `from`/`to` values — not just `color`. This is the concrete reproduction of the bug being fixed; before the fix it would show only `color`.
  5. Also verify the interactive-gate fix from Task 3: add a **non-interactive** element (e.g. a plain `<div>` with no `role`) with its own cross-origin `:hover` rule, and confirm it does **not** produce a `states` entry (matching same-origin behavior for non-interactive nodes).
  6. Delete the scratch script and any fixture files afterward; confirm via `git status` that no scratch artifacts remain.
- **Mirror**: `eval/capture.ts` (direct Playwright driving pattern), CLAUDE.md "Manually verifying extraction changes"
- **Validate**: Manual inspection of script output; `git status` clean afterward.

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Regression gate (must pass unchanged, no baseline refresh)
npm run eval
```

## End-to-End Verification

1. `npm run typecheck` and `npm run lint` pass clean.
2. `npm run eval` passes with **no baseline refresh** — proves the same-origin scan path (the only one eval fixtures exercise) is byte-identical to before.
3. The Task 6 two-server scratch script demonstrates, against a live render: (a) a cross-origin `:hover` rule's `background-color`/`border-color`/`box-shadow` deltas are now captured (previously only `color` survived), and (b) a non-interactive element's cross-origin `:hover` rule does **not** produce a spurious `states` entry.
4. `git status` shows only `lib/extract/styleDump.ts` modified — no scratch files left behind.

---

## Risks

| Risk | Mitigation | In scope? |
|------|------------|-----------|
| Bundler `__name` wrapping breaks the reconstructed function | The existing `__name` passthrough shim (lines 122-125) already runs before *both* `page.evaluate` calls and persists on `globalThis` for the page's lifetime — no new shim needed, but verify via Task 6 that the live render doesn't throw a `__name is not defined` error | In scope — verify, don't add new plumbing unless the live render actually fails |
| `createStateScanner.toString()` output differs across bundlers/build modes (dev vs. prod, `tsx` vs. Next's own bundler) in a way that breaks `new Function` reconstruction | `.toString()` on a plain function is a long-standing, well-defined JS behavior; the file already relies on similar serialize-and-ship-into-page behavior for the outer `page.evaluate` callbacks themselves. Task 6's live render (via `renderUrl`, the real production path) is the concrete proof this works, not just typecheck | In scope — covered by Task 6 |
| Fixing the cross-origin `applyRule`'s missing `record.interactive` gate (Task 3) is technically new behavior beyond the issue's literal STATE_PROPS/resolveVarRefs asks | The issue's AC explicitly requires "one parameterized definition shared by both passes — not two maintained copies"; a truly shared `applyRule` cannot selectively omit the interactive gate for one caller without re-introducing a parameter that recreates the divergence. Treat as an intended, narrowly-scoped side effect and call it out explicitly in the commit message | In scope — call out explicitly, don't hide it |
| `resolveVarRefs` choice (3-pass same-origin vs. 5-pass cross-origin) — the maintainer's issue comment says "take the *same-origin* variant" but also parenthetically says "pick the more thorough of the 3-pass / 5-pass variants," which point in opposite directions since same-origin is the *less* thorough (3-pass) one | Prioritize the unambiguous, twice-stated instruction ("take the same-origin resolveVarRefs") over the parenthetical aside, and prioritize the AC that same-origin behavior must stay byte-identical for `npm run eval` — switching to the 5-pass variant would risk changing same-origin output in ways eval might not even catch. Document the choice and this exact tension in the commit message per the issue's own request | In scope — resolved via commit-message documentation; flagged here as the one real open question in this plan |
| Passing `interactiveIds` (up to `NODE_CAP` = 5000 entries) as a serialized array into the cross-origin `page.evaluate` adds payload size | Negligible — a few thousand small integers is trivially cheap next to the `cssText` blob already being passed, and this only runs when `crossOriginHrefs` is non-empty | In scope — no mitigation needed beyond noting it's cheap |

---

## Acceptance Criteria

- [ ] `STATE_PROPS`, `resolveVarRefs`, `applyRule`, `scanRules` are defined exactly once (inside `createStateScanner`), reconstructed via `new Function` in both `page.evaluate` call sites
- [ ] Cross-origin `:hover`/`:focus-visible` rules changing `background-color`, `border-color`, and `box-shadow` are captured with correct kebab-case property lookups (not just `color`)
- [ ] Cross-origin pass respects the same `record.interactive` gate as the same-origin pass (no states recorded for non-interactive elements)
- [ ] Same-origin path is byte-identical: `npm run eval` passes with `eval/baseline.json` untouched
- [ ] `npm run typecheck` and `npm run lint` pass clean
- [ ] Live two-origin render (Task 6) confirms the fix; scratch script deleted afterward
- [ ] Commit message documents the `resolveVarRefs` 3-pass-vs-5-pass choice and the interactive-gate side effect
