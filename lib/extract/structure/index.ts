import { pruneAndCollapse } from "./pruner";
import { squashWrapperChains } from "./squash";
import { detectRepetition } from "./repetition";
import { assignOntologyTypes } from "./ontology";
import { runStructureAILabeller } from "./structureAI";
import { emitStructureReport } from "./structureEmit";
import { linkComponentsToTokens } from "./tokenLink";
import { annotateRegionMetrics } from "./regionMetrics";
import { diffResponsive } from "./responsive";
import { buildSectionDigests } from "./sections";
import type { StructureReport, RawHarvestNode, ResponsiveHarvest } from "../structureSchema";
import type { StyleDump } from "../styleDump";
import type { Report } from "@/lib/schema";

export interface ExtractStructureOptions {
  sourceUrl: string;
  capturedAt?: string;
  viewport?: { width: number; height: number };
  rawHarvestNode: RawHarvestNode; // Required: Track B DOM harvest tree
  /** Force the Stage 7 AI labeller to its heuristic fallback without ever
   *  constructing a model client — used by the eval harness to keep
   *  `npm run eval` offline and deterministic even when an API key is set
   *  (DIST-013). Default false → AI path runs when a key is present. */
  forceHeuristicNaming?: boolean;
  /** Present only in `both` mode — enables the P3-1 token cross-link. */
  dump?: StyleDump;
  report?: Report;
  /** Secondary-viewport harvests off the same session (§P5-2), for the responsive diff. */
  responsiveHarvests?: ResponsiveHarvest[];
}

/**
 * Structure Extraction Pipeline Orchestrator (§5b)
 * Executes Stages 1-9 to produce a `layout-structure` report.
 */
export async function extractStructure(
  options: ExtractStructureOptions,
): Promise<StructureReport> {
  const {
    rawHarvestNode,
    sourceUrl = "http://localhost",
    viewport = { width: 1440, height: 900 },
    capturedAt = new Date().toISOString(),
    dump,
    report,
    responsiveHarvests,
    forceHeuristicNaming,
  } = options;

  // Stage 3 & 4: Prune & Collapse Wrappers
  const prunedRoot = pruneAndCollapse(rawHarvestNode);
  if (!prunedRoot) {
    throw new Error("DOM tree was completely pruned; no structure nodes remained.");
  }

  // Stage 4b: Squash single-child generic wrapper chains (#30)
  const squashedRoot = squashWrapperChains(prunedRoot);

  // Stage 5: Detect Repetition
  const repeatedRoot = detectRepetition(squashedRoot);

  // Stage 6: Type against Ontology
  const typedRoot = assignOntologyTypes(repeatedRoot);

  // Stage 7: AI Labelling pass
  const {
    root: labeledRoot,
    components,
    naming,
    sectionDescriptions,
  } = await runStructureAILabeller(typedRoot, { forceHeuristicNaming });

  // Stage 7b: Responsive diff — only when secondary-viewport harvests were
  // captured alongside the primary render (§P5-2).
  const responsive =
    responsiveHarvests && responsiveHarvests.length > 0
      ? diffResponsive({
          primaryTyped: typedRoot,
          primaryLabeled: labeledRoot,
          primaryViewport: viewport,
          secondary: responsiveHarvests,
        })
      : undefined;

  // Stage 8a: Region Metrics — replace raw region heights with vertical
  // padding intent where the height itself isn't the point (§P7-2).
  const metricsRoot = annotateRegionMetrics({
    root: labeledRoot,
    viewportHeight: viewport.height,
    dump,
    report,
  });

  // Stage 8b: Token Link — only when the design-tokens lane ran alongside us.
  const tokenHints =
    dump && report ? linkComponentsToTokens(metricsRoot, dump, report) : undefined;

  // Stage 9: Section Digest (#34 / DIST-028) — ordered measured per-band
  // summary, joined from the Stage 7b/8a/8b artifacts above, plus the Stage 7
  // AI intent lines when present (#36 / DIST-030).
  const sections = buildSectionDigests({
    root: metricsRoot,
    tokenHints,
    responsive,
    descriptions: sectionDescriptions,
  });

  // Stage 10: Structure Emit
  return emitStructureReport({
    sourceUrl,
    viewport,
    secondaryViewports: responsiveHarvests?.map((h) => h.viewport),
    capturedAt,
    fidelity: "measured",
    naming,
    root: metricsRoot,
    components,
    tokenHints,
    responsive,
    sections,
  });
}
