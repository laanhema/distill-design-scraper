import type { PrunedNode } from "../structureSchema";
import { findDigestBands } from "./sections";

/**
 * Stage 5 — Detect Repetition: groups matching sibling node signatures into
 * repeated component instances `×N` and attaches instanceCount / varianceNote
 * tags. The page bands that `findDigestBands` reports never collapse: two
 * sections that share a tag shape are still two sections.
 */
export function detectRepetition(root: PrunedNode): PrunedNode {
  const bandIds = new Set(findDigestBands(root).map((band) => band.id));
  return collapseRepeats(root, bandIds);
}

function collapseRepeats(node: PrunedNode, bandIds: ReadonlySet<string>): PrunedNode {
  const childrenProcessed = node.children.map((child) => collapseRepeats(child, bandIds));

  if (childrenProcessed.length < 2) {
    return {
      ...node,
      children: childrenProcessed,
    };
  }

  const signatureCounts: Record<string, number> = {};
  for (const child of childrenProcessed) {
    if (bandIds.has(child.id)) continue;
    const key = getBaseSignature(child);
    signatureCounts[key] = (signatureCounts[key] || 0) + 1;
  }

  const newChildren: PrunedNode[] = [];
  const processedSignatures = new Set<string>();

  for (let i = 0; i < childrenProcessed.length; i++) {
    const child = childrenProcessed[i];
    if (bandIds.has(child.id)) {
      newChildren.push(child);
      continue;
    }
    const key = getBaseSignature(child);
    const count = signatureCounts[key] || 1;

    if (count >= 2) {
      if (!processedSignatures.has(key)) {
        processedSignatures.add(key);
        newChildren.push({
          ...child,
          instanceCount: count,
        });
      } else {
        continue;
      }
    } else {
      // Near-match variance to an existing repeated group: tag, don't
      // collapse — the variant stays in the tree as its own node, labelled
      // as a variance of the repeated group it almost matches.
      for (const sig of Array.from(processedSignatures)) {
        if (isNearMatch(sig, key)) {
          child.varianceNote = `featured@${i + 1}`;
          break;
        }
      }
      newChildren.push(child);
    }
  }

  return {
    ...node,
    children: newChildren,
  };
}

function getBaseSignature(node: PrunedNode): string {
  // Tag + immediate child tags — falls back to componentName when tagName is
  // absent (a vision-inferred node has no real tag to key off of).
  const childTags = node.children
    .slice(0, 5)
    .map((c) => c.tagName ?? c.componentName)
    .join(",");
  return `${node.tagName ?? node.componentName}[${childTags}]`;
}

/** True when base tags are equal AND ≥80% of the (positional) child tags
 *  match. Two childless signatures with the same base tag trivially match. */
function isNearMatch(sigA: string, sigB: string): boolean {
  const [baseA, restA] = sigA.split("[");
  const [baseB, restB] = sigB.split("[");
  if (baseA !== baseB) return false;

  const childrenA = (restA ?? "").replace(/\]$/, "").split(",").filter(Boolean);
  const childrenB = (restB ?? "").replace(/\]$/, "").split(",").filter(Boolean);
  const longest = Math.max(childrenA.length, childrenB.length);
  if (longest === 0) return true;

  let matches = 0;
  for (let i = 0; i < longest; i++) {
    if (childrenA[i] === childrenB[i] && childrenA[i] !== undefined) matches++;
  }
  return matches / longest >= 0.8;
}
