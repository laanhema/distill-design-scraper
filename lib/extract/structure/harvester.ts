import type { Page } from "playwright";
import type { RawHarvestNode } from "../structureSchema";

/**
 * Stage 2 — Harvest (§5b)
 * Walks the rendered DOM via `page.evaluate` and returns a tree of RawHarvestNode.
 */
export async function harvestDomTree(page: Page): Promise<RawHarvestNode> {
  return page.evaluate(() => {
    let idCounter = 0;

    function getSignature(el: Element, w: number, h: number): string {
      const tag = el.tagName.toLowerCase();
      const childrenTags = Array.from(el.children)
        .slice(0, 5)
        .map((c) => c.tagName.toLowerCase())
        .join(",");
      // Bucket width and height by 10% tolerance (approx 20px buckets)
      const bw = Math.round(w / 25) * 25;
      const bh = Math.round(h / 25) * 25;
      return `${tag}[${childrenTags}]_${bw}x${bh}`;
    }

    function isInteractiveElement(el: Element): boolean {
      const tag = el.tagName.toLowerCase();
      if (["a", "button", "input", "select", "textarea", "option"].includes(tag))
        return true;
      if (el.getAttribute("role") === "button" || el.getAttribute("role") === "link")
        return true;
      if (el.hasAttribute("onclick")) return true;
      return false;
    }

    function isImageOrSvgElement(el: Element): boolean {
      const tag = el.tagName.toLowerCase();
      return tag === "img" || tag === "svg" || tag === "picture" || tag === "canvas";
    }

    function getLandmark(el: Element): string | null {
      const tag = el.tagName.toLowerCase();
      if (["header", "nav", "main", "footer", "section", "article", "aside"].includes(tag)) {
        return tag;
      }
      const role = el.getAttribute("role");
      if (role && ["banner", "navigation", "main", "contentinfo", "region", "search"].includes(role)) {
        return role;
      }
      return null;
    }

    function harvestNode(el: Element): RawHarvestNode | null {
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") {
        return null;
      }

      const rect = el.getBoundingClientRect();
      // Drop 0 width/height nodes
      if (rect.width <= 0 && rect.height <= 0) {
        return null;
      }

      const tag = el.tagName.toLowerCase();
      // Skip non-rendered metadata tags
      if (["script", "style", "meta", "link", "noscript", "template", "svg"].includes(tag) && tag !== "svg") {
        return null;
      }

      const isFlex = style.display.includes("flex");
      const isGrid = style.display.includes("grid");
      let gridCols = 0;
      if (isGrid && style.gridTemplateColumns) {
        gridCols = style.gridTemplateColumns.split(/\s+/).filter(Boolean).length;
      }

      const rawChildren: RawHarvestNode[] = [];
      for (const child of Array.from(el.children)) {
        const harvested = harvestNode(child);
        if (harvested) {
          rawChildren.push(harvested);
        }
      }

      // Check text content
      const hasDirectText = Array.from(el.childNodes).some(
        (n) => n.nodeType === Node.TEXT_NODE && (n.textContent || "").trim().length > 0
      );
      const textContent = (el.textContent || "").trim();
      const textSnippet = textContent.length > 0 ? textContent.slice(0, 40) : undefined;

      idCounter++;
      return {
        id: `node-${idCounter}`,
        tagName: tag,
        ariaRole: el.getAttribute("role"),
        landmark: getLandmark(el),
        bounds: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        },
        computedDisplay: style.display,
        flexGridInfo:
          isFlex || isGrid
            ? {
                isFlex,
                isGrid,
                flexDirection: isFlex ? style.flexDirection : undefined,
                justifyContent: isFlex ? style.justifyContent : undefined,
                gridColumns: isGrid ? gridCols : undefined,
              }
            : undefined,
        hasText: hasDirectText || textContent.length > 0,
        textSnippet,
        isImageOrSvg: isImageOrSvgElement(el),
        isInteractive: isInteractiveElement(el),
        signature: getSignature(el, rect.width, rect.height),
        children: rawChildren,
      };
    }

    const root = harvestNode(document.body);
    if (!root) {
      throw new Error("Failed to harvest document.body from DOM.");
    }
    return root;
  });
}
