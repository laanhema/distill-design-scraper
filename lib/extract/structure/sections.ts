import type { PrunedNode, SectionDigest } from "../structureSchema";
import type { ResponsiveDeltas } from "./responsive";
import { bandPart, structuralPart } from "./annotationSegments";

/**
 * Stage 9 — Section Digest (#34 / DIST-028)
 * Ordered, measured per-band summary of the page: `SiteHeader`, each direct
 * child of `MainContent` (a collapsed repeated group like `SectionCard ×7`
 * stays **one** entry carrying `instances: 7`), `SiteFooter`. Every field is
 * joined from an already-measured upstream artifact — Stage 8a region metrics
 * (`band`), the typed tree's flex/grid annotations (`layout`), a counted
 * subtree walk (`contents`), Stage 8b token hints and Stage 7b responsive
 * deltas (joined by component names in the subtree). An absent input yields
 * an omitted field, never a guess; a page with no identifiable main region
 * yields no digest at all.
 */

const HEADING_TAGS = ["h1", "h2", "h3", "h4"];

export interface BuildSectionDigestsInput {
  /** Metrics-annotated (Stage 8a) labeled root. */
  root: PrunedNode;
  /** Stage 8b token hints — only present in `both` mode. */
  tokenHints?: Map<string, string>;
  /** Stage 7b responsive deltas — only present when secondary-viewport
   *  harvests ran and produced real deltas. */
  responsive?: ResponsiveDeltas;
  /** Stage 7 AI one-line intent descriptions keyed by band node id
   *  (#36 / DIST-030) — only present when `naming: "ai"`. */
  descriptions?: Record<string, string>;
}

/** Band identity keys off measured landmark/tag first — the final
 *  `componentName` may come from the AI pass and is only a fallback.
 *  Header/footer are searched outside `exclude` (the main subtree): a
 *  section-level `<header>`/`<footer>` inside an article or section is
 *  content, not a page band. */
function findBand(
  root: PrunedNode,
  kind: "header" | "main" | "footer",
  exclude: PrunedNode | null = null,
): PrunedNode | null {
  const predicates: Record<typeof kind, (n: PrunedNode) => boolean> = {
    header: (n) =>
      n.landmark === "banner" || n.landmark === "header" || n.tagName === "header",
    main: (n) => n.landmark === "main" || n.tagName === "main",
    footer: (n) =>
      n.landmark === "contentinfo" || n.landmark === "footer" || n.tagName === "footer",
  };
  const nameFallbacks: Record<typeof kind, string> = {
    header: "SiteHeader",
    main: "MainContent",
    footer: "SiteFooter",
  };
  const matches = (n: PrunedNode) =>
    predicates[kind](n) || n.componentName === nameFallbacks[kind];

  let found: PrunedNode | null = null;
  function walk(node: PrunedNode) {
    if (found) return;
    if (exclude && node === exclude) return;
    if (matches(node)) {
      found = node;
      return;
    }
    node.children.forEach(walk);
  }
  walk(root);
  return found;
}

/** First multi-child flex/grid annotation found descending into the section
 *  (the band node itself counts — after squashing, its own annotation may be
 *  the real content grid). */
function findContentLayout(band: PrunedNode): string | undefined {
  const own = structuralPart(band.layoutAnnotation);
  if (own && band.children.length > 1) return own;
  for (const child of band.children) {
    const found = findContentLayout(child);
    if (found) return found;
  }
  return undefined;
}

function plural(n: number, singular: string, pluralForm?: string): string {
  return `${n} ${n === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}

/** Counted subtree summary: headings, paragraphs, CTA rows, images, and
 *  nested repeated groups. Counts come from the (representative) subtree as
 *  measured — a collapsed group's multiplicity reads as its `×N` entry, never
 *  as extrapolated counts. */
function summarizeContents(band: PrunedNode): string | undefined {
  let headings = 0;
  let paragraphs = 0;
  let images = 0;
  let ctaRows = 0;
  let ctaActions = 0;
  const repeated: string[] = [];

  function walk(node: PrunedNode, isBandRoot: boolean, insideCtaRow: boolean) {
    if (node.tagName && HEADING_TAGS.includes(node.tagName)) headings++;
    if (node.tagName === "p") paragraphs++;
    if (node.isImageOrSvg) images++;

    const isCtaRow = node.componentName === "CtaRow";
    if (isCtaRow) ctaRows++;
    if (node.isInteractive && (insideCtaRow || isCtaRow)) ctaActions++;

    if (!isBandRoot && node.instanceCount && node.instanceCount > 1) {
      repeated.push(`${node.componentName} ×${node.instanceCount}`);
    }

    for (const child of node.children) {
      walk(child, false, insideCtaRow || isCtaRow);
    }
  }
  walk(band, true, false);

  const parts: string[] = [];
  if (headings > 0) parts.push(plural(headings, "heading"));
  if (paragraphs > 0) parts.push(plural(paragraphs, "paragraph"));
  if (ctaRows > 0) parts.push(`CtaRow (${plural(ctaActions, "action")})`);
  if (images > 0) parts.push(plural(images, "image"));
  parts.push(...repeated);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/** Unique component names in the subtree, in document order — the join key
 *  for both the token-hint and responsive-delta lookups. */
function subtreeComponentNames(band: PrunedNode): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  function walk(node: PrunedNode) {
    if (!seen.has(node.componentName)) {
      seen.add(node.componentName);
      names.push(node.componentName);
    }
    node.children.forEach(walk);
  }
  walk(band);
  return names;
}

function joinTokenHints(names: string[], tokenHints: Map<string, string>): string | undefined {
  const parts: string[] = [];
  for (const name of names) {
    const hint = tokenHints.get(name);
    if (hint) parts.push(`${name}: ${hint}`);
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/** Narrowest-first, same wording as `buildResponsiveSectionText` in
 *  structureEmit.ts (numeric string keys sort ascending in plain-object
 *  iteration regardless of insertion order). */
function joinResponsiveDeltas(names: string[], responsive: ResponsiveDeltas): string | undefined {
  const parts: string[] = [];
  for (const name of names) {
    const byWidth = responsive[name];
    if (!byWidth) continue;
    const deltas = Object.entries(byWidth).map(([w, ann]) => `${w}px \`${ann}\``);
    parts.push(`${name}: ${deltas.join(" → ")}`);
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

/**
 * The digest's band list: `SiteHeader`, each direct child of `MainContent`,
 * `SiteFooter` — empty when the page has no identifiable main region (band
 * identity would be a guess; the whole lane omits rather than fabricates).
 * Single source used by BOTH Stage 9 (`buildSectionDigests`) and the Stage 7
 * AI prompt (#36 / DIST-030), so the prompt's digest list and the emitted
 * digest can never disagree about which nodes are sections.
 */
export function findDigestBands(root: PrunedNode): PrunedNode[] {
  const main = findBand(root, "main");
  if (!main) return [];

  const header = findBand(root, "header", main);
  const footer = findBand(root, "footer", main);
  return [
    ...(header && header !== main ? [header] : []),
    ...main.children,
    ...(footer && footer !== main ? [footer] : []),
  ];
}

export function buildSectionDigests(
  input: BuildSectionDigestsInput,
): SectionDigest[] | undefined {
  const { root, tokenHints, responsive, descriptions } = input;

  const bands = findDigestBands(root);
  if (bands.length === 0) return undefined;

  const hasResponsive = Boolean(responsive && Object.keys(responsive).length > 0);

  const digests: SectionDigest[] = bands.map((band, i) => {
    const names = subtreeComponentNames(band);
    const digest: SectionDigest = {
      name: band.componentName,
      ordinal: i + 1,
    };
    if (band.instanceCount && band.instanceCount > 1) {
      digest.instances = band.instanceCount;
    }
    // Band ids survive every stage via spread copies, so the Stage 7 line
    // joins back even after the AI pass renamed the band.
    const description = descriptions?.[band.id];
    if (description) digest.description = description;
    const bandSegments = bandPart(band.layoutAnnotation);
    if (bandSegments) digest.band = bandSegments;
    const layout = findContentLayout(band);
    if (layout) digest.layout = layout;
    const contents = summarizeContents(band);
    if (contents) digest.contents = contents;
    if (tokenHints) {
      const tokens = joinTokenHints(names, tokenHints);
      if (tokens) digest.tokens = tokens;
    }
    if (hasResponsive) {
      const deltas = joinResponsiveDeltas(names, responsive!);
      if (deltas) digest.responsive = deltas;
    }
    return digest;
  });

  return digests;
}

/** Plain-text rendering of the digest list for `StructureReport.sectionsText`
 *  (#34). Body placement in the markdown document is DIST-029 — this is only
 *  the formatted artifact, derived from the same digest objects. */
export function formatSectionDigests(digests: SectionDigest[]): string {
  return digests
    .map((d) => {
      const lines = [`${d.ordinal}. ${d.name}${d.instances ? ` ×${d.instances}` : ""}`];
      if (d.description) lines.push(`   intent: ${d.description}`);
      if (d.band) lines.push(`   band: ${d.band}`);
      if (d.layout) lines.push(`   layout: ${d.layout}`);
      if (d.contents) lines.push(`   contents: ${d.contents}`);
      if (d.tokens) lines.push(`   tokens: ${d.tokens}`);
      if (d.responsive) lines.push(`   responsive: ${d.responsive}`);
      return lines.join("\n");
    })
    .join("\n\n");
}
