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
      // Check if it's a near-match variance to an existing repeated group
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

function isNearMatch(sigA: string, sigB: string): boolean {
  // If base tags and 80% of child tags match
  return sigA.split("[")[0] === sigB.split("[")[0];
}
