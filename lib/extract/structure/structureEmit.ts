import {
  structureMachineBlockSchema,
  type PrunedNode,
  type ComponentDef,
  type SectionDigest,
  type StructureMachineBlock,
  type StructureTreeNode,
  type StructureReport,
} from "../structureSchema";
import type { ResponsiveDeltas } from "./responsive";
import { formatSectionDigests } from "./sections";

export interface StructureEmitInput {
  sourceUrl: string;
  viewport: { width: number; height: number };
  /** Secondary viewports captured alongside the primary render, for the
   *  header's `viewports:` line. */
  secondaryViewports?: { width: number; height: number }[];
  capturedAt: string;
  fidelity: "measured" | "inferred";
  naming: "ai" | "heuristic";
  root: PrunedNode;
  components: Record<string, ComponentDef>;
  /** Per-component design-token hints, only present in `both` mode. */
  tokenHints?: Map<string, string>;
  responsive?: ResponsiveDeltas;
  /** Only present when the measured pipeline produced at least one band. */
  sections?: SectionDigest[];
}

/**
 * Stage 10 — Structure Emit: formats the ASCII skeleton, component map, and
 * machine JSON block into the target report.
 */

/** Depth cap of the body skeleton (1 = the root line); the full tree stays in
 *  `skeletonAscii` and the machine block. */
const BODY_SKELETON_MAX_DEPTH = 3;

/** Atoms and generic containers stay machine-block-only. */
const BODY_COMPONENT_TYPES = new Set(["region", "content-block", "composite"]);

export function emitStructureReport(input: StructureEmitInput): StructureReport {
  const {
    sourceUrl,
    viewport,
    secondaryViewports,
    capturedAt,
    fidelity,
    naming,
    root,
    components,
    tokenHints,
    responsive,
    sections,
  } = input;
  const viewportStr = `${viewport.width}×${viewport.height}`;
  const allViewports = [viewport, ...(secondaryViewports ?? [])];
  const viewportsStrs = allViewports.map((v) => `${v.width}×${v.height}`);
  const hasResponsive = Boolean(responsive && Object.keys(responsive).length > 0);
  const hasSections = Boolean(sections && sections.length > 0);
  const contentMaxWidth = computeContentMaxWidth(root, viewport.width);

  const mergedComponents: Record<string, ComponentDef> = tokenHints
    ? Object.fromEntries(
        Object.entries(components).map(([name, def]) => {
          const tokens = tokenHints.get(name);
          return [name, tokens ? { ...def, tokens } : def];
        }),
      )
    : components;

  // 1. Build ASCII Skeleton — the field keeps the full tree (`scoreStructure`
  // greps it for region names); only the body rendering is depth-capped.
  const skeletonAscii = buildAsciiSkeleton(root);
  const skeletonDetailAscii = buildAsciiSkeleton(root, BODY_SKELETON_MAX_DEPTH);

  const componentMapText = buildComponentMapText(mergedComponents);

  // 2b. Format the digest once — the body section and the `sectionsText` field
  // share this single artifact so the two can never drift.
  const sectionsText = hasSections ? formatSectionDigests(sections!) : undefined;

  const treeNodes = buildMachineTreeNodes([root], fidelity);
  const machineBlock: StructureMachineBlock = {
    reportKind: "layout-structure",
    source: sourceUrl,
    viewport: [viewport.width, viewport.height],
    ...(secondaryViewports && secondaryViewports.length > 0
      ? { viewports: allViewports.map((v): [number, number] => [v.width, v.height]) }
      : {}),
    captured: capturedAt.split("T")[0],
    fidelity,
    naming,
    ...(contentMaxWidth !== undefined ? { contentMaxWidth } : {}),
    ...(hasResponsive ? { responsive } : {}),
    ...(hasSections ? { sections } : {}),
    tree: treeNodes,
    components: mergedComponents,
  };
  // Track B validates its own contract too, same as the design-tokens report.
  structureMachineBlockSchema.parse(machineBlock);

  let hostname = sourceUrl;
  try {
    hostname = new URL(sourceUrl).hostname;
  } catch {}

  const contentMaxWidthLine =
    contentMaxWidth !== undefined ? `\ncontent-max-width: ${contentMaxWidth}px` : "";
  const viewportsLine =
    secondaryViewports && secondaryViewports.length > 0
      ? `\nviewports: [${viewportsStrs.join(", ")}]`
      : "";

  const responsiveSection = hasResponsive
    ? `\n\n## Responsive\n\n${buildResponsiveSectionText(responsive!)}`
    : "";

  // Conditional sections carry their own leading blank line and are omitted
  // entirely (never rendered empty) when their input is absent.
  const pageSectionsSection = sectionsText ? `\n\n## Page sections\n\n${sectionsText}` : "";
  const componentsSection = componentMapText
    ? `\n\n## Components\n\nEach component is defined once; the skeleton holds the instances.\n\n${componentMapText}`
    : "";

  const markdown = `# Layout Structure — ${hostname}

\`\`\`
source:    ${sourceUrl}
viewport:  ${viewportStr}
captured:  ${capturedAt.split("T")[0]}
fidelity:  ${fidelity}
naming:    ${naming}${contentMaxWidthLine}${viewportsLine}
\`\`\`${pageSectionsSection}

## Skeleton (detail)

\`\`\`
${skeletonDetailAscii}
\`\`\`${componentsSection}${responsiveSection}

## Machine block

\`\`\`json
${serializeMachineBlockCompact(machineBlock)}
\`\`\`
`;

  return {
    header: {
      source: sourceUrl,
      viewport: viewportStr,
      ...(secondaryViewports && secondaryViewports.length > 0 ? { viewports: viewportsStrs } : {}),
      captured: capturedAt.split("T")[0],
      fidelity,
      naming,
      ...(contentMaxWidth !== undefined ? { contentMaxWidth } : {}),
    },
    skeletonAscii,
    componentMapText,
    ...(sectionsText ? { sectionsText } : {}),
    machineBlock,
    markdown,
  };
}

/** Reads narrowest-first, not in capture order: numeric string keys iterate
 *  ascending in JS regardless of insertion order. */
function buildResponsiveSectionText(responsive: ResponsiveDeltas): string {
  const lines: string[] = [];
  for (const [name, byWidth] of Object.entries(responsive)) {
    const parts = Object.entries(byWidth).map(([w, ann]) => `${w}px \`${ann}\``);
    lines.push(`- **${name}** — ${parts.join(" → ")}`);
  }
  return lines.join("\n");
}

/** One line per top-level key, each value compact: pretty-printing the `tree`
 *  doubles the report size. */
function serializeMachineBlockCompact(block: StructureMachineBlock): string {
  const entries = Object.entries(block).map(
    ([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`,
  );
  return `{\n${entries.join(",\n")}\n}`;
}

/**
 * The widest common width among MainContent's children that's narrower than
 * the viewport, recovered from measured bounds rather than CSS (which may set
 * `max-width` on an ancestor that was collapsed).
 */
function computeContentMaxWidth(root: PrunedNode, viewportWidth: number): number | undefined {
  const widths: number[] = [];

  function walk(node: PrunedNode) {
    const isMainContent =
      node.landmark === "main" ||
      node.tagName === "main" ||
      node.tagName === "section" ||
      node.componentName === "MainContent";
    if (isMainContent) {
      for (const child of node.children) {
        if (!child.bounds) continue;
        const w = Math.round(child.bounds.width);
        if (w > 0 && w < viewportWidth - 8) widths.push(w);
      }
    }
    node.children.forEach(walk);
  }
  walk(root);

  if (widths.length === 0) return undefined;

  // Bucket close widths together (scrollbar jitter, sub-pixel layout) so e.g.
  // 1266 and 1264 count as the same content-width rhythm, not two rivals.
  const BUCKET = 8;
  const counts = new Map<number, { count: number; sum: number }>();
  for (const w of widths) {
    const bucket = Math.round(w / BUCKET) * BUCKET;
    const entry = counts.get(bucket) ?? { count: 0, sum: 0 };
    entry.count++;
    entry.sum += w;
    counts.set(bucket, entry);
  }
  let best = widths[0];
  let bestN = 0;
  for (const { count, sum } of counts.values()) {
    if (count > bestN) {
      bestN = count;
      best = Math.round(sum / count);
    }
  }
  return best;
}

/** A node at `maxDepth` that still has children gets a single `…` line, so
 *  the truncation is visible, never silent. */
function buildAsciiSkeleton(
  node: PrunedNode,
  maxDepth?: number,
  prefix = "",
  depth = 1,
): string {
  let line = node.componentName;
  if (node.layoutAnnotation) {
    line += ` [${node.layoutAnnotation}]`;
  }
  if (node.instanceCount && node.instanceCount > 1) {
    line += ` ×${node.instanceCount}`;
  }
  if (node.textSnippet) {
    line += ` "${node.textSnippet.replace(/"/g, "'")}"`;
  }

  let result = line;

  const children = node.children;
  if (maxDepth !== undefined && depth >= maxDepth) {
    if (children.length > 0) {
      result += "\n" + prefix + "└─ …";
    }
    return result;
  }
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const childIsLast = i === children.length - 1;
    const connector = childIsLast ? "└─ " : "├─ ";
    const childPrefix = prefix + (childIsLast ? "   " : "│  ");
    result +=
      "\n" + prefix + connector + buildAsciiSkeleton(child, maxDepth, childPrefix, depth + 1);
  }

  return result;
}

function buildComponentMapText(components: Record<string, ComponentDef>): string {
  const lines: string[] = [];
  for (const [name, def] of Object.entries(components)) {
    if (!BODY_COMPONENT_TYPES.has(def.type)) continue;
    lines.push(`### ${name} \`${def.type}\``);
    if (def.role) {
      lines.push(`- role: ${def.role}`);
    }
    lines.push(
      `- composition: ${def.composition.length > 0 ? `\`${def.composition.join(" + ")}\`` : "—"}`,
    );
    if (def.variants && def.variants.length > 0) {
      lines.push(`- variants: ${def.variants.join(", ")}`);
    }
    if (def.instances) {
      lines.push(`- instances: ${def.instances}`);
    }
    if (def.tokens) {
      lines.push(`- tokens: ${def.tokens}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

function buildMachineTreeNodes(
  nodes: PrunedNode[],
  fidelity: "measured" | "inferred",
): StructureTreeNode[] {
  return nodes.map((node) => {
    const result: StructureTreeNode = {
      component: node.componentName,
    };
    // Only a "measured" tree's tagName is a real DOM observation — an
    // "inferred" (vision) tree has no HTML to read, so carrying it here
    // would present a fabricated tag as if it had been measured.
    if (fidelity === "measured" && node.componentName === "Text") {
      result.tag = node.tagName;
    }
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
      result.children = buildMachineTreeNodes(node.children, fidelity);
    }
    return result;
  });
}
