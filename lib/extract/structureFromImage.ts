import Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { z } from "zod";
import { ONTOLOGY_TYPES, type PrunedNode, type StructureReport } from "./structureSchema";
import { buildFallbackComponentMap } from "./structure/structureAI";
import { emitStructureReport } from "./structure/structureEmit";
import { detectImageMediaType } from "./imageMediaType";
import { AI_MODEL, aiLaneAvailable, retryOnce } from "@/lib/aiLane";

/**
 * §P6-2 step 2 — Vision structure lane. There is no DOM for an uploaded image,
 * so the skeleton can only ever be *inferred* from pixels by a vision model —
 * never measured. This mirrors Stage 7 (`structureAI.ts`) in vocabulary and
 * naming conventions so a `both`-mode-style skeleton reads the same whether it
 * came from a live render or an upload, but it is a one-shot generation (there
 * is no heuristic fallback possible without a DOM to walk), gated entirely on
 * `ANTHROPIC_API_KEY`, and always stamped `fidelity: "inferred"`.
 */

const MAX_TOKENS = 4096;
const MAX_STRUCTURE_IMAGES = 4;

interface AiVisionNode {
  componentName: string;
  type: (typeof ONTOLOGY_TYPES)[number];
  textSnippet?: string;
  layoutAnnotation?: string;
  instanceCount?: number;
  isInteractive?: boolean;
  isImageOrSvg?: boolean;
  children?: AiVisionNode[];
}

const aiVisionNodeSchema: z.ZodType<AiVisionNode> = z.lazy(() =>
  z.object({
    componentName: z.string(),
    type: z.enum(ONTOLOGY_TYPES),
    textSnippet: z.string().optional(),
    layoutAnnotation: z.string().optional(),
    instanceCount: z.number().optional(),
    isInteractive: z.boolean().optional(),
    isImageOrSvg: z.boolean().optional(),
    children: z.array(aiVisionNodeSchema).optional(),
  }),
);

const aiVisionStructureResponseSchema = z.object({
  root: aiVisionNodeSchema,
});

const SYSTEM_PROMPT = `You are the vision-based structure inference layer of a design-system extractor.
You are given one or more screenshots of the same page or design — no DOM access, pixels only.
Infer its layout skeleton: a single root tree of components describing regions, containers, content
blocks, and atomic UI elements, using the same ontology and naming vocabulary a DOM-based extractor
would produce, so the two kinds of report read consistently.

Ontology types:
- "region": major page bands — SiteHeader, Navbar, MainContent, SiteFooter.
- "container": layout primitives — Section, GridSection (grid layout), FlexContainer (flex layout).
- "content-block": self-contained sections — Hero, CardGrid, or a repeated card named "<Noun>Card"
  (e.g. FeatureCard, PricingTier, Testimonial).
- "composite": small structured groups of atoms — CtaRow (2+ buttons/links acting together),
  NavLinks (a nav's link group).
- "atom": elementary elements — Button, TextLink, Input, Heading, Image, Text.

Naming rules:
- The top header band -> "SiteHeader"; its primary link group -> "Navbar" containing "NavLinks".
- The first hero-like band with a large heading near the top of the page -> "Hero".
- A repeated set of card-like blocks -> ONE node named "<Noun>Card" with "instanceCount" set to how
  many times it visually repeats — never emit each repetition as a separate sibling.
- The bottom footer band -> "SiteFooter"; a multi-column layout inside it -> "FooterColumns".
- Plain paragraph/label text -> "Text"; hyperlinks -> "TextLink"; form fields -> "Input".

Only describe what is visually inferable: rough layout arrangement (e.g. "flex · row",
"grid · 3col"), a short literal text snippet (not a paraphrase), and whether an element reads as
interactive or an image. Never invent pixel bounds, exact colors, or fonts — those belong to a
separate, measured design-tokens report and are out of scope here.

Return ONLY strict JSON matching this shape (no prose, no markdown fences):
{
  "root": {
    "componentName": "MainContent",
    "type": "region",
    "layoutAnnotation": "flex · column",
    "children": [
      { "componentName": "Hero", "type": "content-block", "textSnippet": "Build faster", "children": [...] }
    ]
  }
}`;

async function requestOnce(
  client: Anthropic,
  imageBlocks: {
    type: "image";
    source: { type: "base64"; media_type: "image/png" | "image/jpeg" | "image/webp" | "image/gif"; data: string };
  }[],
): Promise<AiVisionNode | null> {
  const message = await client.messages.create({
    model: AI_MODEL,
    max_tokens: MAX_TOKENS,
    temperature: 0.1,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: [
          ...imageBlocks,
          { type: "text", text: "Infer the layout skeleton for this design as strict JSON." },
        ],
      },
    ],
  });

  const text = message.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(jsonMatch[0]);
  } catch {
    return null;
  }
  const parsed = aiVisionStructureResponseSchema.safeParse(raw);
  return parsed.success ? parsed.data.root : null;
}

let idCounter = 0;
function toPrunedNode(node: AiVisionNode): PrunedNode {
  const id = `img-node-${idCounter++}`;
  return {
    id,
    // No DOM to read a tag or measure bounds from — left absent rather than
    // fabricated, same convention as landmark/ariaRole below.
    ariaRole: null,
    landmark: null,
    layoutAnnotation: node.layoutAnnotation,
    hasText: Boolean(node.textSnippet),
    textSnippet: node.textSnippet,
    isImageOrSvg: node.isImageOrSvg ?? false,
    isInteractive: node.isInteractive ?? false,
    signature: id,
    provisionalType: node.type,
    componentName: node.componentName,
    instanceCount: node.instanceCount,
    children: (node.children ?? []).map(toPrunedNode),
  };
}

export interface StructureFromImageInput {
  /** Base64 PNG(s), same convention as the palette/mood lane. Capped like the
   *  interpretation lane — more images add cost without adding read. */
  imagesPngBase64: string[];
  sourceRef: string;
  capturedAt: string;
}

/**
 * Runs the one-shot vision structure call and emits a `layout-structure`
 * report stamped `fidelity: "inferred"`. Returns null (never throws) when no
 * API key is configured or the model fails twice — callers then explain why
 * structure is unavailable rather than fabricating one (§6/§9 fallback
 * convention, same as `interpret.ts`).
 */
export async function structureFromImages(
  input: StructureFromImageInput,
): Promise<StructureReport | null> {
  if (!aiLaneAvailable()) return null;
  if (input.imagesPngBase64.length === 0) return null;

  const images = input.imagesPngBase64.slice(0, MAX_STRUCTURE_IMAGES);
  const mediaTypes = await Promise.all(images.map(detectImageMediaType));
  const imageBlocks = images.map((data, i) => ({
    type: "image" as const,
    source: { type: "base64" as const, media_type: mediaTypes[i], data },
  }));

  const client = new Anthropic();
  const aiRoot = await retryOnce(
    () => requestOnce(client, imageBlocks),
    (err, attempt) => console.warn(`Vision structure inference failed (attempt ${attempt}):`, err),
  );
  if (!aiRoot) return null;

  const root = toPrunedNode(aiRoot);
  const components = buildFallbackComponentMap(root);

  // Each image's own pixel dimensions are real, measured data — unlike a
  // browser viewport there is none to report, but the canvas(es) the model
  // actually looked at are honest to surface instead of a fabricated size.
  // When multiple images were sent, the first becomes the primary `viewport`
  // and the rest ride along as `secondaryViewports` (same mechanism the
  // responsive-harvest pass uses) rather than silently dropping their sizes.
  const measuredViewports = (
    await Promise.all(
      images.map(async (data) => {
        try {
          const metadata = await sharp(Buffer.from(data, "base64")).metadata();
          return metadata.width && metadata.height
            ? { width: metadata.width, height: metadata.height }
            : null;
        } catch {
          return null;
        }
      }),
    )
  ).filter((v): v is { width: number; height: number } => v !== null);
  const viewport = measuredViewports[0] ?? { width: 0, height: 0 };
  const secondaryViewports = measuredViewports.slice(1);

  return emitStructureReport({
    sourceUrl: input.sourceRef,
    viewport,
    secondaryViewports,
    capturedAt: input.capturedAt,
    fidelity: "inferred",
    naming: "ai",
    root,
    components,
  });
}
