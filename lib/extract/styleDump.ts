import type { Page } from "playwright";

/**
 * The style dump (§5): one record per visible node, capturing every color it
 * contributes *and the channel it came from*, plus its typographic properties
 * when it actually renders text. The channel is a strong prior for role
 * assignment — a color used as `color` on text is a `text` candidate, not a
 * `background` candidate — so the walk keeps channels separate rather than
 * pooling every color into one bucket.
 *
 * The collection function runs inside the page (via `page.evaluate`), so it is
 * deliberately self-contained: no imports, only DOM APIs. Everything it returns
 * is plain JSON that Node-side extraction (palette, typography) then interprets.
 */

/** A single color observation, tagged with the channel it was read from. */
export type ColorChannel =
  | "background"
  | "text"
  | "border"
  | "fill"
  | "stroke";

export interface KeyframeStep {
  offset: string;
  properties: string[];
}

export interface KeyframeDef {
  name: string;
  steps: KeyframeStep[];
}

export interface TransitionInfo {
  property: string;
  durationMs: number;
  timingFunction: string;
  delayMs?: number;
}

export interface AnimationInfo {
  name: string;
  durationMs: number;
  timingFunction: string;
  delayMs?: number;
  iterationCount?: string;
}

export interface NodeStyle {
  tag: string;
  /** CSS-pixel bounding box in the viewport (rough presence signal only —
   *  authoritative area comes from the screenshot pixel pass). */
  rect: { x: number; y: number; w: number; h: number };
  /** Colors this node paints, one entry per channel, as computed CSS strings. */
  colors: { channel: ColorChannel; value: string }[];
  /** True when the node has a direct, non-whitespace text child. */
  hasText: boolean;
  /** True for links, buttons and other CTA-ish affordances (§5 Stage C). */
  interactive: boolean;
  /** Typography, present only when `hasText` — a measured type sample. */
  type?: {
    fontFamily: string;
    fontSizePx: number;
    fontWeight: number;
    lineHeightPx: number;
    letterSpacing: string;
  };
  /** Spacing, radius & elevation properties (§5 Phase 4). */
  layout?: {
    marginsPx: number[];
    paddingsPx: number[];
    gapsPx: number[];
    borderRadius: string;
    boxShadow: string;
  };
  /** Motion properties (CSS transitions and animations). */
  motion?: {
    transitions?: TransitionInfo[];
    animations?: AnimationInfo[];
  };
  /** ARIA evidence for semantic (success/warning/danger) color roles (§P5-1) —
   *  ("alert"/"status" live regions, or an `aria-invalid` field) never inferred
   *  from color alone. */
  semanticContext?: "alert" | "invalid";
  /** True when the node has an ancestor matching `nav` or `[role="navigation"]`
   *  (§P8-1) — lets recipe classification tell a primary-nav link apart from a
   *  generic body text link without re-walking the DOM. */
  inNav?: boolean;
  /** Declared `:hover`/`:focus-visible` deltas read from the CSSOM for this
   *  node, when it's interactive and a matching rule exists (§P5-1). */
  states?: {
    state: "hover" | "focus";
    changes: { property: string; from: string; to: string }[];
  }[];
}

export interface StyleDump {
  nodes: NodeStyle[];
  /** How many nodes matched before the cap; lets us flag truncation. */
  totalVisible: number;
  /** True if the walk hit its node cap and stopped collecting. */
  truncated: boolean;
  /** Collected `@keyframes` definitions from the page stylesheets. */
  keyframes?: KeyframeDef[];
}

/** Hard cap on collected nodes, to bound the payload handed back to Node. */
const NODE_CAP = 5000;

/**
 * Walk the rendered DOM and return the style dump. Runs on the live page after
 * it has settled (banners dismissed, lazy content nudged) so it reflects the
 * *rendered state only* — unused theme variants sitting in stylesheets never
 * appear here, which is exactly what §5 role assignment wants.
 */
export async function collectStyleDump(page: Page): Promise<StyleDump> {
  // Bundlers that compile this module (tsx/esbuild with keepNames) inject a
  // `__name(fn, "…")` helper around the named functions inside the serialized
  // browser callback below. That helper doesn't exist in the page, so define a
  // harmless passthrough first. This arrow has no named functions of its own,
  // so it is never itself rewritten. No-op under bundlers that don't inject it.
  await page.evaluate(() => {
    const g = globalThis as unknown as { __name?: (fn: unknown) => unknown };
    g.__name ??= (fn) => fn;
  });

  const dump = (await page.evaluate(
    (cap) => {
    /** Parse a computed color; return null for fully-transparent paints. */
    function opaqueColor(value: string): string | null {
      if (!value) return null;
      const v = value.trim();
      if (v === "transparent" || v === "none") return null;
      // Computed colors come back as `rgb(r, g, b)` / `rgba(r, g, b, a)` /
      // the newer `rgb(r g b / a)`. Pull the numbers and check alpha.
      const nums = v.match(/[\d.]+/g);
      if (!nums) return null;
      // rgba(...) → 4 numbers; a fully transparent paint contributes nothing.
      if (nums.length >= 4 && parseFloat(nums[3]) === 0) return null;
      return v;
    }

    /**
     * Color of the node's widest *visible* border side, or null when no side
     * is actually painted. Reading always `border-top-color` would let a
     * zero-width side's default border color (`currentColor`, often pure
     * black) claim the border channel on nodes whose only real border is on
     * another side (e.g. `border-bottom: 1px solid …` hairlines). `hidden`
     * paints nothing, exactly like `none`.
     */
    function visibleBorderColor(cs: CSSStyleDeclaration): string | null {
      const sides = [
        ["border-top-width", "border-top-style", "border-top-color"],
        ["border-right-width", "border-right-style", "border-right-color"],
        ["border-bottom-width", "border-bottom-style", "border-bottom-color"],
        ["border-left-width", "border-left-style", "border-left-color"],
      ] as const;
      let best: string | null = null;
      let bestWidth = 0;
      for (const [w, s, c] of sides) {
        const width = parseFloat(cs.getPropertyValue(w));
        const style = cs.getPropertyValue(s);
        if (width <= 0 || style === "none" || style === "hidden") continue;
        if (width <= bestWidth) continue;
        const color = opaqueColor(cs.getPropertyValue(c));
        if (!color) continue;
        best = color;
        bestWidth = width;
      }
      return best;
    }

    function hasDirectText(el: Element): boolean {
      for (const node of el.childNodes) {
        if (
          node.nodeType === Node.TEXT_NODE &&
          (node.textContent ?? "").trim().length > 0
        ) {
          return true;
        }
      }
      return false;
    }

    const INTERACTIVE = new Set(["A", "BUTTON", "SUMMARY"]);
    function isInteractive(el: Element): boolean {
      if (INTERACTIVE.has(el.tagName)) return true;
      const role = el.getAttribute("role");
      if (role === "button" || role === "link") return true;
      if (el.tagName === "INPUT") {
        const t = (el as HTMLInputElement).type;
        return t === "submit" || t === "button";
      }
      return false;
    }

    const SVG_SHAPES = new Set([
      "PATH", "CIRCLE", "RECT", "POLYGON", "ELLIPSE", "LINE", "SVG",
    ]);

    function semanticContext(el: Element): "alert" | "invalid" | undefined {
      const role = el.getAttribute("role");
      if (role === "alert" || role === "status") return "alert";
      if (el.getAttribute("aria-invalid") === "true") return "invalid";
      return undefined;
    }

    const all = document.querySelectorAll("*");
    const nodes: unknown[] = [];
    // Only elements that end up with a record are eligible hover/focus scan
    // targets — "already in the dump", per §P5-1.
    const elementRecords = new Map<Element, Record<string, unknown>>();
    let totalVisible = 0;
    let truncated = false;

    for (const el of all) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      if (parseFloat(cs.opacity) === 0) continue;

      const r = el.getBoundingClientRect();
      // Skip zero-area and off-screen-left/above nodes; keep below-the-fold
      // ones (full-page screenshot covers them).
      if (r.width <= 0 || r.height <= 0) continue;
      if (r.bottom < 0 || r.right < 0) continue;

      totalVisible++;
      if (nodes.length >= cap) {
        truncated = true;
        continue;
      }

      const hasText = hasDirectText(el);
      const colors: { channel: string; value: string }[] = [];

      const bg = opaqueColor(cs.backgroundColor);
      if (bg) colors.push({ channel: "background", value: bg });

      if (hasText) {
        const fg = opaqueColor(cs.color);
        if (fg) colors.push({ channel: "text", value: fg });
      }

      const bc = visibleBorderColor(cs);
      if (bc) colors.push({ channel: "border", value: bc });

      if (SVG_SHAPES.has(el.tagName)) {
        const fill = opaqueColor(cs.fill);
        if (fill) colors.push({ channel: "fill", value: fill });
        const stroke = opaqueColor(cs.stroke);
        if (stroke) colors.push({ channel: "stroke", value: stroke });
      }

      const marginsPx = [
        parseFloat(cs.marginTop) || 0,
        parseFloat(cs.marginRight) || 0,
        parseFloat(cs.marginBottom) || 0,
        parseFloat(cs.marginLeft) || 0,
      ];
      const paddingsPx = [
        parseFloat(cs.paddingTop) || 0,
        parseFloat(cs.paddingRight) || 0,
        parseFloat(cs.paddingBottom) || 0,
        parseFloat(cs.paddingLeft) || 0,
      ];
      const rowGap = parseFloat(cs.rowGap) || 0;
      const colGap = parseFloat(cs.columnGap) || 0;
      const gapsPx = [rowGap, colGap].filter((g) => g > 0);
      const borderRadius =
        cs.borderRadius && cs.borderRadius !== "0px" ? cs.borderRadius : "";
      const boxShadow =
        cs.boxShadow && cs.boxShadow !== "none" ? cs.boxShadow : "";

      function splitCommaOutsideParens(str: string): string[] {
        const parts: string[] = [];
        let depth = 0;
        let current = "";
        for (let i = 0; i < str.length; i++) {
          const char = str[i];
          if (char === "(") depth++;
          else if (char === ")") depth--;
          if (char === "," && depth === 0) {
            parts.push(current.trim());
            current = "";
          } else {
            current += char;
          }
        }
        if (current.trim()) parts.push(current.trim());
        return parts;
      }

      function parseTimeMs(val: string): number {
        if (!val) return 0;
        const v = val.trim().toLowerCase();
        if (v.endsWith("ms")) return parseFloat(v) || 0;
        if (v.endsWith("s")) return (parseFloat(v) || 0) * 1000;
        return parseFloat(v) || 0;
      }

      const hasLayout =
        borderRadius !== "" ||
        boxShadow !== "" ||
        gapsPx.length > 0 ||
        paddingsPx.some((p) => p > 0) ||
        marginsPx.some((m) => m > 0);

      // Motion parsing (§P6 Motion Token Lane)
      const transitions: { property: string; durationMs: number; timingFunction: string; delayMs?: number }[] = [];
      if (cs.transitionDuration) {
        const durStrs = splitCommaOutsideParens(cs.transitionDuration);
        const propStrs = splitCommaOutsideParens(cs.transitionProperty || "all");
        const tfStrs = splitCommaOutsideParens(cs.transitionTimingFunction || "ease");
        const delayStrs = splitCommaOutsideParens(cs.transitionDelay || "0s");

        durStrs.forEach((durStr, i) => {
          const durationMs = parseTimeMs(durStr);
          if (durationMs > 0) {
            const property = propStrs[i] || propStrs[0] || "all";
            const timingFunction = tfStrs[i] || tfStrs[0] || "ease";
            const delayMs = parseTimeMs(delayStrs[i] || delayStrs[0] || "0s");
            transitions.push({
              property,
              durationMs,
              timingFunction,
              ...(delayMs > 0 ? { delayMs } : {}),
            });
          }
        });
      }

      const animations: { name: string; durationMs: number; timingFunction: string; delayMs?: number; iterationCount?: string }[] = [];
      if (cs.animationName && cs.animationName !== "none") {
        const animNames = splitCommaOutsideParens(cs.animationName);
        const durStrs = splitCommaOutsideParens(cs.animationDuration || "0s");
        const tfStrs = splitCommaOutsideParens(cs.animationTimingFunction || "ease");
        const delayStrs = splitCommaOutsideParens(cs.animationDelay || "0s");
        const iterStrs = splitCommaOutsideParens(cs.animationIterationCount || "1");

        animNames.forEach((name, i) => {
          if (name && name !== "none") {
            const durationMs = parseTimeMs(durStrs[i] || durStrs[0] || "0s");
            if (durationMs > 0) {
              const timingFunction = tfStrs[i] || tfStrs[0] || "ease";
              const delayMs = parseTimeMs(delayStrs[i] || delayStrs[0] || "0s");
              const iterationCount = iterStrs[i] || iterStrs[0];
              animations.push({
                name,
                durationMs,
                timingFunction,
                ...(delayMs > 0 ? { delayMs } : {}),
                ...(iterationCount && iterationCount !== "1" ? { iterationCount } : {}),
              });
            }
          }
        });
      }

      const hasMotion = transitions.length > 0 || animations.length > 0;

      if (colors.length === 0 && !hasText && !hasLayout && !hasMotion) continue;

      const record: Record<string, unknown> = {
        tag: el.tagName.toLowerCase(),
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
        colors,
        hasText,
        interactive: isInteractive(el),
        layout: {
          marginsPx,
          paddingsPx,
          gapsPx,
          borderRadius,
          boxShadow,
        },
      };

      if (hasMotion) {
        record.motion = {
          ...(transitions.length > 0 ? { transitions } : {}),
          ...(animations.length > 0 ? { animations } : {}),
        };
      }

      if (hasText) {
        const fontSizePx = parseFloat(cs.fontSize);
        const lh = cs.lineHeight;
        const lineHeightPx =
          lh === "normal" ? fontSizePx * 1.2 : parseFloat(lh);
        record.type = {
          fontFamily: cs.fontFamily,
          fontSizePx,
          fontWeight: parseInt(cs.fontWeight, 10) || 400,
          lineHeightPx: Number.isFinite(lineHeightPx)
            ? lineHeightPx
            : fontSizePx * 1.2,
          letterSpacing: cs.letterSpacing === "normal" ? "0" : cs.letterSpacing,
        };
      }

      const ctx = semanticContext(el);
      if (ctx) record.semanticContext = ctx;

      if (el.closest('nav, [role="navigation"]')) record.inNav = true;

      nodes.push(record);
      el.setAttribute("data-distill-id", String(nodes.length - 1));
      elementRecords.set(el, record);
    }

    // Interactive states (§P5-1): declared `:hover`/`:focus-visible` deltas,
    // read straight from the CSSOM — never simulated by toggling the pseudo
    // class, so a rule guarded by JS (`.is-hovering`) is an honest miss, not a
    // wrong answer. Cross-origin stylesheets throw on `.cssRules`; skipped.
    const STATE_PROPS: Record<string, string> = {
      "background-color": "background-color",
      "color": "color",
      "border-color": "border-top-color",
      "box-shadow": "box-shadow",
    };

    /**
     * Resolve `var(--name)` / `var(--name, fallback)` references in a raw
     * CSSOM rule-text value against the element's own computed style. This
     * is not fabrication — `--name` is a real, directly-queryable computed
     * property on the element (custom properties cascade/inherit like any
     * other), so reading it off the element being scanned is representative
     * of the actual measured value, even though the `:hover`/`:focus-visible`
     * rule isn't literally applied at read time. Multiple `var()` references
     * can appear in one value (e.g. a multi-part `box-shadow`), and a
     * fallback can itself nest another `var(...)`, so this runs a bounded
     * number of passes, resolving the innermost (paren-free-fallback) refs
     * each pass. Anything that can't be resolved and has no fallback is left
     * as literal `var(...)` text rather than causing a crash.
     */
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

    function applyRule(rule: CSSStyleRule) {
      const selectorText = rule.selectorText;
      if (!selectorText) return;
      for (const rawSelector of selectorText.split(",")) {
        const selector = rawSelector.trim();
        const state = selector.includes(":hover")
          ? "hover"
          : selector.includes(":focus-visible")
            ? "focus"
            : null;
        if (!state) continue;
        const baseSelector = selector
          .replace(/:hover/g, "")
          .replace(/:focus-visible/g, "")
          .trim();
        if (!baseSelector) continue;

        let matched: NodeListOf<Element>;
        try {
          matched = document.querySelectorAll(baseSelector);
        } catch {
          continue;
        }

        for (const el of matched) {
          const record = elementRecords.get(el);
          if (!record || !record.interactive) continue;

          const cs = getComputedStyle(el);
          const changes: { property: string; from: string; to: string }[] = [];
          for (const [prop, computedProp] of Object.entries(STATE_PROPS)) {
            const to = resolveVarRefs(rule.style.getPropertyValue(prop), cs);
            if (!to) continue;
            const from = cs.getPropertyValue(computedProp);
            if (!from || from === to) continue;
            changes.push({ property: prop, from, to });
          }
          if (changes.length === 0) continue;

          const states = (record.states ?? []) as {
            state: "hover" | "focus";
            changes: { property: string; from: string; to: string }[];
          }[];
          const existing = states.find((s) => s.state === state);
          if (existing) {
            for (const ch of changes) {
              if (!existing.changes.some((e) => e.property === ch.property)) {
                existing.changes.push(ch);
              }
            }
          } else {
            states.push({ state, changes });
          }
          record.states = states;
        }
      }
    }

    const keyframes: { name: string; steps: { offset: string; properties: string[] }[] }[] = [];

    function scanRules(rules: CSSRuleList) {
      for (const rule of rules) {
        if (rule instanceof CSSMediaRule) {
          scanRules(rule.cssRules);
          continue;
        }
        if (rule instanceof CSSStyleRule) applyRule(rule);
        if (typeof CSSKeyframesRule !== "undefined" && rule instanceof CSSKeyframesRule) {
          const steps: { offset: string; properties: string[] }[] = [];
          for (let i = 0; i < rule.cssRules.length; i++) {
            const step = rule.cssRules[i];
            if (typeof CSSKeyframeRule !== "undefined" && step instanceof CSSKeyframeRule) {
              const props: string[] = [];
              for (let j = 0; j < step.style.length; j++) {
                props.push(step.style[j]);
              }
              steps.push({ offset: step.keyText, properties: props });
            }
          }
          if (steps.length > 0 && !keyframes.some((k) => k.name === rule.name)) {
            keyframes.push({ name: rule.name, steps });
          }
        }
      }
    }

    const crossOriginHrefs: string[] = [];

    for (const sheet of document.styleSheets) {
      let rules: CSSRuleList | null;
      try {
        rules = sheet.cssRules;
      } catch {
        if (sheet.href) crossOriginHrefs.push(sheet.href);
        continue;
      }
      if (rules) scanRules(rules);
    }

    return {
      nodes,
      totalVisible,
      truncated,
      ...(keyframes.length > 0 ? { keyframes } : {}),
      ...(crossOriginHrefs.length > 0 ? { crossOriginHrefs } : {}),
    };
  }, NODE_CAP)) as unknown as StyleDump & { crossOriginHrefs?: string[] };

  if (dump.crossOriginHrefs && dump.crossOriginHrefs.length > 0) {
    for (const href of dump.crossOriginHrefs) {
      try {
        const res = await page.context().request.get(href);
        if (res.ok()) {
          const cssText = await res.text();
          if (cssText && cssText.trim()) {
            const extra = await page.evaluate((text) => {
              const STATE_PROPS: Record<string, string> = {
                "background-color": "backgroundColor",
                color: "color",
                "border-color": "borderColor",
                "box-shadow": "boxShadow",
              };

              function resolveVarRefs(val: string, cs: CSSStyleDeclaration): string {
                if (!val || !val.includes("var(")) return val;
                let result = val;
                for (let depth = 0; depth < 5; depth++) {
                  if (!result.includes("var(")) break;
                  const next = result.replace(
                    /var\(\s*(--[\w-]+)(?:\s*,\s*([^()]+|\([^()]*\)))?\s*\)/g,
                    (match, name, fallback) => {
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

              const doc = document.implementation.createHTMLDocument("");
              const style = doc.createElement("style");
              style.textContent = text;
              doc.head.appendChild(style);
              const sheet = style.sheet;
              if (!sheet || !sheet.cssRules) return null;

              const updates = new Map<number, { state: "hover" | "focus"; changes: { property: string; from: string; to: string }[] }[]>();
              const keyframes: { name: string; steps: { offset: string; properties: string[] }[] }[] = [];

              function applyRule(rule: CSSStyleRule) {
                const selectorText = rule.selectorText;
                if (!selectorText) return;
                for (const rawSelector of selectorText.split(",")) {
                  const selector = rawSelector.trim();
                  const state = selector.includes(":hover")
                    ? "hover"
                    : selector.includes(":focus-visible")
                      ? "focus"
                      : null;
                  if (!state) continue;
                  const baseSelector = selector
                    .replace(/:hover/g, "")
                    .replace(/:focus-visible/g, "")
                    .trim();
                  if (!baseSelector) continue;

                  let matched: NodeListOf<Element>;
                  try {
                    matched = document.querySelectorAll(baseSelector);
                  } catch {
                    continue;
                  }

                  for (const el of matched) {
                    const idStr = el.getAttribute("data-distill-id");
                    if (!idStr) continue;
                    const id = parseInt(idStr, 10);
                    const cs = getComputedStyle(el);
                    const changes: { property: string; from: string; to: string }[] = [];
                    for (const [prop, computedProp] of Object.entries(STATE_PROPS)) {
                      const to = resolveVarRefs(rule.style.getPropertyValue(prop), cs);
                      if (!to) continue;
                      const from = cs.getPropertyValue(computedProp);
                      if (!from || from === to) continue;
                      changes.push({ property: prop, from, to });
                    }
                    if (changes.length === 0) continue;

                    const states = updates.get(id) ?? [];
                    const existing = states.find((s) => s.state === state);
                    if (existing) {
                      for (const ch of changes) {
                        if (!existing.changes.some((e) => e.property === ch.property)) {
                          existing.changes.push(ch);
                        }
                      }
                    } else {
                      states.push({ state, changes });
                    }
                    updates.set(id, states);
                  }
                }
              }

              function scanRules(rules: CSSRuleList) {
                for (const rule of rules) {
                  if (rule instanceof CSSMediaRule) {
                    scanRules(rule.cssRules);
                    continue;
                  }
                  if (rule instanceof CSSStyleRule) applyRule(rule);
                  if (typeof CSSKeyframesRule !== "undefined" && rule instanceof CSSKeyframesRule) {
                    const steps: { offset: string; properties: string[] }[] = [];
                    for (let i = 0; i < rule.cssRules.length; i++) {
                      const step = rule.cssRules[i];
                      if (typeof CSSKeyframeRule !== "undefined" && step instanceof CSSKeyframeRule) {
                        const props: string[] = [];
                        for (let j = 0; j < step.style.length; j++) {
                          props.push(step.style[j]);
                        }
                        steps.push({ offset: step.keyText, properties: props });
                      }
                    }
                    if (steps.length > 0 && !keyframes.some((k) => k.name === rule.name)) {
                      keyframes.push({ name: rule.name, steps });
                    }
                  }
                }
              }

              scanRules(sheet.cssRules);

              return {
                updates: Array.from(updates.entries()).map(([id, states]) => ({ id, states })),
                keyframes,
              };
            }, cssText);

            if (extra) {
              for (const { id, states } of extra.updates) {
                const node = dump.nodes[id];
                if (node) {
                  const existingStates = node.states ?? [];
                  for (const st of states) {
                    const existing = existingStates.find(
                      (s: { state: string }) => s.state === st.state,
                    );
                    if (existing) {
                      for (const ch of st.changes) {
                        if (
                          !existing.changes.some(
                            (e: { property: string }) => e.property === ch.property,
                          )
                        ) {
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
              if (extra.keyframes && extra.keyframes.length > 0) {
                dump.keyframes = dump.keyframes ?? [];
                for (const k of extra.keyframes) {
                  if (
                    !dump.keyframes.some(
                      (existing: { name: string }) => existing.name === k.name,
                    )
                  ) {
                    dump.keyframes.push(k);
                  }
                }
              }
            }
          }
        }
      } catch {
        // Skip cross-origin stylesheet best-effort on network/fetch error
      }
    }
  }

  // Cleanup temporary attribute
  await page.evaluate(() => {
    document.querySelectorAll("[data-distill-id]").forEach((el) => el.removeAttribute("data-distill-id"));
  }).catch(() => {});

  delete dump.crossOriginHrefs;
  return dump;
}
