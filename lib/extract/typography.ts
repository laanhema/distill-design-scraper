import type { StyleDump } from "@/lib/extract/styleDump";
import type {
  FontFamily,
  Typography,
  TypeScaleStep,
  TypeToken,
} from "@/lib/schema";
import { mode } from "./mode";

/**
 * Typography from computed styles — URL lane only: fonts are *not* recoverable
 * from a photo, so the image lane never routes through here.
 */

const GENERIC_FAMILIES = new Set([
  "serif",
  "sans-serif",
  "monospace",
  "cursive",
  "fantasy",
  "system-ui",
  "ui-sans-serif",
  "ui-serif",
  "ui-monospace",
  "-apple-system",
  "blinkmacsystemfont",
]);

function parseStack(stack: string): string[] {
  return stack
    .split(",")
    .map((p) => p.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

/** Resolve a `font-family` stack to its first concrete family name. */
function firstFamily(stack: string): string {
  const parts = parseStack(stack);
  for (const p of parts) {
    if (!GENERIC_FAMILIES.has(p.toLowerCase())) return p;
  }
  return parts[0] ?? "unknown";
}

function classify(name: string): string {
  const n = name.toLowerCase();
  if (/mono|consolas|courier|menlo|monaco|code/.test(n)) return "monospace";
  if (/serif|georgia|times|garamond|playfair|merriweather|lora|charter/.test(n))
    return "serif";
  return "sans-serif";
}

interface SizeSample {
  weight: number;
  lineHeightPx: number;
  letterSpacing: string;
  family: string;
}



/** Computed px letter-spacing as em relative to the size. */
function letterSpacingEm(raw: string, sizePx: number): string {
  if (raw === "0" || raw === "normal") return "0";
  const px = parseFloat(raw);
  if (!Number.isFinite(px) || sizePx <= 0) return "0";
  const em = px / sizePx;
  if (Math.abs(em) < 0.005) return "0";
  return `${em > 0 ? "" : "-"}${Math.abs(em).toFixed(2)}em`;
}

export function extractTypography(dump: StyleDump): Typography | undefined {
  const bySize = new Map<number, SizeSample[]>();
  const familyWeights = new Map<string, Set<number>>();
  const familyCount = new Map<string, number>();
  // First-observed raw stack per resolved family name, so the fallback chain
  // (e.g. "system-ui, sans-serif" behind a proprietary "sohne-var") survives
  // even though `family` itself collapses to just the primary name.
  const familyStacks = new Map<string, string>();
  // Sizes measured on real <h1> elements — used to anchor the h1 token to the
  // actual primary heading rather than a frequency-popular lookalike.
  const h1Sizes: number[] = [];

  for (const node of dump.nodes) {
    if (!node.type) continue;
    const t = node.type;
    const size = Math.round(t.fontSizePx);
    if (size < 6 || size > 200) continue;
    const family = firstFamily(t.fontFamily);
    if (node.tag === "h1") h1Sizes.push(size);
    if (!familyStacks.has(family)) familyStacks.set(family, t.fontFamily);

    const bucket = bySize.get(size) ?? [];
    bucket.push({
      weight: t.fontWeight,
      lineHeightPx: t.lineHeightPx,
      letterSpacing: t.letterSpacing,
      family,
    });
    bySize.set(size, bucket);

    if (!familyWeights.has(family)) familyWeights.set(family, new Set());
    familyWeights.get(family)!.add(t.fontWeight);
    familyCount.set(family, (familyCount.get(family) ?? 0) + 1);
  }

  if (bySize.size === 0) return undefined;

  // Body size = the most-used size (paragraph text is the workhorse).
  let bodySize = 16;
  let bodyN = -1;
  for (const [size, samples] of bySize) {
    if (samples.length > bodyN) {
      bodyN = samples.length;
      bodySize = size;
    }
  }

  const sizes = [...bySize.keys()].sort((a, b) => a - b);
  const above = sizes.filter((s) => s > bodySize);
  const below = sizes.filter((s) => s < bodySize);

  // Headings: up to four larger clusters, assigned bottom up, so three heading
  // sizes read as h1/h2/h3 and `display` is used only for a fourth. `h1` is
  // anchored to real <h1> elements when there are any: pure frequency can drop
  // the one-off hero h1, inverting desktop vs. mobile (the mobile pass measures
  // the h1 element directly).
  const headingTokens: TypeToken[] = ["display", "h1", "h2", "h3"];
  let chosenAbove: number[];
  const h1Size = representativeHeadingSize(h1Sizes);
  if (h1Size !== undefined && h1Size > bodySize) {
    // One slot above the real h1 and up to two below, so the bottom-up
    // assignment always lands `h1` on the hero size.
    const freqRanked = pickSpread(above, bySize, 4);
    const larger = freqRanked.filter((s) => s > h1Size).sort((a, b) => b - a);
    const smaller = freqRanked.filter((s) => s < h1Size).sort((a, b) => b - a);
    chosenAbove = [...larger.slice(0, 1), h1Size, ...smaller.slice(0, 2)];
  } else {
    chosenAbove = pickSpread(above, bySize, 4);
  }
  chosenAbove.sort((a, b) => b - a);
  const usedTokens = headingTokens.slice(headingTokens.length - chosenAbove.length);
  const scale: TypeScaleStep[] = [];

  chosenAbove.forEach((size, i) => {
    scale.push(buildStep(usedTokens[i], size, bySize.get(size)!));
  });
  scale.push(buildStep("body", bodySize, bySize.get(bodySize)!));
  if (below.length > 0) {
    // "small" = the most-used size below body.
    const smallSize = below.reduce((best, s) =>
      bySize.get(s)!.length > bySize.get(best)!.length ? s : best,
    );
    scale.push(buildStep("small", smallSize, bySize.get(smallSize)!));
  }

  scale.sort((a, b) => b.sizePx - a.sizePx);

  const families = resolveFamilies(familyWeights, familyCount, bySize, bodySize, familyStacks);

  return { provenance: "measured", families, scale };
}

/** Most frequently used first, so a stray one-off size doesn't claim a heading slot. */
function pickSpread(
  candidates: number[],
  bySize: Map<number, SizeSample[]>,
  n: number,
): number[] {
  return [...candidates]
    .sort((a, b) => bySize.get(b)!.length - bySize.get(a)!.length)
    .slice(0, n);
}

/** The modal <h1> size, ties broken toward the larger (the hero heading). */
function representativeHeadingSize(sizes: number[]): number | undefined {
  if (sizes.length === 0) return undefined;
  const counts = new Map<number, number>();
  for (const s of sizes) counts.set(s, (counts.get(s) ?? 0) + 1);
  let best: number | undefined;
  let bestN = 0;
  for (const [size, n] of counts) {
    if (n > bestN || (n === bestN && best !== undefined && size > best)) {
      best = size;
      bestN = n;
    }
  }
  return best;
}

function buildStep(
  token: TypeToken,
  sizePx: number,
  samples: SizeSample[],
): TypeScaleStep {
  const weight = mode(
    samples.map((s) => s.weight),
    400,
  );
  const lineHeightPx = mode(
    samples.map((s) => s.lineHeightPx),
    sizePx * 1.4,
  );
  const rawLs = mode(
    samples.map((s) => s.letterSpacing),
    "0",
  );
  return {
    token,
    sizePx,
    weight,
    lineHeight: Math.round((lineHeightPx / sizePx) * 100) / 100,
    letterSpacing: letterSpacingEm(rawLs, sizePx),
  };
}

function resolveFamilies(
  familyWeights: Map<string, Set<number>>,
  familyCount: Map<string, number>,
  bySize: Map<number, SizeSample[]>,
  bodySize: number,
  familyStacks: Map<string, string>,
): FontFamily[] {
  // Body family = most-used family at the body size (fall back to overall).
  const bodySamples = bySize.get(bodySize) ?? [];
  const bodyFamily =
    bodySamples.length > 0
      ? mode(bodySamples.map((s) => s.family), "unknown")
      : mostUsedFamily(familyCount);

  // Heading family = most-used family among the larger sizes, if it differs.
  const largeSamples: string[] = [];
  for (const [size, samples] of bySize) {
    if (size > bodySize) largeSamples.push(...samples.map((s) => s.family));
  }
  const headingFamily =
    largeSamples.length > 0 ? mode(largeSamples, bodyFamily) : bodyFamily;

  const families: FontFamily[] = [];
  const seen = new Set<string>();

  const add = (name: string, role: FontFamily["role"]) => {
    if (seen.has(name)) return;
    seen.add(name);
    families.push({
      name,
      role,
      classification: classify(name),
      weightsObserved: [...(familyWeights.get(name) ?? [])].sort((a, b) => a - b),
      stack: parseStack(familyStacks.get(name) ?? name),
    });
  };

  add(bodyFamily, "body");
  if (headingFamily !== bodyFamily) add(headingFamily, "heading");

  // Any monospace family present is worth surfacing (code samples, data).
  for (const name of familyCount.keys()) {
    if (classify(name) === "monospace") add(name, "mono");
  }

  return families;
}

/** Below this px difference, a mobile heading size reads as rounding noise,
 *  not a deliberate responsive choice. */
const MOBILE_SIZE_DIFF_THRESHOLD_PX = 2;

/** Annotates scale steps with the measured 390px size only where it differs
 *  from the desktop size by at least `MOBILE_SIZE_DIFF_THRESHOLD_PX`. */
export function applyMobileTypeSizes(
  typography: Typography,
  mobileSizesPx: Record<string, number>,
): Typography {
  const scale = typography.scale.map((step) => {
    const mobile = mobileSizesPx[step.token];
    if (mobile === undefined || Math.abs(mobile - step.sizePx) < MOBILE_SIZE_DIFF_THRESHOLD_PX) {
      return step;
    }
    return { ...step, sizePxMobile: Math.round(mobile) };
  });
  return { ...typography, scale };
}

function mostUsedFamily(familyCount: Map<string, number>): string {
  let best = "unknown";
  let bestN = -1;
  for (const [name, n] of familyCount) {
    if (n > bestN) {
      bestN = n;
      best = name;
    }
  }
  return best;
}
