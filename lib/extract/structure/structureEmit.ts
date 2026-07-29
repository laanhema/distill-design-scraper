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
  /** Secondary viewports captured alongside the primary render (§P5-2), for
   *  the header's `viewports:` line. */
  secondaryViewports?: { width: number; height: number }[];
  capturedAt: string;
  fidelity: "measured" | "inferred";
  /** Whether component names came from the AI pass or the heuristic
   *  fallback (§P7-1). */
  naming: "ai" | "heuristic";
  root: PrunedNode;
  components: Record<string, ComponentDef>;
  /** Per-component design-token hints (§P3-1), only present in `both` mode. */
  tokenHints?: Map<string, string>;
  /** Per-component layout deltas across captured viewports (§P5-2). */
  responsive?: ResponsiveDeltas;
  /** Ordered Stage 9 section digests (#34 / DIST-028) — only present when the
   *  measured pipeline produced at least one band. */
  sections?: SectionDigest[];
}

/**
 * Stage 8 — Structure Emit (§3, family 2)
 * Formats the ASCII skeleton, component map, and machine JSON block into the target report.
 */

/** Body skeleton renders depth-capped (#35 / DIST-029) — the full tree still
 *  lives in the `skeletonAscii` field and the machine block; the body only
 *  needs enough levels to orient the reader. Depth 1 = the root line. */
const BODY_SKELETON_MAX_DEPTH = 3;

/** Ontology types shown in the `## Components` body section (#35 / DIST-029) —
 *  atoms and generic containers (`FlexContainerCard` etc.) stay
 *  machine-block-only. */
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

  // 2. Build Component Map Text (body-filtered to region/content-block/composite)
  const componentMapText = buildComponentMapText(mergedComponents);

  // 2b. Format the digest once — the body section and the `sectionsText` field
  // share this single artifact so the two can never drift.
  const sectionsText = hasSections ? formatSectionDigests(sections!) : undefined;

  // 3. Build Machine Block JSON
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

  // 4. Assemble Full Markdown Document
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
  // entirely (never rendered empty) when their input is absent — the project's
  // `if (report.<field>)` convention.
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
    // Same artifact as the body's `## Page sections` section — one source,
    // no drift.
    ...(sectionsText ? { sectionsText } : {}),
    machineBlock,
    markdown,
  };
}

/** Bulleted `## Responsive` body list — one line per component with a real
 *  layout delta. Viewport order follows plain-object key iteration (numeric
 *  string keys sort ascending in JS regardless of insertion order), so this
 *  reads narrowest-first rather than capture order (§P5-2). */
function buildResponsiveSectionText(responsive: ResponsiveDeltas): string {
  const lines: string[] = [];
  for (const [name, byWidth] of Object.entries(responsive)) {
    const parts = Object.entries(byWidth).map(([w, ann]) => `${w}px \`${ann}\``);
    lines.push(`- **${name}** — ${parts.join(" → ")}`);
  }
  return lines.join("\n");
}

/**
 * Serialize the machine block with one line per top-level key, but each
 * value compact (no pretty-printing) — the `tree` is the machine contract and
 * has to stay, but restating it pretty-printed doubled the report size for no
 * reason (P3-2).
 */
function serializeMachineBlockCompact(block: StructureMachineBlock): string {
  const entries = Object.entries(block).map(
    ([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`,
  );
  return `{\n${entries.join(",\n")}\n}`;
}

/**
 * Content max-width (P2-2): the widest common width among MainContent's
 * children that's narrower than the viewport — i.e. the centered-content
 * constraint a typical `max-width` wrapper imposes, recovered from measured
 * bounds rather than CSS (which may set it on an ancestor we've collapsed).
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

/** ASCII tree rendering. `maxDepth` (1 = root line only) caps the recursion
 *  for the body's `## Skeleton (detail)` section — a node at the cap that
 *  still has children gets a single `…` line so the truncation is visible,
 *  never silent. Omit `maxDepth` for the full tree (the `skeletonAscii`
 *  field). */
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
    // Body shows intent-altitude entries only (#35 / DIST-029); atoms and
    // generic containers remain machine-block-only.
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
