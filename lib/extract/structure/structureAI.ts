import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { PrunedNode, ComponentDef, OntologyType } from "../structureSchema";
import { ONTOLOGY_TYPES } from "../structureSchema";

const MODEL = "claude-3-7-sonnet-20250219";

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
export async function runStructureAILabeller(
  root: PrunedNode,
): Promise<{ root: PrunedNode; components: Record<string, ComponentDef> }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const fallback = buildFallbackComponentMap(root);

  if (!apiKey) {
    return { root, components: fallback };
  }

  const client = new Anthropic({ apiKey });
  const compactTree = summarizeTreeForAI(root);

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
      model: MODEL,
      max_tokens: 2000,
      temperature: 0.1,
      messages: [{ role: "user", content: prompt }],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { root, components: fallback };
    }

    const parsed = aiStructureResponseSchema.safeParse(JSON.parse(jsonMatch[0]));
    if (!parsed.success) {
      return { root, components: fallback };
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

    return { root: updatedRoot, components: finalComponents };
  } catch (err) {
    console.warn("AI Structure Labeller failed, using heuristic fallback:", err);
    return { root, components: fallback };
  }
}

function summarizeTreeForAI(node: PrunedNode): any {
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

export function buildFallbackComponentMap(node: PrunedNode): Record<string, ComponentDef> {
  const map: Record<string, ComponentDef> = {};

  function walk(n: PrunedNode) {
    if (!map[n.componentName]) {
      const childNames = n.children.map((c) => c.componentName);
      const composition = childNames.length > 0 ? Array.from(new Set(childNames)) : [n.componentName];
      map[n.componentName] = {
        type: n.provisionalType,
        composition,
        instances: n.instanceCount || 1,
      };
    } else if (n.instanceCount) {
      map[n.componentName].instances = (map[n.componentName].instances || 1) + n.instanceCount;
    }
    n.children.forEach(walk);
  }

  walk(node);
  return map;
}

function populateMissingComponentDefs(node: PrunedNode, map: Record<string, ComponentDef>) {
  function walk(n: PrunedNode) {
    if (!map[n.componentName]) {
      const childNames = n.children.map((c) => c.componentName);
      map[n.componentName] = {
        type: n.provisionalType,
        composition: childNames.length > 0 ? Array.from(new Set(childNames)) : [n.componentName],
        instances: n.instanceCount || 1,
      };
    }
    n.children.forEach(walk);
  }
  walk(node);
}
