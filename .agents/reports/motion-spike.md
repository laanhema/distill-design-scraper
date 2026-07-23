# Spike Report: Motion/Transition Token Extraction

**Issue**: #6 (`[DIST-005] Spike: motion/transition token extraction`)
**Plan**: `.agents/plans/completed/motion-transition-token-spike-plan.md`
**Status**: Spike complete — no `lib/`, `eval/corpus/*`, or `lib/schema.ts` changes in scope or made.

## Summary

Motion is measurable to roughly the same fidelity as the existing `states` lane, and slots into the same "measured, never faked" contract with no surprises. The interesting findings are narrower than expected: (1) declared CSS transitions/animations read cleanly off `getComputedStyle`, no `var()`-resolution workaround needed (unlike `states.ts`'s CSSOM-rule-text reads); (2) the record-skip gate in `styleDump.ts` needs one new condition or motion-only nodes silently vanish; (3) `@keyframes` definitions piggyback on the *existing* stylesheet iteration used for `:hover`/`:focus` scanning, so no second page pass is needed; (4) attribution to a recipe element class is actually simpler than `states.ts`'s color-role attribution, since `recipes.ts`'s `classify()` never depends on color; (5) JS-driven "transitions" (the common case for scroll-triggered/JS-animation-library motion) are honestly invisible to computed-style reads — a real, expected gap, not a bug to work around.

**Recommendation: GO**, as a small follow-up story, decoupled from any other in-flight capture-shape work (see §4).

---

## 1. What's measurable vs. what requires inference

### Measurable (Task 1 + 2 prototype evidence)

Ran a synthetic fixture (`motion-fixture.html`, deleted after use) through a standalone `page.evaluate` prototype (`motion-prototype.ts`, deleted after use) covering three cases per the plan: (a) a `:hover`-triggered multi-value CSS transition, (b) a `@keyframes` animation, (c) a JS-driven style mutation as a deliberate negative case. Rendered via a local `http.createServer` fixture + direct `chromium.launch`/`page.goto` — the same SSRF-guard bypass pattern `eval/capture.ts` uses for offline fixtures (never calls `renderUrl`/`assertSafeUrl`, drives Playwright directly).

**(a) Declared `:hover` transition — captured cleanly, including the shorthand list gotcha:**

```json
{
  "tag": "a", "selectorHint": ".btn",
  "transitions": [
    { "property": "background-color", "durationMs": 200, "timingFunction": "ease-in-out", "delayMs": 0 },
    { "property": "transform", "durationMs": 150, "timingFunction": "cubic-bezier(0.4, 0, 0.2, 1)", "delayMs": 0 }
  ]
}
```

The fixture declared `transition: background-color .2s ease-in-out, transform .15s cubic-bezier(0.4, 0, 0.2, 1)`. Two parsing gotchas confirmed:

- **Naive `.split(",")` on `transitionTimingFunction` breaks** — `cubic-bezier(0.4, 0, 0.2, 1)` contains internal commas, so a paren-depth-aware splitter is required (implemented in the prototype, ~15 lines).
- **`transition-property`'s computed default is `"all"`, not `"none"`.** Every element — including ones with zero declared transitions — reports `transitionProperty: "all"`. The signal that actually distinguishes "has a transition" from "doesn't" is `transitionDuration > 0`, not the property list. Gating on property alone would produce false positives on every element in the DOM.
- **No `var()` resolution needed**, unlike `states.ts`'s `resolveVarRefs` workaround. `states.ts` reads raw CSSOM *rule text* (`rule.style.getPropertyValue(prop)`) for a pseudo-class rule that isn't actually applied at read time, so `var(--x)` appears literally and must be manually resolved against the element's computed style. Motion properties are read via plain `getComputedStyle(el).transitionDuration` — a normal computed-style property, already fully resolved by the browser. This is a real simplification versus the `states` precedent, not an oversight.

**(b) `@keyframes` — captured via CSSOM walk, correctly separated from per-node data:**

```json
{ "name": "spin", "steps": [
  { "offset": "0%", "properties": ["transform"] },
  { "offset": "100%", "properties": ["transform"] }
] }
```

Confirmed `@keyframes` at-rules are **not** a per-node concept — the `spin` definition exists once in the stylesheet regardless of how many elements reference `animation-name: spin`. The per-node signal is only the *reference* (`animationName: "spin"`, `animationDuration: 1000ms`, etc.); the *definition* (keyframe steps) is page-global.

**(c) JS-driven mutation — honestly absent, confirming the "measured, never faked" boundary:**

The fixture's negative case used a `requestAnimationFrame` loop mutating `el.style.backgroundColor` directly every frame — no `transition`/`animation` CSS property at all (a common pattern for scroll-triggered or JS-animation-library-driven motion). Computed style for that element:

```json
{ "transitionProperty": "all", "animationName": "none" }
```

`transitionDuration` is `0s` (the default), so the duration-gated read correctly excludes it — zero motion observations for that node, no fabricated entry. This is the concrete evidence the plan asked for: a real class of motion (JS-driven) is invisible to this extraction approach, by design, matching the palette lane's precedent of a missing signal producing an omitted field rather than a guess.

### Requires inference (out of scope for a "measured" lane)

- JS-driven transitions/animations (confirmed above) — would require either instrumenting the page (injecting observers, not a passive read — a much bigger scope change) or heuristically inferring from class-toggle patterns, both of which cross into "inferred"/"ai" provenance territory the issue didn't ask for.
- Scroll-linked animations (`animation-timeline: scroll()`) and View Transitions API — not exercised by this fixture; likely readable via the same computed-style approach but untested here, flagged as a follow-up-story unknown rather than assumed to work.
- "Which state actually triggers this transition" beyond `:hover`/`:focus-visible` — `states.ts` already only scans those two pseudo-classes for the same reason (CSSOM-declared, not simulated); a motion extension would inherit the identical limitation for consistency, not because motion introduces a new constraint.

---

## 2. Proposed schema shape (documentation only — not added to `lib/schema.ts`)

Follows `statesSchema`'s exact contract (`lib/schema.ts:176-197`): optional top-level field, own `provenance`, an `entries` array, `undefined`/omitted when nothing was observed.

```ts
// PROPOSED — not implemented in this spike.
export const MOTION_KINDS = ["transition", "animation"] as const;
export type MotionKind = (typeof MOTION_KINDS)[number];

export const motionEntrySchema = z.object({
  target: recipeElementSchema,   // e.g. "Button", "Card" — see §3 attribution note
  kind: z.enum(MOTION_KINDS),
  property: z.string(),          // e.g. "background-color", or the animation-name for kind: "animation"
  durationMs: z.number(),
  timingFunction: z.string(),
  delayMs: z.number().optional(),
  iterationCount: z.string().optional(), // animation-only ("infinite" | "3" | ...)
});
export type MotionEntry = z.infer<typeof motionEntrySchema>;

export const keyframeStepSchema = z.object({
  offset: z.string(),      // "0%" | "50%" | "to" ...
  properties: z.array(z.string()),
});
export const keyframeDefSchema = z.object({
  name: z.string(),
  steps: z.array(keyframeStepSchema),
});

export const motionSchema = z.object({
  provenance: provenanceSchema,
  entries: z.array(motionEntrySchema),
  keyframes: z.array(keyframeDefSchema).optional(), // only present if any animation entries reference one
});
export type Motion = z.infer<typeof motionSchema>;
```

Top-level field: `motion: motionSchema.optional()` on `reportSchema`, gated `if (report.motion)` in a new `renderMotion` in `lib/emit.ts`, per the existing `states`/`elevation` pattern (`lib/emit.ts:78-82`).

**Attribution target note (Task 3 finding):** `target: recipeElementSchema` (Button/Card/TextLink/etc. from `lib/extract/recipes.ts`'s `RECIPE_ELEMENTS`), **not** `colorRoleSchema` like `states.ts` uses. Confirmed by reading `recipes.ts`'s `classify(node: NodeStyle)` (`lib/extract/recipes.ts:18-33`): it dispatches purely on `tag`/`interactive`/`inNav`/layout-shape (radius+shadow+padding for Card, pill-radius for Badge) — **never on color**. This means a motion-augmented `NodeStyle` can reuse `classify()` directly to bucket transition/animation observations by element class, with no ΔE-nearest-match analog required (there's no "nearest duration" concept the way there's a "nearest palette role" for `states.ts`'s color-based attribution). Attribution is actually **simpler** for motion than for states — a straight `classify()` call, then `mode()` per bucket, mirroring `extractElevation`'s frequency-rank shape exactly (`lib/extract/tokens.ts:147-175`). Prototyped in Task 3 (selector-hint bucketing standing in for `classify()`): `.btn → { property: "background-color", durationMs: 200, timingFunction: "ease-in-out" }`, `.card → { property: "box-shadow", durationMs: 300, timingFunction: "ease" }`; the spinner's `@keyframes`-driven animation aggregated separately since it's `kind: "animation"` not `"transition"`. Confirmed the empty-input case returns `undefined`, preserving the `states.ts:91` contract.

---

## 3. Capture-shape answer

**Two distinct additions, both fitting inside the existing single render pass — no second page visit required:**

1. **Per-node transition/animation properties** (`transitionProperty/Duration/TimingFunction/Delay`, `animationName/Duration/TimingFunction/IterationCount`): fit inside the existing per-node loop in `collectStyleDump`'s `page.evaluate` (`lib/extract/styleDump.ts:166-273`) as new optional fields on `NodeStyle`, read via the same `getComputedStyle(el)` call already in scope for every node — no new DOM query, no new page state. **However**, the record-skip gate at `styleDump.ts:233` (`if (colors.length === 0 && !hasText && !hasLayout) continue;`) must grow a `hasMotion` sibling condition, exactly as the plan anticipated — otherwise a node with a transition but no color/text/layout signal (plausible: a bare `<div>` with only `transition: opacity .2s`) is silently dropped before motion is ever read. This is a small, mechanical change but a required one, not optional.

2. **`@keyframes` definitions**: don't fit per-node (page-global, not per-element) but **do** fit inside the *existing* `document.styleSheets` iteration already run for `:hover`/`:focus-visible` scanning (`styleDump.ts:376-394`'s `scanRules`) — this spike's prototype confirmed a `CSSKeyframesRule` branch slots into that same walk with the same cross-origin `try/catch` discipline, zero extra passes. The result is a new **top-level** field on `StyleDump`, parallel to `nodes`/`totalVisible`/`truncated` (`styleDump.ts:67-73`), since keyframes are collected once per page, not once per node.

**Net effect: this is a capture-shape change (new fields on `StyleDump`) but not a capture-*cost* change** — unlike `responsiveHarvests` (extra viewport resize + harvest) or `darkCapture` (extra `emulateMedia` + screenshot + style dump), which needed genuinely new page state and were the precedent CLAUDE.md calls out for triggering a corpus refresh. Motion needs neither a new page state nor a second Playwright pass — just more fields returned from the walk that's already running.

**Corpus-refresh implication:** still required, per CLAUDE.md's "only touch `eval/corpus/*/capture.json` when the capture shape itself changes" — old committed `capture.json` fixtures were captured before any motion fields existed, so replaying them will show `motion: undefined` even for sites that do have real CSS transitions. That's an honest miss (absence, not a wrong answer) consistent with the "measured, never faked" contract, but it does mean eval can't meaningfully score a motion lane until fixtures are refreshed.

**The story's own suggestion to batch this refresh with DIST-004 is now stale**: DIST-004 (tablet viewport, 768×1024) already merged to `main` (`4fd0b33`/`0a7eeee`) before this spike ran, so its corpus refresh already happened and closed. A motion capture-shape refresh will need its own dedicated `npm run eval:capture` + committed-fixture-diff PR, not a shared one.

---

## 4. Go/no-go recommendation

**GO.** The measured/inferred boundary is clean, the schema shape follows the existing optional-lane contract with no deviations, and the capture-shape change is cheaper than the `responsiveHarvests`/`darkCapture` precedent (no new page state). No blocking unknowns surfaced.

### Follow-up story breakdown

| Story | Scope | Complexity | Notes |
|---|---|---|---|
| **Capture extension** | Add `hasMotion`-gated per-node transition/animation fields to `NodeStyle`; add top-level `keyframes: KeyframesDef[]` to `StyleDump` via the existing stylesheet walk | Small | Mechanical, single file (`styleDump.ts`); no new page passes |
| **Corpus refresh** | Re-run `npm run eval:capture` for both fixtures, commit refreshed `capture.json`s | Small | Own PR now that DIST-004's batching window has closed; must land in the *same* PR as the capture extension per fixture policy |
| **Aggregation + schema + emit** | `lib/extract/motion.ts` (classify-and-mode aggregation per §2/§3), `motionSchema` in `lib/schema.ts`, `renderMotion` in `lib/emit.ts`, wire into `extractFromCapture` | Medium | Mirrors `states.ts`/`tokens.ts` shape closely; attribution via `recipes.ts`'s existing `classify()` (§2) means no new matching primitive needed |

Sized per the `.agents/stories/phase-4-hardening-stories.md` house style (Type/Complexity/Priority/Phase/Labels + Dependencies); each fits comfortably under that document's "≤ ~2 days" sizing norm, and Capture extension + Corpus refresh should be one story (same fixture-policy constraint DIST-004 followed: "the fixture policy forbids splitting the capture change from the refresh").

---

## Evidence artifacts

- `motion-fixture.html` — synthetic fixture (deleted after use)
- `motion-prototype.ts` — standalone `page.evaluate` prototype, not wired into `styleDump.ts` (deleted after use)
- Raw prototype output (transition/animation observations, `@keyframes` walk, negative-case check, aggregation) is reproduced inline in §1–§2 above.

## Deviations from plan

None. All four issue-#6 acceptance-criteria bullets are answered above (§1 measured-vs-inferred, §2 schema shape, §3 capture-shape + corpus implication, §4 go/no-go + story breakdown).
