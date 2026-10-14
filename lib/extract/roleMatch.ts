import { deltaE, parseColor } from "@/lib/color";
import type { ColorRole, Palette } from "@/lib/schema";

/**
 * A measured color is "the same" swatch when perceptually close, not
 * string-equal: computed and area-pass colors of one token can differ by a
 * shade of rounding.
 */
const ROLE_MATCH_DELTA_E = 2;

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
