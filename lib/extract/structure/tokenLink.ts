import type { Report } from "@/lib/schema";
import type { PrunedNode } from "../structureSchema";
import { findMatchingStyleNode } from "./styleMatch";
import { nearestPaletteRole } from "../roleMatch";
import type { NodeStyle, StyleDump } from "@/lib/extract/styleDump";

/**
 * Stage 8b — Token Link (§P3-1, `both` mode only)
 * Joins structure components to the style dump by bounds overlap, then to the
 * design report by exact palette/spacing/radius match, producing a short
 * per-component hint (`bg=surface · radius=8px · gap=24px`). Best-effort: a
 * component with no close-enough style-dump node, or no exact token match,
 * simply gets no hint — this never guesses a token that isn't in the report.
 */

/** Max px difference for a measured gap to count as "the same" scale step. */
const GAP_MATCH_TOLERANCE = 2;

/** Uniform-corner radius only — a composite (mixed-corner) value is skipped
 *  rather than guessed at, same guardrail as the deterministic extractor. */
function normalizeRadius(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "0px" || trimmed === "0") return null;
  if (trimmed === "50%" || trimmed.includes("999")) return "9999px";
  const parts = trimmed.split(/\s+/);
  return parts.every((p) => p === parts[0]) ? parts[0] : null;
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
  return best !== null && bestDiff <= GAP_MATCH_TOLERANCE ? best : null;
}

function buildHint(styleNode: NodeStyle, report: Report): string | null {
  const parts: string[] = [];

  const bgObs = styleNode.colors.find((c) => c.channel === "background");
  if (bgObs) {
    const role = nearestPaletteRole(bgObs.value, report.palette);
    if (role) parts.push(`bg=${role}`);
  }

  if (styleNode.layout?.borderRadius) {
    const normalized = normalizeRadius(styleNode.layout.borderRadius);
    if (normalized && report.radius?.scale.includes(normalized)) {
      parts.push(`radius=${normalized}`);
    }
  }

  const gap = styleNode.layout?.gapsPx[0];
  if (gap && report.spacing) {
    const matched = nearestScaleValue(Math.round(gap), report.spacing.scale);
    if (matched !== null) parts.push(`gap=${matched}px`);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

/** One hint per unique component name, keyed the same as the component map. */
export function linkComponentsToTokens(
  root: PrunedNode,
  dump: StyleDump,
  report: Report,
): Map<string, string> {
  const hints = new Map<string, string>();

  function walk(node: PrunedNode) {
    if (!hints.has(node.componentName)) {
      const styleNode = findMatchingStyleNode(node.bounds, dump);
      if (styleNode) {
        const hint = buildHint(styleNode, report);
        if (hint) hints.set(node.componentName, hint);
      }
    }
    node.children.forEach(walk);
  }
  walk(root);

  return hints;
}
