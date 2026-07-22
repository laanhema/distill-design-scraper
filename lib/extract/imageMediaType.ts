import sharp from "sharp";

export type ImageMediaType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

const SHARP_FORMAT_TO_MEDIA_TYPE: Partial<Record<string, ImageMediaType>> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

/**
 * Sniffs a base64 image payload's real encoded format instead of assuming
 * PNG — uploads arrive via `accept="image/*"` and the data-URL prefix isn't
 * preserved past `stripDataUrlPrefix`, so a declared type isn't available
 * here. Falls back to "image/png" (harmless for actual PNGs, and the closest
 * available guess otherwise) when the format can't be read or isn't one of
 * the four Claude's vision API accepts.
 */
export async function detectImageMediaType(base64: string): Promise<ImageMediaType> {
  try {
    const buffer = Buffer.from(base64, "base64");
    const { format } = await sharp(buffer).metadata();
    if (format && SHARP_FORMAT_TO_MEDIA_TYPE[format]) {
      return SHARP_FORMAT_TO_MEDIA_TYPE[format]!;
    }
  } catch {
    // Fall through to the png default below.
  }
  return "image/png";
}
