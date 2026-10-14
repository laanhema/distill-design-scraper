import { z } from "zod";

export const ONTOLOGY_TYPES = [
  "atom",
  "container",
  "content-block",
  "region",
  "composite",
] as const;
export type OntologyType = (typeof ONTOLOGY_TYPES)[number];
export const ontologyTypeSchema = z.enum(ONTOLOGY_TYPES);

export const componentDefSchema = z.object({
  type: ontologyTypeSchema,
  composition: z.array(z.string()),
  variants: z.array(z.string()).optional(),
  role: z.string().optional(),
  instances: z.number().optional(),
  /** Design-token hint joined from the style dump by bounds overlap, e.g.
   *  "bg=surface · radius=8px · gap=24px" (`both` mode only). */
  tokens: z.string().optional(),
});
export type ComponentDef = z.infer<typeof componentDefSchema>;

export interface StructureTreeNode {
  component: string;
  /** Original HTML tag, only carried when the component name is a generic
   *  heuristic label (e.g. "Text") that would otherwise lose it. */
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
 * One entry of the Stage 9 section digest. Every field is joined from an
 * already-measured upstream artifact; an absent input yields an omitted field,
 * never a guess.
 */
export const sectionDigestSchema = z.object({
  name: z.string(),
  ordinal: z.number(),
  instances: z.number().optional(),
  /** AI one-line intent, e.g. "Sticky pill nav: logo left, 5 items center,
   *  CTA right" — only present when the Stage 7 AI pass returned one. */
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

export const structureMachineBlockSchema = z.object({
  reportKind: z.literal("layout-structure"),
  source: z.string(),
  viewport: z.tuple([z.number(), z.number()]),
  /** Every viewport this run captured (primary first), only present when
   *  secondary-viewport harvests ran alongside the primary render. */
  viewports: z.array(z.tuple([z.number(), z.number()])).optional(),
  captured: z.string(),
  fidelity: z.enum(["measured", "inferred"]),
  /** Whether component names/types came from the AI pass or the heuristic
   *  fallback — independent of `fidelity`, which only speaks to
   *  whether bounds/layout were measured. */
  naming: z.enum(["ai", "heuristic"]).optional(),
  /** Widest common width among MainContent's children that's narrower than
   *  the viewport — the page's centered-content constraint, if any. */
  contentMaxWidth: z.number().optional(),
  /** e.g. `{"GridSection": {"1440": "grid · 3col", "390": "grid · 1col"}}`.
   *  Only present when the secondary-viewport harvests produced a real delta. */
  responsive: z.record(z.string(), z.record(z.string(), z.string())).optional(),
  /** Only present when the measured pipeline produced at least one band. */
  sections: z.array(sectionDigestSchema).optional(),
  tree: z.array(structureTreeNodeSchema),
  components: z.record(z.string(), componentDefSchema),
});
export type StructureMachineBlock = z.infer<typeof structureMachineBlockSchema>;

export interface StructureReport {
  header: {
    source: string;
    viewport: string;
    /** All captured viewports, formatted (primary first), only present when
     *  secondary-viewport harvests ran alongside the primary render. */
    viewports?: string[];
    captured: string;
    fidelity: "measured" | "inferred";
    naming?: "ai" | "heuristic";
    contentMaxWidth?: number;
  };
  skeletonAscii: string;
  componentMapText: string;
  /** Formatted Stage 9 section-digest text — populated only when the machine
   *  block carries `sections`. */
  sectionsText?: string;
  machineBlock: StructureMachineBlock;
  markdown: string;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RawHarvestNode {
  id: string;
  tagName: string;
  ariaRole: string | null;
  landmark: string | null;
  bounds: Bounds;
  computedDisplay: string;
  /** Computed `position` — only captured for landmark nodes. */
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
 * A secondary-viewport DOM harvest, taken off the same session after resizing.
 */
export interface ResponsiveHarvest {
  viewport: { width: number; height: number };
  rawHarvestNode: RawHarvestNode;
  /** Computed h1/h2 font sizes at this viewport — used to
   *  annotate the type scale with `sizePxMobile` where it genuinely differs. */
  typeSizesPx?: Record<string, number>;
}

export interface PrunedNode {
  id: string;
  /** Only when this node came off a live render: a vision-inferred node has
   *  no HTML to read, so this is absent rather than guessed. */
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
