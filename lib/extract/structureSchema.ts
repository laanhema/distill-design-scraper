import { z } from "zod";

/**
 * Component ontology types (§5b)
 */
export const ONTOLOGY_TYPES = [
  "atom",
  "container",
  "content-block",
  "region",
  "composite",
] as const;
export type OntologyType = (typeof ONTOLOGY_TYPES)[number];
export const ontologyTypeSchema = z.enum(ONTOLOGY_TYPES);

/**
 * Component definition in the machine JSON block (§3, family 2)
 */
export const componentDefSchema = z.object({
  type: ontologyTypeSchema,
  composition: z.array(z.string()),
  variants: z.array(z.string()).optional(),
  role: z.string().optional(),
  instances: z.number().optional(),
  /** Design-token hint joined from the style dump by bounds overlap, e.g.
   *  "bg=surface · radius=8px · gap=24px" (§P3-1, `both` mode only). */
  tokens: z.string().optional(),
});
export type ComponentDef = z.infer<typeof componentDefSchema>;

/**
 * Recursive tree node in the machine JSON block (§3, family 2)
 */
export interface StructureTreeNode {
  component: string;
  /** Original HTML tag, only carried when the component name is a generic
   *  heuristic label (e.g. "Text") that would otherwise lose it (§P5-3). */
  tag?: string;
  variant?: string;
  count?: number;
  variance?: string;
  layout?: string;
  children?: StructureTreeNode[];
}

export const structureTreeNodeSchema: z.ZodType<StructureTreeNode> = z.lazy(
  () =>
    z.object({
      component: z.string(),
      tag: z.string().optional(),
      variant: z.string().optional(),
      count: z.number().optional(),
      variance: z.string().optional(),
      layout: z.string().optional(),
      children: z.array(structureTreeNodeSchema).optional(),
    }),
);

/**
 * One entry of the Stage 9 section digest (#34 / DIST-028) — an ordered,
 * measured per-band summary of the page: `SiteHeader`, each direct child of
 * `MainContent`, `SiteFooter`. Every field is joined from an already-measured
 * upstream artifact; an absent input yields an omitted field, never a guess.
 */
export const sectionDigestSchema = z.object({
  /** Final component name (AI or heuristic) of the band node. */
  name: z.string(),
  /** 1-based document order across the digest list. */
  ordinal: z.number(),
  /** Repetition count when the band is a collapsed repeated group (×N). */
  instances: z.number().optional(),
  /** AI-provenance one-line intent description (#36 / DIST-030), e.g.
   *  "Sticky pill nav: logo left, 5 items center, CTA right" — only present
   *  when the Stage 7 AI pass ran and returned a line for this band; the
   *  heuristic fallback omits it. */
  description: z.string().optional(),
  /** Stage 8a band segments of the node's own annotation, e.g.
   *  "sticky · h 64px", "h 100vh", "padY 64px". */
  band: z.string().optional(),
  /** First multi-child flex/grid structural annotation found descending into
   *  the section — the real content grid, past squashed wrappers. */
  layout: z.string().optional(),
  /** Counted subtree summary, e.g.
   *  "2 headings · 3 paragraphs · CtaRow (2 actions) · 7 images · SectionCard ×7". */
  contents: z.string().optional(),
  /** Joined Stage 8b token hints for component names in the subtree
   *  ("SectionCard: bg=surface · radius=8px") — `both` mode only. */
  tokens: z.string().optional(),
  /** Joined Stage 7b deltas for component names in the subtree
   *  ("CardGrid: 390px `grid · 1col` → 1440px `grid · 3col`"). */
  responsive: z.string().optional(),
});
export type SectionDigest = z.infer<typeof sectionDigestSchema>;

/**
 * Full layout-structure machine JSON block schema
 */
export const structureMachineBlockSchema = z.object({
  reportKind: z.literal("layout-structure"),
  source: z.string(),
  viewport: z.tuple([z.number(), z.number()]),
  /** Every viewport this run captured (primary first), only present when
   *  secondary-viewport harvests ran alongside the primary render (§P5-2). */
  viewports: z.array(z.tuple([z.number(), z.number()])).optional(),
  captured: z.string(),
  fidelity: z.enum(["measured", "inferred"]),
  /** Whether component names/types came from the AI pass or the heuristic
   *  fallback (§P7-1) — independent of `fidelity`, which only speaks to
   *  whether bounds/layout were measured. */
  naming: z.enum(["ai", "heuristic"]).optional(),
  /** Widest common width among MainContent's children that's narrower than
   *  the viewport — the page's centered-content constraint, if any. */
  contentMaxWidth: z.number().optional(),
  /** Per-component layout-annotation deltas across captured viewports, keyed
   *  by component name then by viewport width in px (§P5-2), e.g.
   *  `{"GridSection": {"1440": "grid · 3col", "390": "grid · 1col"}}`. Only
   *  present when secondary-viewport harvests ran and produced at least one
   *  real delta. */
  responsive: z.record(z.string(), z.record(z.string(), z.string())).optional(),
  /** Ordered Stage 9 section digests (#34 / DIST-028) — only present when the
   *  measured pipeline produced at least one band; old captures and the
   *  vision-inferred lane simply omit it. */
  sections: z.array(sectionDigestSchema).optional(),
  tree: z.array(structureTreeNodeSchema),
  components: z.record(z.string(), componentDefSchema),
});
export type StructureMachineBlock = z.infer<typeof structureMachineBlockSchema>;

/**
 * Complete structure report result
 */
export interface StructureReport {
  header: {
    source: string;
    viewport: string;
    /** All captured viewports, formatted (primary first), only present when
     *  secondary-viewport harvests ran alongside the primary render (§P5-2). */
    viewports?: string[];
    captured: string;
    fidelity: "measured" | "inferred";
    naming?: "ai" | "heuristic";
    contentMaxWidth?: number;
  };
  skeletonAscii: string;
  componentMapText: string;
  /** Formatted Stage 9 section-digest text (#34 / DIST-028) — populated only
   *  when the machine block carries `sections`; body placement is DIST-029. */
  sectionsText?: string;
  machineBlock: StructureMachineBlock;
  markdown: string;
}

/**
 * Pixel bounding box, as measured off a live DOM render.
 */
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Intermediate node produced by the browser harvester (Stage 2)
 */
export interface RawHarvestNode {
  id: string;
  tagName: string;
  ariaRole: string | null;
  landmark: string | null;
  bounds: Bounds;
  computedDisplay: string;
  /** Computed `position` — only captured for landmark nodes (§P2-2). */
  cssPosition?: string;
  flexGridInfo?: {
    isFlex: boolean;
    isGrid: boolean;
    flexDirection?: string;
    justifyContent?: string;
    gridColumns?: number;
  };
  hasText: boolean;
  textSnippet?: string;
  isImageOrSvg: boolean;
  isInteractive: boolean; // button, a, input, select, textarea
  signature: string;
  children: RawHarvestNode[];
}

/**
 * A secondary-viewport DOM harvest (§P5-2) — the cheap second pass `ingest.ts`
 * takes off the same rendered session after resizing, so the responsive diff
 * has real measured layout at more than one width to compare against.
 */
export interface ResponsiveHarvest {
  viewport: { width: number; height: number };
  rawHarvestNode: RawHarvestNode;
  /** Computed h1/h2 font sizes at this viewport (§P5-2 item 4) — used to
   *  annotate the type scale with `sizePxMobile` where it genuinely differs. */
  typeSizesPx?: Record<string, number>;
}

/**
 * Clean node after pruning (Stage 3) & wrapper collapsing (Stage 4)
 */
export interface PrunedNode {
  id: string;
  /** Real DOM tag, only when this node came off a live render — a
   *  vision-inferred node (`structureFromImage.ts`) has no HTML to read, so
   *  this is genuinely absent rather than guessed (mirrors `landmark`/
   *  `ariaRole` below). */
  tagName?: string;
  ariaRole: string | null;
  landmark: string | null;
  /** Real measured pixel bounds, only when this node came off a live render —
   *  absent (not a fabricated zero rect) for a vision-inferred node. */
  bounds?: Bounds;
  layoutAnnotation?: string; // e.g. "flex · space-between" or "grid · 3col"
  hasText: boolean;
  textSnippet?: string;
  isImageOrSvg: boolean;
  isInteractive: boolean;
  signature: string;
  
  // Repetition detection (Stage 5) & typing (Stage 6)
  provisionalType: OntologyType;
  componentName: string;
  instanceCount?: number;
  varianceNote?: string;
  
  children: PrunedNode[];
}
