import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { PrunedNode, ComponentDef, OntologyType } from "../structureSchema";
import { ONTOLOGY_TYPES } from "../structureSchema";
import { AI_MODEL } from "@/lib/aiLane";

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
});

export type AiStructureResponse = z.infer<typeof aiStructureResponseSchema>;

/**
 * Stage 7 — AI Labelling Pass (§5b, §6)
 * Text-only Claude call to refine component names, ontology types, and composition strings.
 */
export interface StructureAIResult {
  root: PrunedNode;
  components: Record<string, ComponentDef>;
  /** Whether component names/types came from the AI pass or the heuristic
   *  fallback (§P7-1) — a separate axis from `fidelity`, which only speaks to
   *  whether bounds/layout were measured. */
  naming: "ai" | "heuristic";
}

export async function runStructureAILabeller(root: PrunedNode): Promise<StructureAIResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const fallback = buildFallbackComponentMap(root);

  if (!apiKey) {
    return { root, components: fallback, naming: "heuristic" };
  }

  const client = new Anthropic({ apiKey });
  const compactTree = summarizeTreeForAI(root);

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

Return strict JSON matching this Zod schema:
{
  "nodeUpdates": [
    { "id": "node-1", "componentName": "SiteHeader", "type": "region" }
  ],
  "componentDefinitions": {
    "Button": { "type": "atom", "composition": ["Icon?", "Label"] },
    "FeatureCard": { "type": "content-block", "composition": ["Icon", "Heading", "Body"] }
  }
}`;

  try {
    const message = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 2000,
      temperature: 0.1,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { root, components: fallback, naming: "heuristic" };
    }

    const parsed = aiStructureResponseSchema.safeParse(JSON.parse(jsonMatch[0]));
    if (!parsed.success) {
      return { root, components: fallback, naming: "heuristic" };
    }

    // Apply updates to node tree
    const updateMap = new Map(parsed.data.nodeUpdates.map((u) => [u.id, u]));
    const updatedRoot = applyNodeUpdates(root, updateMap);

    // Merge component definitions
    const finalComponents: Record<string, ComponentDef> = {};
    for (const [name, def] of Object.entries(parsed.data.componentDefinitions)) {
      finalComponents[name] = {
        type: def.type,
        composition: def.composition,
        role: def.role,
      };
    }

    // Ensure all components used in the updated root have definitions
    populateMissingComponentDefs(updatedRoot, finalComponents);

    return { root: updatedRoot, components: finalComponents, naming: "ai" };
  } catch (err) {
    console.warn("AI Structure Labeller failed, using heuristic fallback:", err);
    return { root, components: fallback, naming: "heuristic" };
  }
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
