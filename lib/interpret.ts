import { z } from "zod";
import {
  aiResponseSchema,
  REFINABLE_COLOR_ROLES,
  type AiResponse,
  type ColorRole,
  type Identity,
  type ImageMood,
  type Palette,
  type Typography,
} from "@/lib/schema";
import { ROLE_USAGE } from "@/lib/extract/palette";
import { detectImageMediaType } from "@/lib/extract/imageMediaType";
import { aiLaneAvailable, callModel, parseJsonLoose, retryOnce, warnAiFailure } from "@/lib/aiLane";

/**
 * The AI lane: only `identity`, `imageMood` and color-role refinements (Stage
 * E) go through the model, grounded in a summary of the measured tokens so it
 * never invents a hex. A flaky model or a missing API key degrades to a
 * measured-only report, never a hard error or a faked interpretation.
 */

// Thinking tokens share `maxOutputTokens` and no thinking cap is sent
// (`callModel` has none), so 2048 has to cover a thinking prelude plus the JSON
// answer without truncating it.
const MAX_TOKENS = 2048;

// The same page should read the same way on every run: the identity is a
// reading of measured tokens and one screenshot, not a creative draft. Without
// it, the routed model samples at its default (1.0 on Gemini) and words the
// same reading differently each time, which `npm run eval:ai` measures.
const TEMPERATURE = 0;

// Temperature 0 alone does not repeat the reply (see `ModelCall.seed`). 7 is
// the only value measured; after changing it, rerun `npm run eval:ai`.
const SEED = 7;

const SYSTEM_PROMPT = `You are the interpretation layer of a design-system extractor.
You are given a screenshot of a rendered page (or an image) plus a JSON summary of
tokens that have ALREADY been measured deterministically from it. Your job is to
interpret the *feel*, not to re-measure what was measured.

Return ONLY these three things:
- identity: 3-6 lowercase adjectives, a one-line archetype (e.g. "The Sage — quiet, content-forward"), and a 1-2 sentence description of the design's character.
- imageMood: two lists of Unsplash-searchable queries — "hero" (main imagery) and "texture" (backgrounds/overlays). Each query must be concrete and photographable (e.g. "soft morning light interior"), never abstract (e.g. "innovation").
- roleRefinements: OPTIONAL corrections to the color role labels. You may relabel an existing hex (e.g. the color labelled "accent" is really the brand "primary"), but you must NEVER introduce a new hex or alter one. Reference colors only by a hex present in the summary. Omit or leave empty when the labels look right.`;

/**
 * Generated from `aiResponseSchema` so the provider is told every bound the
 * Zod gate checks; a hand-written copy drifts, and a reply the provider
 * accepted then fails Zod and drops the whole lane. Check a new bound live over
 * OpenRouter: only a real request shows whether the routed model accepts a
 * generated keyword. The schema is sent non-strict, so Zod stays the only gate.
 *
 * The default `io: "output"` mode is intended: it keeps `roleRefinements` in
 * `required` (`io: "input"` would drop it, since Zod gives it `.default([])`).
 */
const OUTPUT_SCHEMA = z.toJSONSchema(aiResponseSchema);

/** Vision calls stay cheap and grounded — more images add cost without adding read. */
const MAX_INTERPRET_IMAGES = 4;

export interface InterpretInput {
  /** Base64 PNG(s) — viewport screenshot(s) for URLs, uploaded image(s) for image mode.
   *  Capped to `MAX_INTERPRET_IMAGES`; extras are ignored. */
  screenshotsPngBase64: string[];
  palette: Palette;
  typography?: Typography;
}

export interface Interpretation {
  identity: Identity;
  imageMood: ImageMood;
  /** Stage E relabels the model proposed, hex → desired role. */
  roleRefinements: { hex: string; role: AiResponse["roleRefinements"][number]["role"] }[];
}

/** Kept small on purpose: enough to ground the read, not the whole dump. */
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

export { aiLaneAvailable };

async function requestOnce(
  screenshotsPngBase64: string[],
  summary: string,
): Promise<AiResponse | null> {
  const mediaTypes = await Promise.all(screenshotsPngBase64.map(detectImageMediaType));
  // Prompt-injection surface: these pixels are page- or user-controlled, and a
  // rendered page or uploaded image can contain adversarial text ("ignore
  // previous instructions…") that the vision model reads like any other prompt
  // content. Impact is bounded by the Zod-gated response (`aiResponseSchema`
  // below) plus the graceful-null fallback, so injection can at worst skew
  // identity/imageMood text or a color-role refinement — never tool use or
  // data exfiltration. Widening what this response can drive widens the
  // injection blast radius.
  const images = screenshotsPngBase64.map((data, i) => ({ data, mediaType: mediaTypes[i] }));
  const promptNote =
    screenshotsPngBase64.length > 1
      ? `Measured tokens for this design (derived from ${screenshotsPngBase64.length} images of the same subject):`
      : "Measured tokens for this design:";

  const text = await callModel({
    images,
    system: SYSTEM_PROMPT,
    user: `${promptNote}\n\n${summary}\n\nInterpret its identity and imageMood, and refine any mislabelled color roles.`,
    jsonSchema: OUTPUT_SCHEMA,
    maxOutputTokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    seed: SEED,
  });

  const raw = parseJsonLoose(text);
  if (raw === null) return null;

  const parsed = aiResponseSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Run the AI lane. Returns null (never throws) when the key is absent or the
 * model fails twice — callers then emit a measured-only report.
 */
export async function interpret(
  input: InterpretInput,
): Promise<Interpretation | null> {
  if (!aiLaneAvailable()) return null;
  if (input.screenshotsPngBase64.length === 0) return null;

  const summary = groundingSummary(input.palette, input.typography);
  const screenshots = input.screenshotsPngBase64.slice(0, MAX_INTERPRET_IMAGES);

  // One repair retry, then graceful fallback.
  const ai = await retryOnce(
    () => requestOnce(screenshots, summary),
    (err, attempt) => warnAiFailure("AI Interpretation lane", attempt, err),
  );
  if (!ai) return null;

  return {
    identity: { provenance: "ai", ...ai.identity },
    imageMood: { provenance: "ai", ...ai.imageMood },
    roleRefinements: ai.roleRefinements,
  };
}

export interface RefinementChange {
  hex: string;
  from?: ColorRole;
  to: ColorRole;
}

/**
 * Stage E application: a permutation of roles over the existing swatches,
 * never a hex change. Assigning role R to swatch S when swatch T already holds
 * R *swaps* their roles rather than dropping T, so every role stays unique and
 * every hex intact; the palette stays `measured`.
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

  const dropRole = (target: (typeof colors)[number]) => {
    delete target.role;
    delete target.name;
    delete target.usage;
  };

  const isRefinableRole = (
    role?: ColorRole,
  ): role is (typeof REFINABLE_COLOR_ROLES)[number] =>
    Boolean(role && (REFINABLE_COLOR_ROLES as readonly string[]).includes(role));

  for (const { hex, role } of refinements) {
    const matches = colors.filter(
      (c) => c.hex.toLowerCase() === hex.toLowerCase(),
    );
    if (matches.length === 0) continue;

    let target: (typeof colors)[number] | undefined;
    if (matches.length === 1) {
      target = matches[0];
    } else {
      const refinableMatches = matches.filter((c) => isRefinableRole(c.role));
      if (refinableMatches.length === 1) {
        target = refinableMatches[0];
      } else {
        continue;
      }
    }

    if (!target || target.role === role) continue;

    const from = target.role;
    const holder = colors.find((c) => c !== target && c.role === role);
    if (holder) {
      if (isRefinableRole(from)) {
        relabel(from, holder); // swap the displaced role onto the holder
      } else {
        dropRole(holder); // drop non-refinable role so holder becomes role-less
      }
    }
    relabel(role, target);
    changes.push({ hex: target.hex, from, to: role });
  }

  // Preserve the canonical role order for a stable, readable report.
  const order = new Map<ColorRole, number>(
    REFINABLE_COLOR_ROLES.map((r, i) => [r, i]),
  );
  colors.sort((a, b) => {
    const aVal = a.role ? (order.get(a.role) ?? 99) : 999;
    const bVal = b.role ? (order.get(b.role) ?? 99) : 999;
    return aVal - bVal;
  });

  return { palette: { ...palette, colors }, changes };
}
