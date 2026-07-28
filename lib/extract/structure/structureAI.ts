import { z } from "zod";
import type { PrunedNode, ComponentDef, OntologyType } from "../structureSchema";
import { ONTOLOGY_TYPES } from "../structureSchema";
import { aiLaneAvailable, callModel, parseJsonLoose, retryOnce, ThinkingLevel } from "@/lib/aiLane";
import { findDigestBands } from "./sections";

export const aiStructureResponseSchema = z.object({
  nodeUpdates: z.array(
    z.object({
      id: z.string(),
      componentName: z.string(),
      type: z.enum(ONTOLOGY_TYPES),
    }),
  ),
  componentDefinitions: z.record(
    z.string(),
    z.object({
      type: z.enum(ONTOLOGY_TYPES),
      composition: z.array(z.string()),
      role: z.string().optional(),
    }),
  ),
  /** One-line human intent description per page section (#36 / DIST-030),
   *  keyed by the band node ids from the digest list in the prompt. */
  sectionDescriptions: z.record(z.string(), z.string()).optional(),
});

export type AiStructureResponse = z.infer<typeof aiStructureResponseSchema>;

/** JSON Schema mirror of `aiStructureResponseSchema` for structured outputs (§6). */
const STRUCTURE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    nodeUpdates: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          componentName: { type: "string" },
          type: { type: "string", enum: [...ONTOLOGY_TYPES] },
        },
        required: ["id", "componentName", "type"],
      },
    },
    componentDefinitions: {
      type: "object",
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: { type: "string", enum: [...ONTOLOGY_TYPES] },
          composition: { type: "array", items: { type: "string" } },
          role: { type: "string" },
        },
        required: ["type", "composition"],
      },
    },
    sectionDescriptions: {
      type: "object",
      additionalProperties: { type: "string" },
    },
  },
  required: ["nodeUpdates", "componentDefinitions"],
} as const;

/**
 * Stage 7 — AI Labelling Pass (§5b, §6)
 * Text-only AI call to refine component names, ontology types, and composition strings.
 */
export interface StructureAIResult {
  root: PrunedNode;
  components: Record<string, ComponentDef>;
  /** Whether component names/types came from the AI pass or the heuristic
   *  fallback (§P7-1) — a separate axis from `fidelity`, which only speaks to
   *  whether bounds/layout were measured. */
  naming: "ai" | "heuristic";
  /** One-line AI intent description per section digest (#36 / DIST-030),
   *  keyed by band node id — only present on the `naming: "ai"` path when
   *  the model returned lines for known band ids. */
  sectionDescriptions?: Record<string, string>;
}

/** Digest-list entry sent to the prompt so the model can write one intent
 *  line per section — the same band list Stage 9 digests, computed from the
 *  same `findDigestBands` source. */
type DigestListEntry = {
  id: string;
  name: string;
  instances?: number;
  layout?: string;
  contents?: string;
};

function summarizeDigestListForAI(root: PrunedNode): DigestListEntry[] {
  return findDigestBands(root).map((band) => ({
    id: band.id,
    name: band.componentName,
    ...(band.instanceCount && band.instanceCount > 1
      ? { instances: band.instanceCount }
      : {}),
    ...(band.layoutAnnotation ? { layout: band.layoutAnnotation } : {}),
    ...(band.textSnippet ? { contents: band.textSnippet } : {}),
  }));
}

/** One model round-trip → parsed, Zod-validated JSON (or null on failure) —
 *  same null-gate shape as `interpret.ts`, so `retryOnce` can drive it. */
async function requestOnce(
  compactTree: CompactTreeNode,
  digestList: DigestListEntry[],
): Promise<AiStructureResponse | null> {
  // Prompt-injection surface (issue #27 / review S6): the compact tree embeds
  // page-controlled strings — `textSnippet`, tag names, landmarks, and
  // heuristic component names all derive from the rendered page, so a hostile
  // page can address the model directly through its own content. The blast
  // radius is bounded by construction: the response must parse as JSON and
  // pass `aiStructureResponseSchema` (types constrained to the ONTOLOGY_TYPES
  // enum), and any parse/validation failure falls back to heuristic naming —
  // so the worst case is mislabeled component names/types in the report,
  // never tool use, code execution, or data exfiltration. Keep it that way:
  // widening what this response can drive widens the injection blast radius.
  const prompt = `You are a UI architecture assistant. You are given a measured DOM tree skeleton of a webpage.
Assign semantic component names (e.g., SiteHeader, Hero, FeatureCard, Button, PricingTier, SiteFooter) and ontology types (region, container, content-block, atom, composite) to the tree nodes.
Also provide composition strings for each defined component.

Ontology Vocabulary:
- region: major page sections (Header, Footer, Main, Sidebar)
- container: layout primitives (Grid, Stack, Section)
- content-block: self-contained feature/card/hero sections
- atom: elementary UI triggers or text (Button, Link, Heading, Image, Input)
- composite: structured combination of atoms

Here is the compact tree JSON:
\`\`\`json
${JSON.stringify(compactTree, null, 2)}
\`\`\`

Here is the page-section digest list (one entry per top-level page section, keyed by node id):
\`\`\`json
${JSON.stringify(digestList, null, 2)}
\`\`\`
For each digest entry, also write a one-line human intent description of the section
(e.g., "Sticky pill nav: logo left, 5 items center, CTA right") and return it in
\`sectionDescriptions\`, keyed by the same node id.

Return strict JSON matching this Zod schema:
{
  "nodeUpdates": [
    { "id": "node-1", "componentName": "SiteHeader", "type": "region" }
  ],
  "componentDefinitions": {
    "Button": { "type": "atom", "composition": ["Icon?", "Label"] },
    "FeatureCard": { "type": "content-block", "composition": ["Icon", "Heading", "Body"] }
  },
  "sectionDescriptions": {
    "node-1": "Sticky pill nav: logo left, 5 items center, CTA right"
  }
}`;

  const text = await callModel({
    user: prompt,
    jsonSchema: STRUCTURE_SCHEMA,
    maxOutputTokens: 4000,
    thinkingLevel: ThinkingLevel.LOW,
  });

  const raw = parseJsonLoose(text);
  if (raw === null) return null;

  const parsed = aiStructureResponseSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export async function runStructureAILabeller(
  root: PrunedNode,
  opts?: { forceHeuristicNaming?: boolean },
): Promise<StructureAIResult> {
  // Eval-harness short-circuit (DIST-013): when the caller forces heuristic
  // naming, skip the AI path entirely — before `aiLaneAvailable()` so no AI
  // calls are made. Keeps `npm run eval` offline even when `GEMINI_API_KEY` is
  // set, and suppresses DIST-030's `sectionDescriptions` (only produced on the
  // AI path).
  if (opts?.forceHeuristicNaming) {
    return { root, components: buildFallbackComponentMap(root), naming: "heuristic" };
  }

  const fallback = buildFallbackComponentMap(root);

  if (!aiLaneAvailable()) {
    return { root, components: fallback, naming: "heuristic" };
  }

  const compactTree = summarizeTreeForAI(root);
  // Section digest list for the same single call (#36 / DIST-030) — computed
  // from the same `findDigestBands` source Stage 9 uses, so the prompt and
  // the emitted digest agree on which nodes are sections.
  const digestList = summarizeDigestListForAI(root);

  // Shared AI-lane policy (`lib/aiLane.ts`): one repair retry, then graceful
  // fallback — here, heuristic naming instead of null.
  const response = await retryOnce(
    () => requestOnce(compactTree, digestList),
    (err, attempt) => console.warn(`AI Structure Labeller failed (attempt ${attempt}):`, err),
  );
  if (!response) {
    return { root, components: fallback, naming: "heuristic" };
  }

  // Apply updates to node tree
  const updateMap = new Map(response.nodeUpdates.map((u) => [u.id, u]));
  const updatedRoot = applyNodeUpdates(root, updateMap);

  // Merge component definitions
  const finalComponents: Record<string, ComponentDef> = {};
  for (const [name, def] of Object.entries(response.componentDefinitions)) {
    finalComponents[name] = {
      type: def.type,
      composition: def.composition,
      role: def.role,
    };
  }

  // Ensure all components used in the updated root have definitions
  populateMissingComponentDefs(updatedRoot, finalComponents);

  // Keep only descriptions keyed by band ids we actually asked about —
  // never trust model-invented keys.
  let sectionDescriptions: Record<string, string> | undefined;
  if (response.sectionDescriptions) {
    const knownIds = new Set(digestList.map((d) => d.id));
    const filtered = Object.fromEntries(
      Object.entries(response.sectionDescriptions).filter(([id]) => knownIds.has(id)),
    );
    if (Object.keys(filtered).length > 0) sectionDescriptions = filtered;
  }

  return { root: updatedRoot, components: finalComponents, naming: "ai", sectionDescriptions };
}

/** Compact JSON shape of the pruned tree sent to the model prompt. */
type CompactTreeNode = {
  id: string;
  tag?: string;
  landmark?: string;
  layout?: string;
  provisionalType: OntologyType;
  provisionalName: string;
  textSnippet?: string;
  instanceCount?: number;
  children: CompactTreeNode[];
};

function summarizeTreeForAI(node: PrunedNode): CompactTreeNode {
  return {
    id: node.id,
    tag: node.tagName,
    landmark: node.landmark || undefined,
    layout: node.layoutAnnotation || undefined,
    provisionalType: node.provisionalType,
    provisionalName: node.componentName,
    textSnippet: node.textSnippet || undefined,
    instanceCount: node.instanceCount || undefined,
    children: node.children.map(summarizeTreeForAI),
  };
}

function applyNodeUpdates(
  node: PrunedNode,
  updates: Map<string, { componentName: string; type: OntologyType }>,
): PrunedNode {
  const update = updates.get(node.id);
  const updatedName = update ? update.componentName : node.componentName;
  const updatedType = update ? update.type : node.provisionalType;

  return {
    ...node,
    componentName: updatedName,
    provisionalType: updatedType,
    children: node.children.map((c) => applyNodeUpdates(c, updates)),
  };
}

/**
 * Walks the tree aggregating every occurrence of each component name into one
 * definition: instance counts sum, and composition is the *union* of child
 * names seen across all occurrences (not just the first) so the map never
 * contradicts the machine-block tree when two instances of the same
 * component have different children.
 */
function walkComponentMap(n: PrunedNode, map: Record<string, ComponentDef>) {
  // Every occurrence contributes its own local count (1, or the sibling
  // group size `detectRepetition` collapsed onto it) — summed across the
  // whole tree, not just the first time a component name is seen.
  const occurrences = n.instanceCount || 1;
  // Leaves never compose from themselves; they render as "—" downstream.
  // A same-named child (e.g. a "GridSection" div nested directly inside
  // another "GridSection" div) is excluded too, since the generic default
  // namer can assign identical names to structurally-similar-but-distinct
  // nodes — that's never a meaningful composition of a component from
  // itself.
  const childNames = n.children
    .map((c) => c.componentName)
    .filter((name) => name !== n.componentName);

  const existing = map[n.componentName];
  if (!existing) {
    map[n.componentName] = {
      type: n.provisionalType,
      composition: Array.from(new Set(childNames)),
      instances: occurrences,
    };
  } else {
    const composition = new Set(existing.composition);
    childNames.forEach((name) => composition.add(name));
    existing.composition = Array.from(composition);
    existing.instances = (existing.instances || 0) + occurrences;
  }

  n.children.forEach((c) => walkComponentMap(c, map));
}

export function buildFallbackComponentMap(node: PrunedNode): Record<string, ComponentDef> {
  const map: Record<string, ComponentDef> = {};
  walkComponentMap(node, map);
  return map;
}

function populateMissingComponentDefs(node: PrunedNode, map: Record<string, ComponentDef>) {
  walkComponentMap(node, map);
}
