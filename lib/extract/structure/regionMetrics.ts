import type { PrunedNode } from "../structureSchema";
import type { StyleDump } from "@/lib/extract/styleDump";
import type { Report } from "@/lib/schema";
import { findMatchingStyleNode } from "./styleMatch";

/**
 * Stage 8a — Region Metrics (§P7-2)
 * `ontology.ts` stamps every region with its raw measured height (`h Npx`) —
 * useful as an intermediate value, but the wrong thing to hand a rebuilder:
 * it encodes "content was this tall at 1440×900", not the designer's intent.
 * This pass replaces that raw tag with the transferable signal:
 *   - viewport-pinned bands (sticky/fixed headers) — height IS the intent, kept as-is.
 *   - near-viewport-height heroes — height IS the intent (fills the fold), noted as `h 100vh`.
 *   - ordinary content regions — replaced with vertical padding (`padY Npx`),
 *     the rhythm a rebuild can actually reuse at any content length.
 */

/** Height-to-viewport ratio above which a region reads as "fills the fold". */
const VIEWPORT_FILL_RATIO = 0.92;
/** Max px difference for derived padding to snap to a spacing-scale step. */
const PAD_SNAP_TOLERANCE = 4;

const HEIGHT_TAG = /h \d+px/;

export interface RegionMetricsInput {
  root: PrunedNode;
  viewportHeight: number;
  /** Present only in `both` mode — enables exact padding lookup by bounds overlap. */
  dump?: StyleDump;
  /** Present only in `both` mode — enables snapping padding to the spacing scale. */
  report?: Report;
}

export function annotateRegionMetrics(input: RegionMetricsInput): PrunedNode {
  const { viewportHeight, dump, report } = input;

  function walk(node: PrunedNode): PrunedNode {
    const children = node.children.map(walk);

    if (node.provisionalType !== "region" || !node.layoutAnnotation) {
      return { ...node, children };
    }
    const rawTag = node.layoutAnnotation.match(HEIGHT_TAG)?.[0];
    if (!rawTag || !node.bounds) {
      return { ...node, children };
    }

    const isPinned = /sticky|fixed/.test(node.layoutAnnotation);
    const isViewportFilling = node.bounds.height >= viewportHeight * VIEWPORT_FILL_RATIO;

    let replacement = rawTag;
    if (!isPinned) {
      replacement = isViewportFilling
        ? "h 100vh"
        : derivePadY(node, children, dump, report) ?? rawTag;
    }

    const layoutAnnotation =
      replacement === rawTag
        ? node.layoutAnnotation
        : node.layoutAnnotation.replace(rawTag, replacement);

    return { ...node, layoutAnnotation, children };
  }

  return walk(input.root);
}

/** Vertical padding for a content region: measured directly when the style
 *  dump is available, else recovered from bounds math against its own
 *  (already-processed) children. */
function derivePadY(
  node: PrunedNode,
  children: PrunedNode[],
  dump: StyleDump | undefined,
  report: Report | undefined,
): string | null {
  if (!node.bounds) return null;

  let top: number | null = null;
  let bottom: number | null = null;

  if (dump) {
    const styleNode = findMatchingStyleNode(node.bounds, dump);
    if (styleNode?.layout) {
      [top, , bottom] = styleNode.layout.paddingsPx;
    }
  }

  if (top === null || bottom === null) {
    if (children.length === 0) return null;
    const last = children[children.length - 1];
    // A repetition-collapsed representative (`detectRepetition`) keeps only
    // its first occurrence's own bounds — not the full repeated group's span
    // — so treating it as "the last child" wildly overstates the bottom gap
    // when the group wraps onto further rows (e.g. a 2-row card grid). Bounds
    // math is unreliable here; bail rather than emit a fabricated number.
    if (last.instanceCount && last.instanceCount > 1) return null;
    const first = children[0];
    if (!first.bounds || !last.bounds) return null;
    top = first.bounds.y - node.bounds.y;
    bottom = node.bounds.y + node.bounds.height - (last.bounds.y + last.bounds.height);
  }

  if (top < 0 || bottom < 0) return null;

  const avg = (top + bottom) / 2;
  const snapped = report?.spacing?.scale.length
    ? nearestScaleValue(avg, report.spacing.scale)
    : null;
  return `padY ${snapped ?? Math.round(avg)}px`;
}

function nearestScaleValue(value: number, scale: number[]): number | null {
  let best: number | null = null;
  let bestDiff = Infinity;
  for (const s of scale) {
    const diff = Math.abs(s - value);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = s;
    }
  }
  return best !== null && bestDiff <= PAD_SNAP_TOLERANCE ? best : null;
}
