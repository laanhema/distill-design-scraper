import type { RawHarvestNode, PrunedNode } from "../structureSchema";

/**
 * Stages 3 & 4 — Prune & Collapse Wrappers (§5b)
 */
export function pruneAndCollapse(
  root: RawHarvestNode,
  foldCutoffY?: number,
): PrunedNode | null {
  // First recursively clean children
  const cleanedChildren: PrunedNode[] = [];
  for (const child of root.children) {
    // Fold cutoff filter if specified
    if (foldCutoffY && child.bounds.y > foldCutoffY) {
      continue;
    }
    const prunedChild = pruneAndCollapse(child, foldCutoffY);
    if (prunedChild) {
      cleanedChildren.push(prunedChild);
    }
  }

  // Determine layout annotation if flex or grid
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

  // Sticky/fixed landmarks (e.g. a pinned SiteHeader) matter for a rebuild —
  // surface it alongside any flex/grid annotation already computed.
  if (root.landmark && (root.cssPosition === "sticky" || root.cssPosition === "fixed")) {
    layoutAnnotation = layoutAnnotation
      ? `${layoutAnnotation} · ${root.cssPosition}`
      : root.cssPosition;
  }

  // Stage 4: Wrapper collapse rule.
  // If this node has EXACTLY 1 child, no flex/grid layout annotation, is not a landmark,
  // is not an interactive element, and is just a div/span wrapper without special identity,
  // collapse it into its child.
  const isMeaningfulContainer =
    Boolean(layoutAnnotation) ||
    Boolean(root.landmark) ||
    root.isInteractive ||
    ["header", "nav", "main", "footer", "section", "article", "aside", "form"].includes(root.tagName);

  if (cleanedChildren.length === 1 && !isMeaningfulContainer) {
    // Note: landmark-carrying nodes are never collapsed here because
    // `isMeaningfulContainer` includes `Boolean(root.landmark)`.
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
