import type { PrunedNode } from "../structureSchema";

/**
 * Stage 4b — Squash single-child generic wrapper chains. Stage 4 exempts
 * flex/grid wrappers, which leaves chains like `Hero → Hero [grid · 1col] →
 * Hero [grid · 12col]`; this merges them so the skeleton reads at section
 * altitude. The outer node's identity survives; the more specific layout
 * annotation wins.
 *
 * Must run on both the primary and the secondary-viewport trees, so the
 * responsive diff's positional alignment sees the same shape on both sides.
 */

const SEMANTIC_TAGS = [
  "header",
  "nav",
  "main",
  "footer",
  "section",
  "article",
  "aside",
  "form",
];

export function squashWrapperChains(node: PrunedNode): PrunedNode {
  // Bottom-up: squash within children first so multi-link chains collapse fully.
  let current: PrunedNode = {
    ...node,
    children: node.children.map((child) => squashWrapperChains(child)),
  };

  // Then repeatedly absorb a lone generic-wrapper child into this node.
  while (current.children.length === 1 && isGenericLayoutContainer(current.children[0])) {
    current = mergePair(current, current.children[0]);
  }

  return current;
}

/**
 * Absorbable only with no identity of its own and something to wrap. A
 * vision-inferred node has no real `tagName` to judge by, so it is never
 * merged — absent evidence means no squash, not a guessed one.
 */
function isGenericLayoutContainer(child: PrunedNode): boolean {
  return (
    child.children.length > 0 &&
    !child.landmark &&
    !child.isInteractive &&
    child.tagName !== undefined &&
    !SEMANTIC_TAGS.includes(child.tagName)
  );
}

function mergePair(outer: PrunedNode, child: PrunedNode): PrunedNode {
  return {
    ...outer,
    layoutAnnotation: resolveAnnotation(outer.layoutAnnotation, child.layoutAnnotation),
    hasText: outer.hasText || child.hasText,
    textSnippet: outer.textSnippet ?? child.textSnippet,
    isImageOrSvg: outer.isImageOrSvg || child.isImageOrSvg,
    children: child.children,
  };
}

const POSITION_SUFFIX = /\s·\s(sticky|fixed)$/;

/**
 * `grid · Ncol` (N ≥ 2) > `grid · 1col` / bare `grid` > `flex …` > none; ties
 * prefer the child's, the actual content layout. A sticky/fixed suffix on the
 * outer node (see `pruneAndCollapse`) is stripped before ranking and
 * re-appended to the winner, so it is never lost.
 */
function resolveAnnotation(
  outer: string | undefined,
  child: string | undefined,
): string | undefined {
  let position: string | undefined;
  let outerBase = outer;
  if (outer === "sticky" || outer === "fixed") {
    position = outer;
    outerBase = undefined;
  } else if (outer) {
    const match = outer.match(POSITION_SUFFIX);
    if (match) {
      position = match[1];
      outerBase = outer.replace(POSITION_SUFFIX, "");
    }
  }

  // Equal rank prefers the child (innermost content layout).
  const winner =
    annotationRank(outerBase) > annotationRank(child) ? outerBase : child;

  if (!position) return winner;
  return winner ? `${winner} · ${position}` : position;
}

function annotationRank(annotation: string | undefined): number {
  if (!annotation) return 0;
  const gridCols = annotation.match(/^grid · (\d+)col/);
  if (gridCols) return Number(gridCols[1]) >= 2 ? 3 : 2;
  if (annotation.startsWith("grid")) return 2;
  if (annotation.startsWith("flex")) return 1;
  return 0;
}
