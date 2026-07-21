import Anthropic from "@anthropic-ai/sdk";
import {
  aiResponseSchema,
  type AiResponse,
  type ColorRole,
  type Identity,
  type ImageMood,
  type Palette,
  type Typography,
} from "@/lib/schema";
import { ROLE_USAGE } from "@/lib/extract/palette";

/**
 * Interpretation engine (§6, the AI lane). Only `identity`, `imageMood`, and
 * color-role *refinements* (Stage E, §5) go through the model. It receives the
 * screenshot **and** a compact JSON summary of the already-measured tokens, so
 * its read of "the feel" is grounded in the real palette/type, not just pixels.
 *
 * The model never invents a hex it could have measured and never emits prose:
 * output is strict JSON constrained by structured outputs, then re-validated
 * with Zod (§6). On a validation/refusal failure we retry once, then fall back
 * gracefully — a report without an AI lane is still valid (the fields are
 * optional), so a flaky model or a missing API key degrades to a measured-only
 * report rather than a hard error or a faked interpretation.
 */

// Vision-capable; low effort keeps this cheap and its read anchored on the
// measured tokens rather than free-associating. No temperature knob on 4.8.
const MODEL = "claude-opus-4-8";
const MAX_TOKENS = 1024;

const SYSTEM_PROMPT = `You are the interpretation layer of a design-system extractor.
You are given a screenshot of a rendered page (or an image) plus a JSON summary of
tokens that have ALREADY been measured deterministically from it. Your job is to
interpret the *feel*, not to re-measure what was measured.

Return ONLY these three things:
- identity: 3-6 lowercase adjectives, a one-line archetype (e.g. "The Sage — quiet, content-forward"), and a 1-2 sentence description of the design's character.
- imageMood: two lists of Unsplash-searchable queries — "hero" (main imagery) and "texture" (backgrounds/overlays). Each query must be concrete and photographable (e.g. "soft morning light interior"), never abstract (e.g. "innovation").
- roleRefinements: OPTIONAL corrections to the color role labels. You may relabel an existing hex (e.g. the color labelled "accent" is really the brand "primary"), but you must NEVER introduce a new hex or alter one. Reference colors only by a hex present in the summary. Omit or leave empty when the labels look right.`;

/** JSON Schema mirror of `aiResponseSchema` for structured outputs (§6). */
const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    identity: {
      type: "object",
      additionalProperties: false,
      properties: {
        adjectives: { type: "array", items: { type: "string" } },
        archetype: { type: "string" },
        description: { type: "string" },
      },
      required: ["adjectives", "archetype", "description"],
    },
    imageMood: {
      type: "object",
      additionalProperties: false,
      properties: {
        hero: { type: "array", items: { type: "string" } },
        texture: { type: "array", items: { type: "string" } },
      },
      required: ["hero", "texture"],
    },
    roleRefinements: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          hex: { type: "string" },
          role: {
            type: "string",
            enum: [
              "background",
              "surface",
              "text",
              "primary",
              "accent",
              "muted",
              "border",
            ],
          },
        },
        required: ["hex", "role"],
      },
    },
  },
  required: ["identity", "imageMood", "roleRefinements"],
} as const;

export interface InterpretInput {
  /** Base64 PNG (viewport screenshot for URLs, normalized image for images). */
  screenshotPngBase64: string;
  palette: Palette;
  typography?: Typography;
}

export interface Interpretation {
  identity: Identity;
  imageMood: ImageMood;
  /** Stage E relabels the model proposed, hex → desired role (§5). */
  roleRefinements: { hex: string; role: AiResponse["roleRefinements"][number]["role"] }[];
}

/**
 * A compact JSON summary of the measured tokens. Kept small on purpose — the
 * model needs enough to ground its read, not the whole style dump (§6, §12).
 */
function groundingSummary(palette: Palette, typography?: Typography): string {
  const summary: Record<string, unknown> = {
    palette: palette.colors.map((c) => ({
      role: c.role,
      hex: c.hex,
      areaWeight: c.areaWeight,
    })),
    contrast: palette.contrast.map((p) => ({
      pair: p.pair,
      ratio: p.ratio,
      wcag: p.wcag,
    })),
  };
  if (typography) {
    summary.typography = {
      families: typography.families.map((f) => ({
        name: f.name,
        role: f.role,
        classification: f.classification,
      })),
      scale: typography.scale.map((s) => ({ token: s.token, sizePx: s.sizePx })),
    };
  }
  return JSON.stringify(summary, null, 2);
}

/** True when a live interpretation is possible (an API key is configured). */
export function aiLaneAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** One model round-trip → parsed, Zod-validated JSON (or null on failure). */
async function requestOnce(
  client: Anthropic,
  screenshotPngBase64: string,
  summary: string,
): Promise<AiResponse | null> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    output_config: {
      effort: "low",
      format: {
        type: "json_schema",
        schema: OUTPUT_SCHEMA,
      },
    },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: screenshotPngBase64,
            },
          },
          {
            type: "text",
            text: `Measured tokens for this design:\n\n${summary}\n\nInterpret its identity and imageMood, and refine any mislabelled color roles.`,
          },
        ],
      },
    ],
  });

  // Structured outputs / a refusal / truncation can still leave us without a
  // clean JSON text block — Zod is the gate, not the model's word.
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  if (!text.trim()) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = aiResponseSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Run the AI lane. Returns null (never throws) when the key is absent or the
 * model fails twice — callers then emit a measured-only report (§6 fallback).
 */
export async function interpret(
  input: InterpretInput,
): Promise<Interpretation | null> {
  if (!aiLaneAvailable()) return null;

  const client = new Anthropic();
  const summary = groundingSummary(input.palette, input.typography);

  // One repair retry (§6), then graceful fallback.
  let ai = await requestOnce(client, input.screenshotPngBase64, summary).catch(
    () => null,
  );
  if (!ai) {
    ai = await requestOnce(client, input.screenshotPngBase64, summary).catch(
      () => null,
    );
  }
  if (!ai) return null;

  return {
    identity: { provenance: "ai", ...ai.identity },
    imageMood: { provenance: "ai", ...ai.imageMood },
    roleRefinements: ai.roleRefinements,
  };
}

export interface RefinementChange {
  hex: string;
  from: ColorRole;
  to: ColorRole;
}

/**
 * Stage E application (§5): fold the AI's role relabels into the measured
 * palette. The model can only ever move a role from one *existing* swatch to
 * another — never touch a hex — so this is a permutation: assigning role R to
 * swatch S, when another swatch T already holds R, *swaps* their roles rather
 * than dropping T. That keeps every role unique and every hex intact. Applied
 * changes are returned so the eval harness (§10) can measure how often the AI
 * overrides the heuristic and whether it helps; the palette stays `measured`.
 */
export function applyRoleRefinements(
  palette: Palette,
  refinements: Interpretation["roleRefinements"],
): { palette: Palette; changes: RefinementChange[] } {
  // Work on clones so the measured palette is never mutated in place.
  const colors = palette.colors.map((c) => ({ ...c }));
  const changes: RefinementChange[] = [];

  const relabel = (role: ColorRole, target: (typeof colors)[number]) => {
    target.role = role;
    target.name = role;
    target.usage = ROLE_USAGE[role];
  };

  for (const { hex, role } of refinements) {
    const target = colors.find(
      (c) => c.hex.toLowerCase() === hex.toLowerCase(),
    );
    // Ignore a hex the model didn't measure, or a no-op relabel.
    if (!target || target.role === role) continue;

    const from = target.role;
    const holder = colors.find((c) => c !== target && c.role === role);
    if (holder) relabel(from, holder); // swap the displaced role onto the holder
    relabel(role, target);
    changes.push({ hex: target.hex, from, to: role });
  }

  // Preserve the canonical role order for a stable, readable report.
  const order = new Map<ColorRole, number>(
    (["background", "surface", "text", "primary", "accent", "muted", "border"] as ColorRole[]).map(
      (r, i) => [r, i],
    ),
  );
  colors.sort((a, b) => (order.get(a.role) ?? 99) - (order.get(b.role) ?? 99));

  return { palette: { ...palette, colors }, changes };
}
