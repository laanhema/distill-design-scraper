import { NextResponse } from "next/server";
import {
  analyzeImages,
  analyzeUrl,
  modeSchema,
  type AnalyzeMode,
} from "@/lib/analyze";
import { z } from "zod";
import { aiLaneAvailable } from "@/lib/aiLane";
import { createCacheKey, getCache, setCache } from "@/lib/cache";
import {
  assertWithinRateLimit,
  extractClientId,
  RateLimitExceededError,
} from "@/lib/security/rateLimiter";
import { UnsafeUrlError } from "@/lib/security/ssrfGuard";
import { DegenerateImageError } from "@/lib/extract/imagePalette";
import {
  MAX_IMAGES,
  type AnalyzeSuccess,
  type AnalyzeFailure,
} from "@/lib/api";

// Playwright needs the full Node runtime + a real Chromium binary — never Edge.
export const runtime = "nodejs";
// Rendering an arbitrary page is inherently dynamic; don't let Next cache it.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Bound the measured-lane palette merge; the AI lane applies its own, tighter
// cap (MAX_INTERPRET_IMAGES in lib/interpret.ts) on top of whatever's accepted here.

// Request-body ceiling: MAX_IMAGES base64 uploads (≈4/3 inflation) at 8 MiB
// each (≈6 MiB raw, far above any real screenshot), which also absorbs the
// JSON envelope. Anything larger gets a 413 before JSON.parse / base64 decode,
// so attacker-sized buffers never reach sharp, the palette pipeline, or
// Playwright. App Router route handlers don't apply the legacy `bodyParser`
// size config, so this is enforced explicitly.
const MAX_IMAGE_PAYLOAD_BYTES = 8 * 1024 * 1024;
const MAX_REQUEST_BODY_BYTES = MAX_IMAGES * MAX_IMAGE_PAYLOAD_BYTES;

const imageEntrySchema = z.object({
  data: z.string(),
  name: z.string().optional(),
});
type ImageEntry = z.infer<typeof imageEntrySchema>;

const analyzeBodySchema = z.object({
  url: z.string().optional(),
  /** @deprecated single-image alias — mapped onto `images` below. */
  image: z.string().optional(),
  imageName: z.string().optional(),
  images: z.array(imageEntrySchema).optional(),
  mode: modeSchema.default("both"),
  forceRefresh: z.boolean().optional(),
});
type AnalyzeBody = z.infer<typeof analyzeBodySchema>;

function stripDataUrlPrefix(image: string): string {
  // Subtype must cover multi-token MIME types: `svg+xml`, and dots/dashes in
  // e.g. `vnd.microsoft.icon`.
  return image.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
}

/** Returns null past MAX_REQUEST_BODY_BYTES, declared via Content-Length or
 *  observed while streaming (a chunked body has no Content-Length, and the
 *  header can lie). On breach the stream is cancelled, never drained. */
async function readBodyWithinLimit(request: Request): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BODY_BYTES) {
    return null;
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_REQUEST_BODY_BYTES) {
      // Best-effort abort; a cancel failure must not mask the 413.
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function POST(request: Request) {
  const rawBody = await readBodyWithinLimit(request);
  if (rawBody === null) {
    return NextResponse.json(
      {
        ok: false,
        error: `Request body exceeds the ${MAX_REQUEST_BODY_BYTES}-byte limit.`,
      } satisfies AnalyzeFailure,
      { status: 413 },
    );
  }

  let rawJson: unknown;
  try {
    rawJson = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { ok: false, error: "Request body must be JSON." } satisfies AnalyzeFailure,
      { status: 400 },
    );
  }

  const parsed = analyzeBodySchema.safeParse(rawJson);
  if (!parsed.success) {
    const error = parsed.error.issues
      .map((i) => `Invalid ${i.path.length > 0 ? i.path.join(".") : "body"}: ${i.message}`)
      .join("; ");
    return NextResponse.json(
      { ok: false, error } satisfies AnalyzeFailure,
      { status: 400 },
    );
  }

  const body: AnalyzeBody = parsed.data;

  const url = body.url?.trim();
  // `image` is a deprecated single-image alias for `images`; both may be
  // present in old clients/bookmarked requests, so merge rather than choose.
  const images: ImageEntry[] = [
    ...(body.image?.trim() ? [{ data: body.image.trim(), name: body.imageName }] : []),
    ...(body.images ?? []),
  ].slice(0, MAX_IMAGES);
  const mode: AnalyzeMode = body.mode;

  if (!url && images.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing 'url' or 'images' in request body.",
      } satisfies AnalyzeFailure,
      { status: 400 },
    );
  }

  const imagesKeyPart = images.map((img) => img.data).join("|");
  const cacheKey = createCacheKey(`${url || ""}:${imagesKeyPart}:${mode}`);
  if (!body.forceRefresh) {
    const cached = getCache(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }
  }

  // Cache hits return above and never reach here, so they consume zero
  // budget — only a cache miss/forceRefresh (about to trigger a Chromium
  // render or AI-lane call) counts against the limit.
  try {
    assertWithinRateLimit(extractClientId(request));
  } catch (err) {
    if (err instanceof RateLimitExceededError) {
      return NextResponse.json(
        { ok: false, error: err.message } satisfies AnalyzeFailure,
        { status: 429, headers: { "Retry-After": String(err.retryAfterSeconds) } },
      );
    }
    throw err;
  }

  try {
    if (images.length > 0) {
      const { report, markdown, meta, refinements, structureReport, structureUnavailableReason } =
        await analyzeImages(
          images.map((img, i) => ({
            data: stripDataUrlPrefix(img.data),
            name: img.name || `uploaded-image-${i + 1}`,
          })),
          mode,
        );

      const responsePayload = {
        ok: true,
        report,
        markdown,
        structureReport: structureReport ?? null,
        structureUnavailableReason,
        refinements,
        // No `viewportShots` here: the uploads are not sent back to the client
        // that sent them, nor held in the cache for the TTL.
        meta: {
          ...meta,
          capturedAt: report.source.capturedAt,
        },
      } satisfies AnalyzeSuccess;

      // Don't cache a transient structure failure: replaying it for the full
      // TTL would hide a one-off vision-model flake from a resubmission. A
      // missing AI key is persistent, so that failure is safe to cache; env
      // vars are static, so re-running `aiLaneAvailable()` tells the two apart.
      const structureFailureIsTransient = Boolean(structureUnavailableReason) && aiLaneAvailable();
      if (!structureFailureIsTransient) {
        setCache(cacheKey, responsePayload);
      }
      return NextResponse.json(responsePayload);
    }

    const {
      report,
      markdown,
      capture,
      meta,
      refinements,
      structureReport,
      structureUnavailableReason,
    } = await analyzeUrl(url!, mode);

    const responsePayload = {
      ok: true,
      report,
      markdown,
      structureReport: structureReport ?? null,
      structureUnavailableReason,
      refinements,
      meta: {
        ...meta,
        capturedAt: capture.source.capturedAt,
        viewportShots: [capture.viewportShot, ...(capture.panoramaShot ? [capture.panoramaShot] : [])].map(
          (shot) => `data:image/png;base64,${shot}`,
        ),
      },
    } satisfies AnalyzeSuccess;

    // Don't cache a transient structure failure (see the image path above).
    if (!structureUnavailableReason) {
      setCache(cacheKey, responsePayload);
    }
    return NextResponse.json(responsePayload);
  } catch (err) {
    if (err instanceof UnsafeUrlError) {
      return NextResponse.json(
        { ok: false, error: err.message } satisfies AnalyzeFailure,
        { status: 400 },
      );
    }
    // Degenerate image upload (fully transparent / unreadable): the input is
    // at fault, not the pipeline — answer with an actionable 422, not a 502.
    if (err instanceof DegenerateImageError) {
      return NextResponse.json(
        { ok: false, error: err.message } satisfies AnalyzeFailure,
        { status: 422 },
      );
    }
    // Surface a clear error, never fabricate results, but keep internals out
    // of it: raw render/AI pipeline errors can carry Playwright/Chromium
    // details, file paths and upstream API responses, so the full error goes
    // to server logs only and the client gets a fixed generic message. The
    // typed branches above stay verbatim: those messages are deliberately
    // client-facing and actionable.
    console.error("Analyze pipeline error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: "Analysis failed due to an internal error. Please try again.",
      } satisfies AnalyzeFailure,
      { status: 502 },
    );
  }
}

