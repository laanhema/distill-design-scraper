import type { Report } from "@/lib/schema";
import type { PrunedNode } from "../structureSchema";
import { findMatchingStyleNode } from "./styleMatch";
import { nearestPaletteRole } from "../roleMatch";
import type { NodeStyle, StyleDump } from "@/lib/extract/styleDump";

/**
 * Stage 8b — Token Link (`both` mode only): joins components to the style dump
 * by bounds overlap, then to the report by exact token match, for a hint like
 * `bg=surface · radius=8px · gap=24px`. No close match means no hint — this
 * never guesses a token that isn't in the report.
 */

import { nearestScaleValue } from "./scaleMatch";

/** Max px difference for a measured gap to count as "the same" scale step. */
const GAP_MATCH_TOLERANCE = 2;

/** Uniform-corner radius only — a mixed-corner value is skipped rather than
 *  guessed at. */
function normalizeRadius(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "0px" || trimmed === "0") return null;
  if (trimmed === "50%" || trimmed.includes("999")) return "9999px";
  const parts = trimmed.split(/\s+/);
  return parts.every((p) => p === parts[0]) ? parts[0] : null;
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
    const matched = nearestScaleValue(
      Math.round(gap),
      report.spacing.scale,
      GAP_MATCH_TOLERANCE,
    );
    if (matched !== null) parts.push(`gap=${matched}px`);
  }

  return parts.length > 0 ? parts.join(" · ") : null;
}

export function linkComponentsToTokens(
  root: PrunedNode,
  dump: StyleDump,
  report: Report,
): Map<string, string> {
  const hints = new Map<string, string>();

  function walk(node: PrunedNode) {
    if (!hints.has(node.componentName) && node.bounds) {
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
