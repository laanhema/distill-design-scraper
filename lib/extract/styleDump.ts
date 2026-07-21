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

    const all = document.querySelectorAll("*");
    const nodes: unknown[] = [];
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

      if (colors.length === 0) continue;

      const record: Record<string, unknown> = {
        tag: el.tagName.toLowerCase(),
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
        colors,
        hasText,
        interactive: isInteractive(el),
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

      nodes.push(record);
    }

    return { nodes, totalVisible, truncated };
  }, NODE_CAP) as Promise<StyleDump>;
}
