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
      variant: z.string().optional(),
      count: z.number().optional(),
      variance: z.string().optional(),
      layout: z.string().optional(),
      children: z.array(structureTreeNodeSchema).optional(),
    }),
);

/**
 * Full layout-structure machine JSON block schema
 */
export const structureMachineBlockSchema = z.object({
  reportKind: z.literal("layout-structure"),
  source: z.string(),
  viewport: z.tuple([z.number(), z.number()]),
  captured: z.string(),
  fidelity: z.enum(["measured", "inferred"]),
  /** Widest common width among MainContent's children that's narrower than
   *  the viewport — the page's centered-content constraint, if any. */
  contentMaxWidth: z.number().optional(),
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
    captured: string;
    fidelity: "measured" | "inferred";
    contentMaxWidth?: number;
  };
  skeletonAscii: string;
  componentMapText: string;
  machineBlock: StructureMachineBlock;
  markdown: string;
}

/**
 * Intermediate node produced by the browser harvester (Stage 2)
 */
export interface RawHarvestNode {
  id: string;
  tagName: string;
  ariaRole: string | null;
  landmark: string | null;
  bounds: { x: number; y: number; width: number; height: number };
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
 * Clean node after pruning (Stage 3) & wrapper collapsing (Stage 4)
 */
export interface PrunedNode {
  id: string;
  tagName: string;
  ariaRole: string | null;
  landmark: string | null;
  bounds: { x: number; y: number; width: number; height: number };
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
