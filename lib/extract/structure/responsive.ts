import type { PrunedNode, ResponsiveHarvest } from "../structureSchema";
import { pruneAndCollapse } from "./pruner";
import { detectRepetition } from "./repetition";
import { assignOntologyTypes } from "./ontology";

/**
 * Stage 7b — Responsive diff (§P5-2)
 * Secondary-viewport harvests are run through the same deterministic
 * (non-AI) prune → repetition → ontology stages as the primary render, then
 * walked in lockstep against the primary's pre-AI typed tree to find where a
 * component's flex/grid shape actually changed. Matched by structural
 * position (tagName + landmark), not by node id — a second `page.evaluate`
 * harvest assigns its own id sequence, so ids never correspond across
 * viewports. Best-effort: nodes with no counterpart on the other side (e.g. a
 * mobile nav collapsed into a hidden hamburger) are simply not compared.
 */

/** Per-component layout-annotation deltas, keyed by component name then by
 *  viewport width in px, e.g. `{"GridSection": {"1440": "grid · 3col", "390": "grid · 1col"}}`. */
export type ResponsiveDeltas = Record<string, Record<string, string>>;

const NON_STRUCTURAL_SEGMENT = /^(sticky|fixed|h \d+px|h 100vh|padY \d+px)$/;

/** Strip sticky/fixed/height/padY notes so only the flex/grid shape itself is
 *  compared — a pinned header's `· sticky` tag isn't a responsive delta. */
function structuralPart(annotation: string | undefined): string | undefined {
  if (!annotation) return undefined;
  const kept = annotation.split(" · ").filter((seg) => !NON_STRUCTURAL_SEGMENT.test(seg));
  return kept.length > 0 ? kept.join(" · ") : undefined;
}

/** Greedy in-order alignment of two children arrays by (tagName, landmark),
 *  tolerant of nodes present on only one side — looks a short way ahead on
 *  either side to resync rather than giving up at the first mismatch. */
function alignChildren(a: PrunedNode[], b: PrunedNode[]): Array<[PrunedNode, PrunedNode]> {
  const LOOKAHEAD = 3;
  const sameKey = (x: PrunedNode, y: PrunedNode) =>
    x.tagName === y.tagName && x.landmark === y.landmark;

  const pairs: Array<[PrunedNode, PrunedNode]> = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (sameKey(a[i], b[j])) {
      pairs.push([a[i], b[j]]);
      i++;
      j++;
      continue;
    }
    const aheadInB = b.slice(j + 1, j + 1 + LOOKAHEAD).findIndex((n) => sameKey(a[i], n));
    const aheadInA = a.slice(i + 1, i + 1 + LOOKAHEAD).findIndex((n) => sameKey(b[j], n));
    if (aheadInB !== -1 && (aheadInA === -1 || aheadInB <= aheadInA)) {
      j += aheadInB + 1; // b[j] had no counterpart yet in a — skip it
    } else if (aheadInA !== -1) {
      i += aheadInA + 1; // a[i] had no counterpart yet in b — skip it
    } else {
      i++;
      j++; // neither resyncs nearby — drop both, move on
    }
  }
  return pairs;
}

function buildLabelIndex(node: PrunedNode, out: Map<string, string>) {
  out.set(node.id, node.componentName);
  node.children.forEach((c) => buildLabelIndex(c, out));
}

function walk(
  primary: PrunedNode,
  secondary: PrunedNode,
  primaryWidth: number,
  secondaryWidth: number,
  labelById: Map<string, string>,
  out: ResponsiveDeltas,
) {
  const pStruct = structuralPart(primary.layoutAnnotation);
  const sStruct = structuralPart(secondary.layoutAnnotation);
  if (pStruct && sStruct && pStruct !== sStruct) {
    const name = labelById.get(primary.id) ?? primary.componentName;
    const entry = out[name] ?? (out[name] = {});
    entry[String(primaryWidth)] = pStruct;
    entry[String(secondaryWidth)] = sStruct;
  }
  for (const [pc, sc] of alignChildren(primary.children, secondary.children)) {
    walk(pc, sc, primaryWidth, secondaryWidth, labelById, out);
  }
}

function typeSecondary(raw: ResponsiveHarvest["rawHarvestNode"]): PrunedNode | null {
  const pruned = pruneAndCollapse(raw);
  if (!pruned) return null;
  return assignOntologyTypes(detectRepetition(pruned));
}

export interface DiffResponsiveInput {
  /** Post-ontology (Stage 6), pre-AI primary tree — used for structural matching. */
  primaryTyped: PrunedNode;
  /** Post-AI (or heuristic) primary tree, same shape/ids as `primaryTyped` —
   *  supplies the final component names deltas are reported under. */
  primaryLabeled: PrunedNode;
  primaryViewport: { width: number; height: number };
  secondary: ResponsiveHarvest[];
}

export function diffResponsive(input: DiffResponsiveInput): ResponsiveDeltas {
  const labelById = new Map<string, string>();
  buildLabelIndex(input.primaryLabeled, labelById);

  const out: ResponsiveDeltas = {};
  for (const harvest of input.secondary) {
    const secTyped = typeSecondary(harvest.rawHarvestNode);
    if (!secTyped) continue; // fully pruned at this viewport — nothing to compare
    walk(
      input.primaryTyped,
      secTyped,
      input.primaryViewport.width,
      harvest.viewport.width,
      labelById,
      out,
    );
  }
  return out;
}
