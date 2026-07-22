import { hex, parseColor } from "@/lib/color";
import type { StyleDump, NodeStyle } from "@/lib/extract/styleDump";
import type { PrunedNode } from "../structureSchema";
import type { Report } from "@/lib/schema";

/**
 * Stage 8b — Token Link (§P3-1, `both` mode only)
 * Joins structure components to the style dump by bounds overlap, then to the
 * design report by exact palette/spacing/radius match, producing a short
 * per-component hint (`bg=surface · radius=8px · gap=24px`). Best-effort: a
 * component with no close-enough style-dump node, or no exact token match,
 * simply gets no hint — this never guesses a token that isn't in the report.
 */

/** Max total px difference (x+y+w+h) for a style-dump node to "be" a PrunedNode. */
const BOUNDS_MATCH_TOLERANCE = 6;
/** Max px difference for a measured gap to count as "the same" scale step. */
const GAP_MATCH_TOLERANCE = 2;

function boundsDistance(
  a: PrunedNode["bounds"],
  b: NodeStyle["rect"],
): number {
  return (
    Math.abs(a.x - b.x) +
    Math.abs(a.y - b.y) +
    Math.abs(a.width - b.w) +
    Math.abs(a.height - b.h)
  );
}

function findMatchingStyleNode(
  bounds: PrunedNode["bounds"],
  dump: StyleDump,
): NodeStyle | null {
  let best: NodeStyle | null = null;
  let bestDist = Infinity;
  for (const n of dump.nodes) {
    const d = boundsDistance(bounds, n.rect);
    if (d < bestDist) {
      bestDist = d;
      best = n;
    }
  }
  return bestDist <= BOUNDS_MATCH_TOLERANCE ? best : null;
}

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
    const parsed = parseColor(bgObs.value);
    const bgHex = parsed ? hex(parsed) : null;
    const role = bgHex
      ? report.palette.colors.find((c) => c.hex.toLowerCase() === bgHex.toLowerCase())?.role
      : null;
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
