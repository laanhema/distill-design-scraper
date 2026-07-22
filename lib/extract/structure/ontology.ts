import type { PrunedNode, OntologyType } from "../structureSchema";

/**
 * Stage 6 — Type against Ontology (§5b)
 * Heuristically assigns provisional ontology types & default names from the vocabulary.
 */
export function assignOntologyTypes(node: PrunedNode, depth: number = 0): PrunedNode {
  const childrenTyped = node.children.map((c) => assignOntologyTypes(c, depth + 1));

  let provisionalType: OntologyType = "container";
  let name = formatDefaultName(node, childrenTyped);
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
    // Name by tag first — `isInteractive` also covers a/input/select/textarea,
    // so it must not catch those before their specific tag names do.
    if (node.tagName === "a") name = "TextLink";
    else if (["input", "select", "textarea"].includes(node.tagName)) name = "Input";
    else if (node.tagName.startsWith("h")) name = "Heading";
    else if (node.isImageOrSvg) name = "Image";
    else if (node.tagName === "button") name = "Button";
    else if (node.isInteractive) name = "Button";
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

/** A hero is expected to sit in the initial viewport, not further down the page. */
const HERO_Y_THRESHOLD_PX = 900;

function formatDefaultName(node: PrunedNode, childrenTyped: PrunedNode[] = []): string {
  // `<section>` always carries `landmark === "section"` (harvester.ts getLandmark),
  // so this structure-aware check must run before the generic landmark fallback below
  // — otherwise every section collapses to the literal capitalized landmark ("Section").
  if (node.tagName === "div" || node.tagName === "section") {
    if (isHeroSection(node, childrenTyped)) return "Hero";
    if (node.layoutAnnotation?.includes("grid")) return "GridSection";
    if (node.layoutAnnotation?.includes("flex")) return "FlexContainer";
    return "Section";
  }
  if (node.landmark) {
    return capitalize(node.landmark);
  }
  return capitalize(node.tagName);
}

/** First section containing an h1 near the top of the page reads as the hero. */
function isHeroSection(node: PrunedNode, childrenTyped: PrunedNode[]): boolean {
  if (node.bounds.y >= HERO_Y_THRESHOLD_PX) return false;
  return containsTag(childrenTyped, "h1");
}

function containsTag(nodes: PrunedNode[], tag: string): boolean {
  return nodes.some((n) => n.tagName === tag || containsTag(n.children, tag));
}

function capitalize(s: string): string {
  if (!s) return "Block";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
