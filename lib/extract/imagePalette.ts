import sharp from "sharp";
import {
  chroma,
  contrastRatio,
  deltaE,
  hex,
  isNeutral,
  parseColor,
  wcagGrade,
} from "@/lib/color";
import type { ContrastPair, Palette, Swatch } from "@/lib/schema";
import { ROLE_USAGE } from "@/lib/extract/palette";
import type { Color } from "culori";

/**
 * Phase 3 — Image input measured palette extraction (§5, §8).
 * Extracts a measured palette directly from an image file/buffer via Sharp pixel
 * sampling and perceptual color clustering in Lab/OKLCH.
 */

const SAMPLE_SIZE = 320;
const MERGE_DELTA_E = 2.5;

/**
 * Thrown when no color clusters could be extracted from any supplied image —
 * every image was either unreadable (sharp couldn't decode it) or carried no
 * opaque pixels (e.g. a fully transparent PNG). The provenance contract
 * ("measured, never faked") forbids inventing swatches for that case, and the
 * report schema requires a palette, so the honest outcome is a typed error
 * the API route can map to a clean 4xx (issue #22).
 */
export class DegenerateImageError extends Error {}

interface ImageColorCluster {
  color: Color;
  hex: string;
  count: number;
  areaWeight: number;
}

/** Merge a color observation into a cluster list, by perceptual ΔE (§5 Stage B). */
function mergeInto(clusters: ImageColorCluster[], color: Color, hexStr: string, count: number) {
  for (const cluster of clusters) {
    if (deltaE(cluster.color, color) <= MERGE_DELTA_E) {
      cluster.count += count;
      return;
    }
  }
  clusters.push({ color, hex: hexStr, count, areaWeight: 0 });
}

/**
 * Quantize one image's pixels into perceptual color clusters (raw counts, not
 * yet area-weighted).
 *
 * Two bounded stages (issue #21): a per-pixel ΔE merge against a growing
 * cluster list is O(pixels × clusters), and a noise/gradient image where
 * nothing merges at ΔE ≤ 2.5 makes that unbounded. Instead:
 *
 *  1. Histogram pass — integer-only 4-bit-per-channel RGB bucketing (same
 *     scheme as `palette.ts`'s `farBuckets`), capped at 4096 buckets by
 *     construction; no color math inside the pixel loop.
 *  2. Merge pass — ΔE-merge the bucket *centroids* (count-weighted mean color
 *     per bucket), largest bucket first so dominant colors seed the clusters.
 *
 * Worst case is now 4096 centroids through the ΔE merge, regardless of image
 * content. Cluster counts still sum to the number of opaque pixels, which
 * `extractImagePalette`'s area-weighting relies on.
 */
async function quantizeImage(
  buffer: Buffer,
): Promise<{ clusters: ImageColorCluster[]; pixelCount: number }> {
  const { data, info } = await sharp(buffer)
    .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixelCount = info.width * info.height;

  // Stage 1: coarse 4-bit/channel histogram (≤ 4096 buckets), centroid sums.
  const buckets = new Map<
    number,
    { count: number; rSum: number; gSum: number; bSum: number }
  >();

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    // Ignore transparent or near-transparent pixels
    if (a < 180) continue;

    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.count++;
      bucket.rSum += r;
      bucket.gSum += g;
      bucket.bSum += b;
    } else {
      buckets.set(key, { count: 1, rSum: r, gSum: g, bSum: b });
    }
  }

  // Stage 2: ΔE-merge bucket centroids, largest first.
  const sorted = [...buckets.values()].sort((a, b) => b.count - a.count);
  const clusters: ImageColorCluster[] = [];

  for (const bucket of sorted) {
    const r = Math.round(bucket.rSum / bucket.count);
    const g = Math.round(bucket.gSum / bucket.count);
    const b = Math.round(bucket.bSum / bucket.count);
    const parsed = parseColor(`rgb(${r}, ${g}, ${b})`);
    if (!parsed) continue;

    mergeInto(clusters, parsed, hex(parsed), bucket.count);
  }

  return { clusters, pixelCount };
}

export async function extractImagePalette(
  imageInput: Buffer | string | (Buffer | string)[],
): Promise<Palette> {
  const inputs = Array.isArray(imageInput) ? imageInput : [imageInput];
  const buffers = inputs.map((img) =>
    typeof img === "string" ? Buffer.from(img, "base64") : img,
  );

  // Quantize each image independently, then merge across images by ΔE so a
  // color that recurs across screenshots is counted once, not once per image.
  // A single unreadable image (sharp can't decode it) is skipped with a
  // warning rather than failing the whole upload — the remaining images still
  // contribute their clusters (issue #22).
  const perImage = await Promise.all(
    buffers.map((buffer) =>
      quantizeImage(buffer).catch((err) => {
        console.warn("Image palette: skipping unreadable image:", err);
        return { clusters: [] as ImageColorCluster[], pixelCount: 0 };
      }),
    ),
  );
  const clusters: ImageColorCluster[] = [];
  for (const { clusters: imageClusters } of perImage) {
    for (const c of imageClusters) {
      mergeInto(clusters, c.color, c.hex, c.count);
    }
  }

  // Zero clusters across every image (all transparent and/or unreadable):
  // there is nothing measured to report, and fabricating swatches would
  // violate the provenance contract — fail honestly instead.
  if (clusters.length === 0) {
    throw new DegenerateImageError(
      "No colors could be extracted from the supplied image(s) — they may be fully transparent or not valid images.",
    );
  }

  // Calculate area weights across the combined pixel pool
  const totalPixelCount = perImage.reduce((acc, p) => acc + p.pixelCount, 0);
  const validPixels = clusters.reduce((acc, c) => acc + c.count, 0) || totalPixelCount;
  for (const c of clusters) {
    c.areaWeight = c.count / validPixels;
  }

  // Sort clusters by area weight descending
  clusters.sort((a, b) => b.areaWeight - a.areaWeight);

  // Step 2: Assign roles to top clusters
  const swatches: Swatch[] = [];
  const assignedHexes = new Set<string>();

  const neutrals = clusters.filter((c) => isNeutral(c.color));
  const vivids = clusters.filter((c) => !isNeutral(c.color));

  // Background: largest area neutral or largest area color
  const bgCluster = neutrals[0] ?? clusters[0];
  const bgSwatch: Swatch = {
    name: "background",
    role: "background",
    hex: bgCluster.hex,
    usage: ROLE_USAGE["background"],
    areaWeight: Math.round(bgCluster.areaWeight * 1000) / 1000,
    imageSourced: true,
  };
  swatches.push(bgSwatch);
  assignedHexes.add(bgCluster.hex);

  // Surface: second largest area neutral
  const surfaceCluster =
    neutrals.find((c) => c.hex !== bgCluster.hex && c.areaWeight >= 0.03) ??
    clusters.find((c) => c.hex !== bgCluster.hex);

  if (surfaceCluster) {
    swatches.push({
      name: "surface",
      role: "surface",
      hex: surfaceCluster.hex,
      usage: ROLE_USAGE["surface"],
      areaWeight: Math.round(surfaceCluster.areaWeight * 1000) / 1000,
      imageSourced: true,
    });
    assignedHexes.add(surfaceCluster.hex);
  }

  // Text: highest contrast color against background
  let bestTextCluster = clusters[0];
  let bestTextRatio = 0;
  for (const c of clusters) {
    const ratio = contrastRatio(c.color, bgCluster.color);
    if (ratio > bestTextRatio) {
      bestTextRatio = ratio;
      bestTextCluster = c;
    }
  }
  if (!assignedHexes.has(bestTextCluster.hex)) {
    swatches.push({
      name: "text",
      role: "text",
      hex: bestTextCluster.hex,
      usage: ROLE_USAGE["text"],
      areaWeight: Math.round(bestTextCluster.areaWeight * 1000) / 1000,
      imageSourced: true,
    });
    assignedHexes.add(bestTextCluster.hex);
  }

  // Primary: highest chroma vivid color
  const primaryCluster =
    vivids.sort((a, b) => chroma(b.color) - chroma(a.color))[0] ??
    clusters.find((c) => !assignedHexes.has(c.hex));

  if (primaryCluster && !assignedHexes.has(primaryCluster.hex)) {
    swatches.push({
      name: "primary",
      role: "primary",
      hex: primaryCluster.hex,
      usage: ROLE_USAGE["primary"],
      areaWeight: Math.round(primaryCluster.areaWeight * 1000) / 1000,
      imageSourced: true,
    });
    assignedHexes.add(primaryCluster.hex);
  }

  // Accent: second highest chroma color
  const accentCluster =
    vivids.find((c) => !assignedHexes.has(c.hex)) ??
    clusters.find((c) => !assignedHexes.has(c.hex));

  if (accentCluster) {
    swatches.push({
      name: "accent",
      role: "accent",
      hex: accentCluster.hex,
      usage: ROLE_USAGE["accent"],
      areaWeight: Math.round(accentCluster.areaWeight * 1000) / 1000,
      imageSourced: true,
    });
    assignedHexes.add(accentCluster.hex);
  }

  // Any role not assigned above (muted, border, on-primary, success, warning,
  // danger) is omitted outright: pixel clusters carry no usage evidence for
  // those roles, and "measured, never faked" forbids filling them from
  // arbitrary leftovers (§P5-1 — assigned only on strong evidence).

  // Compute contrast pairs
  const contrast: ContrastPair[] = [];
  const textSwatch = swatches.find((s) => s.role === "text");
  const primarySwatch = swatches.find((s) => s.role === "primary");

  if (textSwatch) {
    const textCol = parseColor(textSwatch.hex)!;
    const bgCol = parseColor(bgSwatch.hex)!;
    const ratio = Math.round(contrastRatio(textCol, bgCol) * 10) / 10;
    contrast.push({
      pair: ["text", "background"],
      ratio,
      wcag: wcagGrade(ratio),
    });
  }

  if (primarySwatch) {
    const priCol = parseColor(primarySwatch.hex)!;
    const bgCol = parseColor(bgSwatch.hex)!;
    const ratio = Math.round(contrastRatio(priCol, bgCol) * 10) / 10;
    contrast.push({
      pair: ["primary", "background"],
      ratio,
      wcag: wcagGrade(ratio),
    });
  }

  return {
    provenance: "measured",
    colors: swatches,
    contrast,
  };
}
