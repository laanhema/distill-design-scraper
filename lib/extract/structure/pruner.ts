import type { RawHarvestNode, PrunedNode } from "../structureSchema";

/**
 * Stages 3 & 4 — Prune & Collapse Wrappers
 */
export function pruneAndCollapse(
  root: RawHarvestNode,
): PrunedNode | null {
  const cleanedChildren: PrunedNode[] = [];
  for (const child of root.children) {
    const prunedChild = pruneAndCollapse(child);
    if (prunedChild) {
      cleanedChildren.push(prunedChild);
    }
  }

  let layoutAnnotation: string | undefined;
  if (root.flexGridInfo) {
    if (root.flexGridInfo.isFlex) {
      const dir = root.flexGridInfo.flexDirection || "row";
      const justify = root.flexGridInfo.justifyContent;
      if (justify && justify !== "normal" && justify !== "flex-start") {
        layoutAnnotation = `flex · ${justify}`;
      } else {
        layoutAnnotation = `flex · ${dir}`;
      }
    } else if (root.flexGridInfo.isGrid) {
      const cols = root.flexGridInfo.gridColumns || 0;
      layoutAnnotation = cols > 0 ? `grid · ${cols}col` : "grid";
    }
  }

  // A sticky/fixed landmark (e.g. a pinned SiteHeader) matters for a rebuild.
  if (root.landmark && (root.cssPosition === "sticky" || root.cssPosition === "fixed")) {
    layoutAnnotation = layoutAnnotation
      ? `${layoutAnnotation} · ${root.cssPosition}`
      : root.cssPosition;
  }

  // Stage 4: a single-child wrapper with no layout annotation, landmark,
  // interactivity or semantic tag collapses into its child.
  const isMeaningfulContainer =
    Boolean(layoutAnnotation) ||
    Boolean(root.landmark) ||
    root.isInteractive ||
    ["header", "nav", "main", "footer", "section", "article", "aside", "form"].includes(root.tagName);

  if (cleanedChildren.length === 1 && !isMeaningfulContainer) {
    // Landmark-carrying nodes never collapse here: `isMeaningfulContainer`
    // includes `Boolean(root.landmark)`.
    return cleanedChildren[0];
  }

  // If node has 0 children, no text, not image/svg, not interactive, drop it
  if (
    cleanedChildren.length === 0 &&
    !root.hasText &&
    !root.isImageOrSvg &&
    !root.isInteractive &&
    !isMeaningfulContainer
  ) {
    return null;
  }

  return {
    id: root.id,
    tagName: root.tagName,
    ariaRole: root.ariaRole,
    landmark: root.landmark,
    bounds: root.bounds,
    layoutAnnotation,
    hasText: root.hasText,
    textSnippet: root.textSnippet,
    isImageOrSvg: root.isImageOrSvg,
    isInteractive: root.isInteractive,
    signature: root.signature,
    provisionalType: "container", // Will be assigned in Stage 6
    componentName: root.tagName,   // Will be assigned in Stage 6/7
    children: cleanedChildren,
  };
}
