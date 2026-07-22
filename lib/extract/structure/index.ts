import type { Page } from "playwright";
import { harvestDomTree } from "./harvester";
import { pruneAndCollapse } from "./pruner";
import { detectRepetition } from "./repetition";
import { assignOntologyTypes } from "./ontology";
import { runStructureAILabeller, buildFallbackComponentMap } from "./structureAI";
import { emitStructureReport } from "./structureEmit";
import type { StructureReport, RawHarvestNode } from "../structureSchema";

export interface ExtractStructureOptions {
  sourceUrl: string;
  capturedAt?: string;
  viewport?: { width: number; height: number };
  rawHarvestNode?: RawHarvestNode; // For offline replay in eval harness
}

/**
 * Structure Extraction Pipeline Orchestrator (§5b)
 * Executes Stages 1-8 to produce a `layout-structure` report.
 */
export async function extractStructure(
  pageOrOptions: Page | ExtractStructureOptions,
  options?: ExtractStructureOptions,
): Promise<StructureReport> {
  let rawRoot: RawHarvestNode;
  let sourceUrl = "http://localhost";
  let viewport = { width: 1440, height: 900 };
  let capturedAt = new Date().toISOString();

  if ("evaluate" in pageOrOptions && typeof pageOrOptions.evaluate === "function") {
    const page = pageOrOptions as Page;
    rawRoot = await harvestDomTree(page);
    if (options) {
      sourceUrl = options.sourceUrl || sourceUrl;
      viewport = options.viewport || viewport;
      capturedAt = options.capturedAt || capturedAt;
    }
  } else {
    const opts = pageOrOptions as ExtractStructureOptions;
    if (!opts.rawHarvestNode) {
      throw new Error("extractStructure requires a Playwright Page or a rawHarvestNode option.");
    }
    rawRoot = opts.rawHarvestNode;
    sourceUrl = opts.sourceUrl || sourceUrl;
    viewport = opts.viewport || viewport;
    capturedAt = opts.capturedAt || capturedAt;
  }

  // Stage 3 & 4: Prune & Collapse Wrappers
  const prunedRoot = pruneAndCollapse(rawRoot);
  if (!prunedRoot) {
    throw new Error("DOM tree was completely pruned; no structure nodes remained.");
  }

  // Stage 5: Detect Repetition
  const repeatedRoot = detectRepetition(prunedRoot);

  // Stage 6: Type against Ontology
  const typedRoot = assignOntologyTypes(repeatedRoot);

  // Stage 7: AI Labelling pass
  const { root: labeledRoot, components } = await runStructureAILabeller(typedRoot);

  // Stage 8: Structure Emit
  return emitStructureReport({
    sourceUrl,
    viewport,
    capturedAt,
    fidelity: "measured",
    root: labeledRoot,
    components,
  });
}
