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
  /** ARIA evidence for semantic (success/warning/danger) color roles (§P5-1) —
   *  ("alert"/"status" live regions, or an `aria-invalid` field) never inferred
   *  from color alone. */
  semanticContext?: "alert" | "invalid";
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

  return page.evaluate((cap) => {
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

    function hasVisibleBorder(cs: CSSStyleDeclaration): boolean {
      const sides = [
        ["border-top-width", "border-top-style"],
        ["border-right-width", "border-right-style"],
        ["border-bottom-width", "border-bottom-style"],
        ["border-left-width", "border-left-style"],
      ] as const;
      return sides.some(([w, s]) => {
        return parseFloat(cs.getPropertyValue(w)) > 0 &&
          cs.getPropertyValue(s) !== "none";
      });
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

      if (hasVisibleBorder(cs)) {
        const bc = opaqueColor(cs.borderTopColor);
        if (bc) colors.push({ channel: "border", value: bc });
      }

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

      const hasLayout =
        borderRadius !== "" ||
        boxShadow !== "" ||
        gapsPx.length > 0 ||
        paddingsPx.some((p) => p > 0) ||
        marginsPx.some((m) => m > 0);

      if (colors.length === 0 && !hasText && !hasLayout) continue;

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

      nodes.push(record);
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
            const to = rule.style.getPropertyValue(prop);
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

    function scanRules(rules: CSSRuleList) {
      for (const rule of rules) {
        if (rule instanceof CSSMediaRule) {
          scanRules(rule.cssRules);
          continue;
        }
        if (rule instanceof CSSStyleRule) applyRule(rule);
      }
    }

    for (const sheet of document.styleSheets) {
      let rules: CSSRuleList | null;
      try {
        rules = sheet.cssRules;
      } catch {
        continue; // cross-origin stylesheet — can't be read, skip silently.
      }
      if (rules) scanRules(rules);
    }

    return { nodes, totalVisible, truncated };
  }, NODE_CAP) as Promise<StyleDump>;
}
