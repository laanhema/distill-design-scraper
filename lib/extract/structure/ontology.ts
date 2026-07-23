import type { PrunedNode, OntologyType } from "../structureSchema";

/**
 * Stage 6 — Type against Ontology (§5b)
 * Heuristically assigns provisional ontology types & default names from the vocabulary.
 */
export function assignOntologyTypes(
  node: PrunedNode,
  depth: number = 0,
  insideFooter: boolean = false,
): PrunedNode {
  const childInsideFooter =
    insideFooter || node.tagName === "footer" || node.landmark === "contentinfo";
  const childrenTyped = node.children.map((c) =>
    assignOntologyTypes(c, depth + 1, childInsideFooter),
  );

  let provisionalType: OntologyType = "container";
  let name = formatDefaultName(node, childrenTyped, insideFooter, depth);
  let layoutAnnotation = node.layoutAnnotation;

  // 1. Landmarks -> region
  if (
    depth <= 1 &&
    (node.landmark || (node.tagName && ["header", "nav", "main", "footer"].includes(node.tagName)))
  ) {
    provisionalType = "region";
    // The depth-0 root is the whole page (`document.body`, or whatever the
    // pruner collapsed it into — possibly a landmark like <main>). It must
    // stay "Page", never a landmark-specific or hero name.
    if (depth > 0) {
      if (node.tagName === "header" || node.landmark === "banner") name = "SiteHeader";
      else if (node.tagName === "footer" || node.landmark === "contentinfo") name = "SiteFooter";
      else if (node.tagName === "nav" || node.landmark === "navigation") name = "Navbar";
      else if (node.tagName === "main" || node.landmark === "main") name = "MainContent";
    }

    // Region heights give a rebuild vertical rhythm (header/footer bands,
    // hero height, etc.) that the flex/grid annotation alone doesn't convey.
    // (Stage 8a replaces this raw tag with a padY/100vh note where the raw
    // height itself isn't the intent — §P7-2.) Only measurable off a real
    // DOM render — a vision-inferred node has no bounds to derive it from.
    if (node.bounds) {
      const heightTag = `h ${Math.round(node.bounds.height)}px`;
      layoutAnnotation = layoutAnnotation ? `${layoutAnnotation} · ${heightTag}` : heightTag;
    }
  }
  // 1b. Button/link groups -> composite "CtaRow" (§P5-3). Checked ahead of the
  // tag-based leaf bucket below because the wrapper is often a bare <p> — its
  // tag alone would otherwise mislabel a real action row as plain text.
  else if (isCtaRow(childrenTyped)) {
    provisionalType = "composite";
    name = "CtaRow";
  }
  // 2. Interactive / leaf elements -> atom
  else if (
    node.isInteractive ||
    node.isImageOrSvg ||
    (node.tagName &&
      ["button", "a", "input", "h1", "h2", "h3", "h4", "img", "svg", "p", "label"].includes(
        node.tagName,
      ))
  ) {
    provisionalType = "atom";
    // Name by tag first — `isInteractive` also covers a/input/select/textarea,
    // so it must not catch those before their specific tag names do.
    if (node.tagName === "a") name = "TextLink";
    else if (node.tagName && ["input", "select", "textarea"].includes(node.tagName)) name = "Input";
    else if (node.tagName?.startsWith("h")) name = "Heading";
    else if (node.isImageOrSvg) name = "Image";
    else if (node.tagName === "button") name = "Button";
    else if (node.isInteractive) name = "Button";
    // A heuristic name of "P" carries no more meaning than "Text" — collapse
    // it, keeping the real tag in the machine block only (§P5-3).
    else if (node.tagName === "p") name = "Text";
  }
  // 3. Repeated units -> content-block
  else if (node.instanceCount && node.instanceCount >= 2) {
    provisionalType = "content-block";
    if (isCardWorthy(node, childrenTyped)) {
      name = `${formatDefaultName(node)}Card`;
    } else if (
      node.hasText &&
      childrenTyped.length === 0 &&
      node.tagName &&
      ["span", "small", "p"].includes(node.tagName)
    ) {
      // Same collapse as the text-leaf cases below: a repeated bare span
      // (e.g. animated counter digits) is "Text ×N", not "SpanCard ×N".
      name = "Text";
    }
    // Otherwise keep the base default name — repetition alone doesn't make
    // something a card.
  }
  // 3b. Text-bearing leaves (e.g. span/small labels) -> atom, never container
  else if (node.hasText && childrenTyped.length === 0) {
    provisionalType = "atom";
    // Same collapse as the "p" case above, for the other plain-text tags.
    if (node.tagName && ["span", "small"].includes(node.tagName)) name = "Text";
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

/** A CTA row is a small group of buttons/links, whether flattened to one
 *  repeated representative (`detectRepetition`) or left as distinct siblings —
 *  so instances are summed rather than counting array entries. */
function isCtaRow(childrenTyped: PrunedNode[]): boolean {
  if (childrenTyped.length === 0) return false;
  const allButtonish = childrenTyped.every(
    (c) => c.componentName === "Button" || c.componentName === "TextLink",
  );
  if (!allButtonish) return false;
  const hasButton = childrenTyped.some((c) => c.componentName === "Button");
  const totalCount = childrenTyped.reduce((sum, c) => sum + (c.instanceCount || 1), 0);
  return hasButton && totalCount >= 2;
}

/** Only tags that plausibly wrap a card, with real card-like content
 *  (children, or mixed text+image), earn the `*Card` suffix — a repeated
 *  bare span/li (counter digits, plain list items) keeps its base name. */
function isCardWorthy(node: PrunedNode, childrenTyped: PrunedNode[]): boolean {
  if (!node.tagName || !["div", "section", "article", "li"].includes(node.tagName)) return false;
  return childrenTyped.length > 0 || (node.hasText && node.isImageOrSvg);
}

/** A hero is expected to sit in the initial viewport, not further down the page. */
const HERO_Y_THRESHOLD_PX = 900;

function formatDefaultName(
  node: PrunedNode,
  childrenTyped: PrunedNode[] = [],
  insideFooter: boolean = false,
  depth: number = 1,
): string {
  // The depth-0 root is the page itself — never a "Hero", whatever h1 it
  // contains and wherever that h1 sits. Internal call sites that name
  // non-root nodes omit `depth` and get the >0 default.
  if (depth === 0) return "Page";
  // `<section>` always carries `landmark === "section"` (harvester.ts getLandmark),
  // so this structure-aware check must run before the generic landmark fallback below
  // — otherwise every section collapses to the literal capitalized landmark ("Section").
  if (node.tagName === "div" || node.tagName === "section") {
    if (isHeroSection(node, childrenTyped)) return "Hero";
    if (isCardGrid(childrenTyped)) return "CardGrid";
    if (insideFooter && (node.layoutAnnotation?.includes("grid") || node.layoutAnnotation?.includes("flex"))) {
      return "FooterColumns";
    }
    if (node.layoutAnnotation?.includes("grid")) return "GridSection";
    if (node.layoutAnnotation?.includes("flex")) return "FlexContainer";
    return "Section";
  }
  if (node.tagName === "nav" && isNavLinksGroup(childrenTyped)) return "NavLinks";
  if (node.landmark) {
    return capitalize(node.landmark);
  }
  return capitalize(node.tagName ?? "");
}

/** First section containing an h1 near the top of the page reads as the hero.
 *  Bails without bounds (a vision-inferred node) rather than guessing. */
function isHeroSection(node: PrunedNode, childrenTyped: PrunedNode[]): boolean {
  if (!node.bounds || node.bounds.y >= HERO_Y_THRESHOLD_PX) return false;
  return containsTag(childrenTyped, "h1");
}

/** A container whose only content is one repeated card-like block is a card
 *  grid, whatever its own tag/layout — a more transferable name than the
 *  generic layout-derived "GridSection" (§P5-3). The repeated child must
 *  actually be a card (carry the `*Card` suffix) — a run of repeated text
 *  spans (e.g. counter digits) doesn't make its wrapper a "CardGrid". */
function isCardGrid(childrenTyped: PrunedNode[]): boolean {
  return (
    childrenTyped.length === 1 &&
    childrenTyped[0].provisionalType === "content-block" &&
    (childrenTyped[0].instanceCount ?? 1) >= 2 &&
    childrenTyped[0].componentName.endsWith("Card")
  );
}

/** A <nav> whose children are entirely link atoms is a nav link group, not
 *  just "Nav" (§P5-3). */
function isNavLinksGroup(childrenTyped: PrunedNode[]): boolean {
  return childrenTyped.length > 0 && childrenTyped.every((c) => c.componentName === "TextLink");
}

function containsTag(nodes: PrunedNode[], tag: string): boolean {
  return nodes.some((n) => n.tagName === tag || containsTag(n.children, tag));
}

function capitalize(s: string): string {
  if (!s) return "Block";
  return s.charAt(0).toUpperCase() + s.slice(1);
}
