import type { PrunedNode } from "../structureSchema";

/**
 * Stage 5 — Detect Repetition (§5b)
 * Groups matching sibling node signatures into repeated component instances `×N`
 * and attaches instanceCount / varianceNote tags.
 */
export function detectRepetition(node: PrunedNode): PrunedNode {
  // Process children recursively first
  const childrenProcessed = node.children.map((child) => detectRepetition(child));

  if (childrenProcessed.length < 2) {
    return {
      ...node,
      children: childrenProcessed,
    };
  }

  // Count signature occurrences among siblings
  const signatureCounts: Record<string, number> = {};
  for (const child of childrenProcessed) {
    const key = getBaseSignature(child);
    signatureCounts[key] = (signatureCounts[key] || 0) + 1;
  }

  // Group children by base signature
  const newChildren: PrunedNode[] = [];
  const processedSignatures = new Set<string>();

  for (let i = 0; i < childrenProcessed.length; i++) {
    const child = childrenProcessed[i];
    const key = getBaseSignature(child);
    const count = signatureCounts[key] || 1;

    if (count >= 2) {
      if (!processedSignatures.has(key)) {
        processedSignatures.add(key);
        // Deduplicate repeated siblings into a single representative node with instanceCount = count
        newChildren.push({
          ...child,
          instanceCount: count,
        });
      } else {
        // Skip duplicate sibling instances so the tree skeleton lists the component with ×count
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
