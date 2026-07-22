import type {
  PrunedNode,
  ComponentDef,
  StructureMachineBlock,
  StructureTreeNode,
  StructureReport,
} from "../structureSchema";

export interface StructureEmitInput {
  sourceUrl: string;
  viewport: { width: number; height: number };
  capturedAt: string;
  fidelity: "measured" | "inferred";
  root: PrunedNode;
  components: Record<string, ComponentDef>;
}

/**
 * Stage 8 — Structure Emit (§3, family 2)
 * Formats the ASCII skeleton, component map, and machine JSON block into the target report.
 */
export function emitStructureReport(input: StructureEmitInput): StructureReport {
  const { sourceUrl, viewport, capturedAt, fidelity, root, components } = input;
  const viewportStr = `${viewport.width}×${viewport.height}`;

  // 1. Build ASCII Skeleton
  const skeletonAscii = buildAsciiSkeleton(root);

  // 2. Build Component Map Text
  const componentMapText = buildComponentMapText(components);

  // 3. Build Machine Block JSON
  const treeNodes = buildMachineTreeNodes([root]);
  const machineBlock: StructureMachineBlock = {
    reportKind: "layout-structure",
    source: sourceUrl,
    viewport: [viewport.width, viewport.height],
    captured: capturedAt.split("T")[0],
    fidelity,
    tree: treeNodes,
    components,
  };

  // 4. Assemble Full Markdown Document
  let hostname = sourceUrl;
  try {
    hostname = new URL(sourceUrl).hostname;
  } catch {}

  const markdown = `# Layout Structure — ${hostname}

\`\`\`
source:    ${sourceUrl}
viewport:  ${viewportStr}
captured:  ${capturedAt.split("T")[0]}
fidelity:  ${fidelity}
\`\`\`

## Skeleton

\`\`\`
${skeletonAscii}
\`\`\`

## Components

Each component is defined once; the skeleton holds the instances.

${componentMapText}

## Machine block

\`\`\`json
${JSON.stringify(machineBlock, null, 2)}
\`\`\`
`;

  return {
    header: {
      source: sourceUrl,
      viewport: viewportStr,
      captured: capturedAt.split("T")[0],
      fidelity,
    },
    skeletonAscii,
    componentMapText,
    machineBlock,
    markdown,
  };
}

function buildAsciiSkeleton(node: PrunedNode, prefix = "", isLast = true): string {
  let line = node.componentName;
  if (node.layoutAnnotation) {
    line += `                  [${node.layoutAnnotation}]`;
  }
  if (node.instanceCount && node.instanceCount > 1) {
    line += ` ×${node.instanceCount}`;
  }
  if (node.textSnippet) {
    line += ` "${node.textSnippet.replace(/"/g, "'")}"`;
  }

  let result = line;

  const children = node.children;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const childIsLast = i === children.length - 1;
    const connector = childIsLast ? "└─ " : "├─ ";
    const childPrefix = prefix + (isLast ? "   " : "│  ");
    result += "\n" + prefix + connector + buildAsciiSkeleton(child, childPrefix, childIsLast);
  }

  return result;
}

function buildComponentMapText(components: Record<string, ComponentDef>): string {
  const lines: string[] = [];
  for (const [name, def] of Object.entries(components)) {
    lines.push(`### ${name} \`${def.type}\``);
    if (def.role) {
      lines.push(`- role: ${def.role}`);
    }
    lines.push(`- composition: \`${def.composition.join(" + ")}\``);
    if (def.variants && def.variants.length > 0) {
      lines.push(`- variants: ${def.variants.join(", ")}`);
    }
    if (def.instances) {
      lines.push(`- instances: ${def.instances}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

function buildMachineTreeNodes(nodes: PrunedNode[]): StructureTreeNode[] {
  return nodes.map((node) => {
    const result: StructureTreeNode = {
      component: node.componentName,
    };
    if (node.instanceCount && node.instanceCount > 1) {
      result.count = node.instanceCount;
    }
    if (node.varianceNote) {
      result.variance = node.varianceNote;
    }
    if (node.layoutAnnotation) {
      result.layout = node.layoutAnnotation;
    }
    if (node.children.length > 0) {
      result.children = buildMachineTreeNodes(node.children);
    }
    return result;
  });
}
