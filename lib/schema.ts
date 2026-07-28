import { z } from "zod";

/**
 * The report schema (§3). Frontmatter is the contract; the human body is
 * derived from it, so they never drift. Zod guards both the measured tokens we
 * assemble here and, later (§6), the AI's JSON before it is merged in.
 *
 * Phase 1 populates the measured lanes (palette, typography) and stamps every
 * section with `provenance`. The interpretive lanes (identity, imageMood) and
 * spacing/radius/elevation arrive in later phases; they are optional here so a
 * Phase-1 report validates without faking what it hasn't measured.
 */

export const PROVENANCE = ["measured", "inferred", "ai"] as const;
export const provenanceSchema = z.enum(PROVENANCE);

/**
 * The 7 core roles the AI lane may permute in a role refinement (§6). The
 * roles below in `COLOR_ROLES`' tail are evidence-gated — `on-primary` is
 * derived, and the semantic states need measured usage context — so the model
 * is never allowed to assign them. `OUTPUT_SCHEMA` in `lib/interpret.ts`
 * derives its enum from this same const so the two can't drift.
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
  // swatch (§P8-2). Kept in the same enum so it validates as a normal Swatch.
  "on-primary",
  // Semantic states (§P5-1): assigned only on strong evidence (hue band +
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
  name: z.string(),
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  role: colorRoleSchema,
  usage: z.string(),
  /** Share of painted screenshot pixels credited to this color (§5). */
  areaWeight: z.number().min(0).max(1),
  /** True when the color was recovered from pixels but missing from the DOM
   *  reads (a gradient/image color CSS couldn't see). */
  imageSourced: z.boolean().optional(),
  /** Set only when this swatch wasn't actually measured — e.g. `on-primary`
   *  picked by contrast because no real button text was observed (§P8-2).
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
  /** Computed size at the 390px responsive harvest (§P5-2 item 4), only
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
 * Component recipes (§P8-1): the base look of the handful of element classes
 * a rebuild needs verbatim, aggregated as the modal observed value per class
 * from the style dump. `bg`/`text`/`border` are palette-role names when the
 * measured color matches a swatch (nearest ΔE), else the raw hex — never a
 * fabricated role. `variant` is the bg-role-derived cluster label (e.g.
 * `primary`, `transparent`), present only when an element class kept more
 * than one variant cluster — a single-variant class has nothing to
 * distinguish, so the field is omitted rather than stamped redundantly.
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
 * Interactive states (§P5-1): declared `:hover`/`:focus-visible` deltas read
 * straight from the CSSOM (never computed/interpolated), attributed to the
 * palette role of the element's own base color. `target` is a `ColorRole`
 * rather than a free string on purpose — an entry only exists when the base
 * color actually matched a real swatch, so this lane can never point at a
 * role that isn't in the palette.
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

/** Motion / transition tokens (§P6): declared CSS transitions & animations. */
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

// ── Interpretive lanes (§6, AI). Stamped `provenance: ai`; optional so a
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
    /** Every source name, only present for a multi-image analysis (§P6-1) —
     *  `ref` stays a single human-readable summary for existing consumers. */
    refs: z.array(z.string()).optional(),
    capturedAt: z.string(),
  }),
  palette: paletteSchema,
  /** A second palette from a `prefers-color-scheme: dark` render (§P8-3),
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
  // Optional interpretive lanes (§6); present once the AI lane has run.
  identity: identitySchema.optional(),
  imageMood: imageMoodSchema.optional(),
});
export type Report = z.infer<typeof reportSchema>;

export * from "@/lib/extract/structureSchema";


/**
 * The AI's raw JSON contract (§6). This guards the *model output* before it is
 * merged into the report — provenance is stamped by us, never trusted from the
 * model, so it isn't part of this shape. `roleRefinements` is Stage E (§5): the
 * model may relabel an existing hex's role, never introduce or alter a hex.
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
        // Only the 7 core roles are AI-refinable — see REFINABLE_COLOR_ROLES.
        role: refinableColorRoleSchema,
      }),
    )
    .default([]),
});
export type AiResponse = z.infer<typeof aiResponseSchema>;
