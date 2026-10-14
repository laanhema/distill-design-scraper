/**
 * Classifies the segments of a layout annotation (e.g. `"grid · 3col · sticky ·
 * padY 24px"`) into structural parts (flex/grid shape) vs band-identity parts
 * (`sticky`, `fixed`, `h 100vh`, `padY`). The section digest and the
 * responsive diff (which must not report a false diff from a sticky/padding
 * tag) both read it.
 *
 * Band-vs-structural is ONE classification with two views. Any new band-level
 * segment tag (e.g. `padX`) MUST be added here so both consumers stay in sync.
 */

export const BAND_SEGMENT_REGEX = /^(sticky|fixed|h \d+px|h 100vh|padY \d+px)$/;

export function bandPart(annotation: string | undefined): string | undefined {
  if (!annotation) return undefined;
  const kept = annotation.split(" · ").filter((seg) => BAND_SEGMENT_REGEX.test(seg));
  return kept.length > 0 ? kept.join(" · ") : undefined;
}

export function structuralPart(annotation: string | undefined): string | undefined {
  if (!annotation) return undefined;
  const kept = annotation.split(" · ").filter((seg) => !BAND_SEGMENT_REGEX.test(seg));
  return kept.length > 0 ? kept.join(" · ") : undefined;
}
