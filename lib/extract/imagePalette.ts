import sharp from "sharp";
import {
  chroma,
  contrastRatio,
  deltaE,
  hex,
  isNeutral,
  lightness,
  parseColor,
  wcagGrade,
} from "@/lib/color";
import type { ContrastPair, Palette, Swatch, ColorRole } from "@/lib/schema";
import { COLOR_ROLES } from "@/lib/schema";
import { ROLE_USAGE } from "@/lib/extract/palette";
import type { Color } from "culori";

/**
 * Phase 3 — Image input measured palette extraction (§5, §8).
 * Extracts a measured palette directly from an image file/buffer via Sharp pixel
 * sampling and perceptual color clustering in Lab/OKLCH.
 */

const SAMPLE_SIZE = 320;
const MERGE_DELTA_E = 2.5;

interface ImageColorCluster {
  color: Color;
  hex: string;
  count: number;
  areaWeight: number;
}

export async function extractImagePalette(
  imageInput: Buffer | string,
): Promise<Palette> {
  const buffer =
    typeof imageInput === "string"
      ? Buffer.from(imageInput, "base64")
      : imageInput;

  // Downscale image for fast, reliable pixel quantization
  const { data, info } = await sharp(buffer)
    .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: "inside" })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixelCount = info.width * info.height;
  const clusters: ImageColorCluster[] = [];

  // Step 1: Quantize pixels into perceptual clusters
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    // Ignore transparent or near-transparent pixels
    if (a < 180) continue;

    const parsed = parseColor(`rgb(${r}, ${g}, ${b})`);
    if (!parsed) continue;

    let merged = false;
    for (const cluster of clusters) {
      if (deltaE(cluster.color, parsed) <= MERGE_DELTA_E) {
        cluster.count++;
        merged = true;
        break;
      }
    }

    if (!merged) {
      clusters.push({
        color: parsed,
        hex: hex(parsed),
        count: 1,
        areaWeight: 0,
      });
    }
  }

  // Calculate area weights
  const validPixels = clusters.reduce((acc, c) => acc + c.count, 0) || pixelCount;
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
  if (!assignedHexes.has(bestTextCluster.hex) || swatches.length === 1) {
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

  // Fill remaining required roles (muted, border) if needed
  for (const role of COLOR_ROLES) {
    if (swatches.some((s) => s.role === role)) continue;
    const remaining = clusters.find((c) => !assignedHexes.has(c.hex)) ?? clusters[0];
    swatches.push({
      name: role,
      role,
      hex: remaining.hex,
      usage: ROLE_USAGE[role],
      areaWeight: Math.round(remaining.areaWeight * 1000) / 1000,
      imageSourced: true,
    });
    assignedHexes.add(remaining.hex);
  }

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
