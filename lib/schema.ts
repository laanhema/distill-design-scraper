import { z } from "zod";

/**
 * The report schema. Frontmatter is the contract; the human body is derived
 * from it, so they never drift. Zod guards both the measured tokens and the
 * AI's JSON before it is merged in. Every section carries a `provenance`, and
 * a lane that was not measured is optional and omitted, never faked.
 */

export const PROVENANCE = ["measured", "inferred", "ai"] as const;
export const provenanceSchema = z.enum(PROVENANCE);

/**
 * The roles the AI lane may permute in a role refinement. The rest of
 * `COLOR_ROLES` are evidence-gated (`on-primary` is derived, the semantic
 * states need measured usage context), so the model never assigns them. The
 * enum sent to the model is generated from this const, so the two can't drift.
 */
export const REFINABLE_COLOR_ROLES = [
  "background",
  "surface",
  "text",
  "primary",
  "accent",
  "muted",
  "border",
] as const;

export const COLOR_ROLES = [
  ...REFINABLE_COLOR_ROLES,
  // Not a scored role (never assigned by `assignRoles`) — the modal text
  // color measured on primary-background elements, added directly as a
  // swatch. Kept in the same enum so it validates as a normal Swatch.
  "on-primary",
  // Semantic states: assigned only on strong evidence (hue band +
  // usage context — an alert/status role or an aria-invalid element), never
  // synthesized from `primary`. Absent when no such evidence exists.
  "success",
  "warning",
  "danger",
] as const;
export type ColorRole = (typeof COLOR_ROLES)[number];
export const colorRoleSchema = z.enum(COLOR_ROLES);
export const refinableColorRoleSchema = z.enum(REFINABLE_COLOR_ROLES);

export const swatchSchema = z.object({
  name: z.string().optional(),
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  role: colorRoleSchema.optional(),
  usage: z.string().optional(),
  /** Share of painted screenshot pixels credited to this color. */
  areaWeight: z.number().min(0).max(1),
  /** True when the color was recovered from pixels but missing from the DOM
   *  reads (a gradient/image color CSS couldn't see). */
  imageSourced: z.boolean().optional(),
  /** Set only when this swatch wasn't actually measured — e.g. `on-primary`
   *  picked by contrast because no real button text was observed.
   *  Omitted (implicitly "measured") for every ordinary role swatch. */
  provenance: z.enum(["measured", "inferred"]).optional(),
});
export type Swatch = z.infer<typeof swatchSchema>;

export const contrastPairSchema = z.object({
  pair: z.tuple([z.string(), z.string()]),
  ratio: z.number(),
  wcag: z.enum(["AAA", "AA", "AA Large", "fail"]),
});
export type ContrastPair = z.infer<typeof contrastPairSchema>;

export const paletteSchema = z.object({
  provenance: provenanceSchema,
  colors: z.array(swatchSchema),
  contrast: z.array(contrastPairSchema),
});
export type Palette = z.infer<typeof paletteSchema>;

export const TYPE_ROLES = ["display", "heading", "body", "mono"] as const;
export const fontFamilySchema = z.object({
  name: z.string(),
  role: z.enum(TYPE_ROLES),
  classification: z.string(),
  weightsObserved: z.array(z.number()),
  /** Full measured `font-family` stack (name first), so a rebuild that can't
   *  load a proprietary/custom font still has the site's real fallback. */
  stack: z.array(z.string()),
});
export type FontFamily = z.infer<typeof fontFamilySchema>;

export const TYPE_TOKENS = [
  "display",
  "h1",
  "h2",
  "h3",
  "body",
  "small",
] as const;
export type TypeToken = (typeof TYPE_TOKENS)[number];
export const typeScaleStepSchema = z.object({
  token: z.enum(TYPE_TOKENS),
  sizePx: z.number(),
  /** Computed size at the 390px responsive harvest, only
   *  present when it differs enough from `sizePx` to be a real responsive
   *  choice rather than rounding noise. */
  sizePxMobile: z.number().optional(),
  weight: z.number(),
  lineHeight: z.number(),
  letterSpacing: z.string(),
});
export type TypeScaleStep = z.infer<typeof typeScaleStepSchema>;

export const typographySchema = z.object({
  provenance: provenanceSchema,
  families: z.array(fontFamilySchema),
  scale: z.array(typeScaleStepSchema),
});
export type Typography = z.infer<typeof typographySchema>;

export const spacingSchema = z.object({
  provenance: provenanceSchema,
  baseUnitPx: z.number(),
  scale: z.array(z.number()),
  unit: z.literal("px"),
});
export type Spacing = z.infer<typeof spacingSchema>;

export const radiusSchema = z.object({
  provenance: provenanceSchema,
  scale: z.array(z.string()),
});
export type Radius = z.infer<typeof radiusSchema>;

export const ELEVATION_LEVELS = ["sm", "md", "lg", "xl"] as const;
export type ElevationLevel = (typeof ELEVATION_LEVELS)[number];
export const elevationShadowSchema = z.object({
  name: z.enum(ELEVATION_LEVELS),
  value: z.string(),
});
export type ElevationShadow = z.infer<typeof elevationShadowSchema>;

export const elevationSchema = z.object({
  provenance: provenanceSchema,
  shadows: z.array(elevationShadowSchema),
});
export type Elevation = z.infer<typeof elevationSchema>;

/**
 * Component recipes. `bg`/`text`/`border` are palette-role names when the
 * measured color matches a swatch (nearest ΔE), else the raw hex — never a
 * fabricated role. `variant` (e.g. `primary`, `transparent`) is present only
 * when an element class kept more than one variant cluster.
 */
export const RECIPE_ELEMENTS = ["Button", "TextLink", "Input", "Card", "NavItem", "Badge"] as const;
export type RecipeElement = (typeof RECIPE_ELEMENTS)[number];
export const recipeElementSchema = z.enum(RECIPE_ELEMENTS);

export const recipeEntrySchema = z.object({
  element: recipeElementSchema,
  variant: z.string().optional(),
  padding: z.string(),
  radius: z.string().optional(),
  border: z.string().optional(),
  bg: z.string().optional(),
  text: z.string().optional(),
  typeToken: z.enum(TYPE_TOKENS).optional(),
  typeWeight: z.number().optional(),
});
export type RecipeEntry = z.infer<typeof recipeEntrySchema>;

export const recipesSchema = z.object({
  provenance: provenanceSchema,
  entries: z.array(recipeEntrySchema),
});
export type Recipes = z.infer<typeof recipesSchema>;

/**
 * Interactive states: declared `:hover`/`:focus-visible` deltas read straight
 * from the CSSOM. `target` is a `ColorRole`, not a free string, on purpose: an
 * entry only exists when the base color matched a real swatch.
 */
export const STATE_KINDS = ["hover", "focus"] as const;
export type StateKind = (typeof STATE_KINDS)[number];

export const stateChangeSchema = z.object({
  property: z.string(),
  from: z.string(),
  to: z.string(),
});
export type StateChange = z.infer<typeof stateChangeSchema>;

export const stateEntrySchema = z.object({
  target: colorRoleSchema,
  state: z.enum(STATE_KINDS),
  changes: z.array(stateChangeSchema),
});
export type StateEntry = z.infer<typeof stateEntrySchema>;

export const statesSchema = z.object({
  provenance: provenanceSchema,
  entries: z.array(stateEntrySchema),
});
export type States = z.infer<typeof statesSchema>;

export const MOTION_KINDS = ["transition", "animation"] as const;
export type MotionKind = (typeof MOTION_KINDS)[number];

export const motionEntrySchema = z.object({
  target: recipeElementSchema,
  kind: z.enum(MOTION_KINDS),
  property: z.string(),
  durationMs: z.number(),
  timingFunction: z.string(),
  delayMs: z.number().optional(),
  iterationCount: z.string().optional(),
});
export type MotionEntry = z.infer<typeof motionEntrySchema>;

export const keyframeStepSchema = z.object({
  offset: z.string(),
  properties: z.array(z.string()),
});
export type KeyframeStep = z.infer<typeof keyframeStepSchema>;

export const keyframeDefSchema = z.object({
  name: z.string(),
  steps: z.array(keyframeStepSchema),
});
export type KeyframeDef = z.infer<typeof keyframeDefSchema>;

export const motionSchema = z.object({
  provenance: provenanceSchema,
  entries: z.array(motionEntrySchema),
  keyframes: z.array(keyframeDefSchema).optional(),
});
export type Motion = z.infer<typeof motionSchema>;

// ── Interpretive lanes. Stamped `provenance: ai`; optional so a
// measured-only report (or an API-key-less run) validates without faking them.

export const identitySchema = z.object({
  provenance: z.literal("ai"),
  adjectives: z.array(z.string()).min(3).max(6),
  archetype: z.string(),
  description: z.string(),
});
export type Identity = z.infer<typeof identitySchema>;

export const imageMoodSchema = z.object({
  provenance: z.literal("ai"),
  hero: z.array(z.string()),
  texture: z.array(z.string()),
});
export type ImageMood = z.infer<typeof imageMoodSchema>;

export const reportSchema = z.object({
  reportKind: z.enum(["design-system", "palette-mood"]),
  source: z.object({
    type: z.enum(["url", "image"]),
    ref: z.string(),
    /** Every source name, only present for a multi-image analysis —
     *  `ref` stays a single human-readable summary for existing consumers. */
    refs: z.array(z.string()).optional(),
    capturedAt: z.string(),
  }),
  palette: paletteSchema,
  /** A second palette from a `prefers-color-scheme: dark` render,
   *  only present when the background actually shifted — a single-scheme
   *  site never gets a fabricated second palette. */
  paletteDark: paletteSchema.optional(),
  // Optional: unmeasured lanes are omitted, never faked.
  typography: typographySchema.optional(),
  spacing: spacingSchema.optional(),
  radius: radiusSchema.optional(),
  elevation: elevationSchema.optional(),
  recipes: recipesSchema.optional(),
  states: statesSchema.optional(),
  motion: motionSchema.optional(),
  // Optional interpretive lanes; present once the AI lane has run.
  identity: identitySchema.optional(),
  imageMood: imageMoodSchema.optional(),
});
export type Report = z.infer<typeof reportSchema>;

export * from "@/lib/extract/structureSchema";


/**
 * The AI's raw JSON contract, checked before the output is merged. Provenance
 * is stamped by us, never trusted from the model, so it isn't part of this
 * shape. A bound stated here is also sent to the provider (`OUTPUT_SCHEMA`).
 */
export const aiResponseSchema = z.object({
  identity: z.object({
    adjectives: z.array(z.string()).min(3).max(6),
    archetype: z.string().min(1),
    description: z.string().min(1),
  }),
  imageMood: z.object({
    hero: z.array(z.string()).min(1),
    texture: z.array(z.string()).min(1),
  }),
  roleRefinements: z
    .array(
      z.object({
        hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
        // Only the core roles are AI-refinable — see REFINABLE_COLOR_ROLES.
        role: refinableColorRoleSchema,
      }),
    )
    .default([]),
});
export type AiResponse = z.infer<typeof aiResponseSchema>;
