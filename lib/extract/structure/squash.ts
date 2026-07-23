import type { PrunedNode } from "../structureSchema";

/**
 * Stage 4b — Squash single-child generic wrapper chains (#30 / DIST-024).
 *
 * The Stage 4 collapse rule in `pruner.ts` deliberately exempts flex/grid
 * wrappers (a layout annotation makes a container "meaningful"), which is what
 * preserves chains like `Hero → Hero [grid · 1col] → Hero [grid · 12col]`.
 * This post-pass merges those chains back down to one node so the skeleton
 * reads at section altitude: a node with exactly one child absorbs that child
 * when the child is a *generic layout container* — no landmark, not
 * interactive, not a semantic tag. The outer node's identity (tag, landmark,
 * bounds) survives; the more specific layout annotation wins.
 *
 * Pure `PrunedNode → PrunedNode`, so it behaves identically for live-`Page`
 * and pre-harvested `rawHarvestNode` (eval replay) inputs, and must run on
 * both the primary and secondary-viewport derivations so the responsive
 * diff's positional alignment sees the same tree shape on both sides.
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
 * A child is absorbable only when it carries no identity of its own: no
 * landmark, not interactive, not a semantic HTML element, and it actually
 * wraps something (a leaf is content, not a wrapper). A vision-inferred node
 * has no real `tagName` to judge by, so it is never merged — absent evidence
 * means no squash, not a guessed one.
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

/** Outer identity survives; content flags propagate; annotation is resolved
 *  by specificity. */
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
 * The more specific annotation wins: `grid · Ncol` (N ≥ 2) > `grid · 1col` /
 * bare `grid` > `flex …` > none. Ties prefer the child's — the innermost
 * annotation describes the actual content layout (the hero keeps its
 * `grid · 12col`, not the `grid · 1col` shell). A sticky/fixed suffix on the
 * outer node (pinned landmark, `pruner.ts:42-46`) is never lost: it is
 * stripped before ranking and re-appended to the winner.
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
