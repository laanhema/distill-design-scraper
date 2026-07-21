import type { StyleDump } from "@/lib/extract/styleDump";
import type {
  FontFamily,
  Typography,
  TypeScaleStep,
  TypeToken,
} from "@/lib/schema";

/**
 * Typography extraction — measured from computed styles (§5). We resolve font
 * stacks to their first (intended) family, dedupe into families with the weight
 * sets actually observed, and cluster the observed font sizes into a canonical
 * type scale mapped onto display…small tokens.
 *
 * This is the URL lane only. Fonts are *not* recoverable from a photo, so the
 * image lane (Phase 3) produces an AI `inferred` classification instead — never
 * a measured scale — and never routes through here.
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

/** Resolve a `font-family` stack to its first concrete family name. */
function firstFamily(stack: string): string {
  const parts = stack.split(",").map((p) => p.trim().replace(/^["']|["']$/g, ""));
  for (const p of parts) {
    if (p && !GENERIC_FAMILIES.has(p.toLowerCase())) return p;
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

/** Most frequent value in a list, with a fallback for the empty case. */
function mode<T>(values: T[], fallback: T): T {
  const counts = new Map<T, number>();
  let best = fallback;
  let bestN = 0;
  for (const v of values) {
    const n = (counts.get(v) ?? 0) + 1;
    counts.set(v, n);
    if (n > bestN) {
      bestN = n;
      best = v;
    }
  }
  return best;
}

/** Convert a computed px letter-spacing to an em value relative to the size. */
function letterSpacingEm(raw: string, sizePx: number): string {
  if (raw === "0" || raw === "normal") return "0";
  const px = parseFloat(raw);
  if (!Number.isFinite(px) || sizePx <= 0) return "0";
  const em = px / sizePx;
  if (Math.abs(em) < 0.005) return "0";
  return `${em > 0 ? "" : "-"}${Math.abs(em).toFixed(2)}em`;
}

export function extractTypography(dump: StyleDump): Typography | undefined {
  // Gather text samples, bucketed by rounded pixel size.
  const bySize = new Map<number, SizeSample[]>();
  const familyWeights = new Map<string, Set<number>>();
  const familyCount = new Map<string, number>();

  for (const node of dump.nodes) {
    if (!node.type) continue;
    const t = node.type;
    const size = Math.round(t.fontSizePx);
    if (size < 6 || size > 200) continue; // ignore degenerate values
    const family = firstFamily(t.fontFamily);

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

  // Headings: up to four distinct larger clusters. Tokens are assigned from the
  // bottom up — the largest heading is `h1`, stepping down to h2/h3 — and the
  // extra `display` slot is only used when there is a *fourth*, even larger
  // cluster above h1. So a page with three heading sizes reads as h1/h2/h3, not
  // display/h1/h2.
  const headingTokens: TypeToken[] = ["display", "h1", "h2", "h3"];
  const chosenAbove = pickSpread(above, bySize, 4).sort((a, b) => b - a);
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

  // Sort by size descending for a natural top-down reading order.
  scale.sort((a, b) => b.sizePx - a.sizePx);

  const families = resolveFamilies(familyWeights, familyCount, bySize, bodySize);

  return { provenance: "measured", families, scale };
}

/**
 * Choose up to `n` representative sizes from `candidates`, favouring the most
 * frequently used ones so a stray one-off size doesn't claim a heading slot.
 */
function pickSpread(
  candidates: number[],
  bySize: Map<number, SizeSample[]>,
  n: number,
): number[] {
  return [...candidates]
    .sort((a, b) => bySize.get(b)!.length - bySize.get(a)!.length)
    .slice(0, n);
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
