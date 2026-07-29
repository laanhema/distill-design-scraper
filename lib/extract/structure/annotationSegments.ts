/**
 * Shared layout-annotation segment classifier (DIST-066 / §12 Phase 8 P2-1).
 *
 * Classifies segments in layout annotation strings (`node.layoutAnnotation`,
 * e.g. `"grid · 3col · sticky · padY 24px"`) into structural parts (flex/grid shape)
 * vs band-identity parts (positioning/padding like `sticky`, `fixed`, `h 100vh`, `padY`).
 *
 * Used by:
 * - `sections.ts` (section digest): extracts `bandPart` for regional summary metrics, and `structuralPart` for section layout.
 * - `responsive.ts` (responsive diff): extracts `structuralPart` to compare layout shape across viewports without false diffs from sticky/padding tags.
 *
 * Band-vs-structural is ONE classification with two views. Any new band-level segment tag
 * (e.g. `padX`) MUST be added here so both consumers stay strictly in sync.
 */

export const BAND_SEGMENT_REGEX = /^(sticky|fixed|h \d+px|h 100vh|padY \d+px)$/;

/** Extract band-level positioning/padding segments (e.g., "sticky · padY 20px"). */
export function bandPart(annotation: string | undefined): string | undefined {
  if (!annotation) return undefined;
  const kept = annotation.split(" · ").filter((seg) => BAND_SEGMENT_REGEX.test(seg));
  return kept.length > 0 ? kept.join(" · ") : undefined;
}

/** Extract structural layout segments (flex/grid shape, stripping sticky/fixed/height/padY). */
export function structuralPart(annotation: string | undefined): string | undefined {
  if (!annotation) return undefined;
  const kept = annotation.split(" · ").filter((seg) => !BAND_SEGMENT_REGEX.test(seg));
  return kept.length > 0 ? kept.join(" · ") : undefined;
}
