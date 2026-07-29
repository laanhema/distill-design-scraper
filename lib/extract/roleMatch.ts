import { deltaE, parseColor } from "@/lib/color";
import type { ColorRole, Palette } from "@/lib/schema";

/**
 * Dump → palette role matching (§P3-1, shared by `tokenLink.ts`, `recipes.ts`
 * and `palette.ts`'s on-primary lookup). A measured color counts as "the same"
 * swatch when it's perceptually close, not string-equal — computed colors and
 * area-pass colors can differ by a shade of rounding even when they're the
 * same design token.
 */
const ROLE_MATCH_DELTA_E = 2;

/** Nearest palette role for a measured CSS color, or `null` if nothing is close enough. */
export function nearestPaletteRole(colorValue: string, palette: Palette): ColorRole | null {
  const parsed = parseColor(colorValue);
  if (!parsed) return null;

  let best: ColorRole | null = null;
  let bestDist = Infinity;
  for (const swatch of palette.colors) {
    const swatchColor = parseColor(swatch.hex);
    if (!swatchColor) continue;
    const dist = deltaE(parsed, swatchColor);
    if (dist < bestDist && swatch.role) {
      bestDist = dist;
      best = swatch.role;
    }
  }
  return bestDist <= ROLE_MATCH_DELTA_E ? best : null;
}
