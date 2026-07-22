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

export const COLOR_ROLES = [
  "background",
  "surface",
  "text",
  "primary",
  "accent",
  "muted",
  "border",
] as const;
export type ColorRole = (typeof COLOR_ROLES)[number];
export const colorRoleSchema = z.enum(COLOR_ROLES);

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
    capturedAt: z.string(),
  }),
  palette: paletteSchema,
  // Optional: unmeasured lanes are omitted, never faked.
  typography: typographySchema.optional(),
  spacing: spacingSchema.optional(),
  radius: radiusSchema.optional(),
  elevation: elevationSchema.optional(),
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
        role: colorRoleSchema,
      }),
    )
    .default([]),
});
export type AiResponse = z.infer<typeof aiResponseSchema>;
