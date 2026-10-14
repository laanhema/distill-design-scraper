import sharp from "sharp";

export type ImageMediaType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

const SHARP_FORMAT_TO_MEDIA_TYPE: Partial<Record<string, ImageMediaType>> = {
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

/**
 * Sniffs the real format: the data-URL prefix is stripped before this point, so
 * no declared type survives. Falls back to "image/png" when the format can't
 * be read or isn't one the vision model accepts.
 */
export async function detectImageMediaType(base64: string): Promise<ImageMediaType> {
  try {
    const buffer = Buffer.from(base64, "base64");
    const { format } = await sharp(buffer).metadata();
    if (format && SHARP_FORMAT_TO_MEDIA_TYPE[format]) {
      return SHARP_FORMAT_TO_MEDIA_TYPE[format]!;
    }
  } catch {}
  return "image/png";
}
