import type { PrunedNode, OntologyType } from "../structureSchema";

/**
 * Stage 6 — Type against Ontology (§5b)
 * Heuristically assigns provisional ontology types & default names from the vocabulary.
 */
export function assignOntologyTypes(node: PrunedNode, depth: number = 0): PrunedNode {
  const childrenTyped = node.children.map((c) => assignOntologyTypes(c, depth + 1));

  let provisionalType: OntologyType = "container";
  let name = formatDefaultName(node);
  let layoutAnnotation = node.layoutAnnotation;

  // 1. Landmarks -> region
  if (depth <= 1 && (node.landmark || ["header", "nav", "main", "footer"].includes(node.tagName))) {
    provisionalType = "region";
    if (node.tagName === "header" || node.landmark === "banner") name = "SiteHeader";
    else if (node.tagName === "footer" || node.landmark === "contentinfo") name = "SiteFooter";
    else if (node.tagName === "nav" || node.landmark === "navigation") name = "Navbar";
    else if (node.tagName === "main" || node.landmark === "main") name = "MainContent";

    // Region heights give a rebuild vertical rhythm (header/footer bands,
    // hero height, etc.) that the flex/grid annotation alone doesn't convey.
    const heightTag = `h ${Math.round(node.bounds.height)}px`;
    layoutAnnotation = layoutAnnotation ? `${layoutAnnotation} · ${heightTag}` : heightTag;
  }
  // 2. Interactive / leaf elements -> atom
  else if (
    node.isInteractive ||
    node.isImageOrSvg ||
    ["button", "a", "input", "h1", "h2", "h3", "h4", "img", "svg", "p", "label"].includes(node.tagName)
  ) {
    provisionalType = "atom";
    if (node.tagName === "button" || node.isInteractive) name = "Button";
    else if (node.tagName === "a") name = "TextLink";
    else if (node.tagName.startsWith("h")) name = "Heading";
    else if (node.isImageOrSvg) name = "Image";
    else if (node.tagName === "input") name = "Input";
  }
  // 3. Repeated units -> content-block
  else if (node.instanceCount && node.instanceCount >= 2) {
    provisionalType = "content-block";
    name = `${formatDefaultName(node)}Card`;
  }
  // 3b. Text-bearing leaves (e.g. span/small labels) -> atom, never container
  else if (node.hasText && childrenTyped.length === 0) {
    provisionalType = "atom";
  }
  // 4. Containers with children -> container or composite
  else if (childrenTyped.length > 0) {
    if (childrenTyped.every((c) => c.provisionalType === "atom")) {
      provisionalType = "composite";
    } else {
      provisionalType = "container";
    }
  }

  return {
    ...node,
    provisionalType,
    componentName: name,
    layoutAnnotation,
    children: childrenTyped,
  };
}

function formatDefaultName(node: PrunedNode): string {
  if (node.landmark) {
    return capitalize(node.landmark);
  }
  if (node.tagName === "div" || node.tagName === "section") {
    if (node.layoutAnnotation?.includes("grid")) return "GridSection";
    if (node.layoutAnnotation?.includes("flex")) return "FlexContainer";
    return "Section";
  }
  return capitalize(node.tagName);
}

function capitalize(s: string): string {
  if (!s) return "Block";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
