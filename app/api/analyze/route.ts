import { NextResponse } from "next/server";
import { analyzeImages, analyzeUrl, extractStructureFromCapture } from "@/lib/analyze";
import { createCacheKey, getCache, setCache } from "@/lib/cache";
import {
  assertWithinRateLimit,
  extractClientId,
  RateLimitExceededError,
} from "@/lib/security/rateLimiter";
import { UnsafeUrlError } from "@/lib/security/ssrfGuard";
import { DegenerateImageError } from "@/lib/extract/imagePalette";

// Playwright needs the full Node runtime + a real Chromium binary — never Edge.
export const runtime = "nodejs";
// Rendering an arbitrary page is inherently dynamic; don't let Next cache it.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Bound the measured-lane palette merge; the AI lane applies its own, tighter
// cap (MAX_INTERPRET_IMAGES in lib/interpret.ts) on top of whatever's accepted here.
const MAX_IMAGES = 6;

// Request-body ceiling, sized from what a legitimate request can carry:
// MAX_IMAGES uploads, each base64-encoded (≈4/3 inflation), at a generous
// per-image wire ceiling. 8 MiB of encoded payload per image ≈ 6 MiB of raw
// image — far above any real design screenshot — and absorbs the JSON
// envelope (url/mode/names) riding along. Anything larger gets a 413 before
// JSON.parse / base64 decode, so attacker-sized buffers never reach sharp,
// the palette pipeline, or Playwright. App Router route handlers don't apply
// the legacy `bodyParser` size config, so this is enforced explicitly.
const MAX_IMAGE_PAYLOAD_BYTES = 8 * 1024 * 1024;
const MAX_REQUEST_BODY_BYTES = MAX_IMAGES * MAX_IMAGE_PAYLOAD_BYTES;

interface ImageEntry {
  data: string;
  name?: string;
}

interface AnalyzeBody {
  url?: string;
  /** @deprecated single-image alias — mapped onto `images` below. */
  image?: string;
  imageName?: string;
  images?: ImageEntry[];
  mode?: "tokens" | "structure" | "both";
  forceRefresh?: boolean;
}

function stripDataUrlPrefix(image: string): string {
  return image.replace(/^data:image\/[a-zA-Z]+;base64,/, "");
}

/** Reads the request body, enforcing MAX_REQUEST_BODY_BYTES. Returns null
 *  when the limit is exceeded — either declared up front via Content-Length,
 *  or observed while streaming (chunked bodies carry no Content-Length, so
 *  the header alone can't be trusted to exist or be honest). On breach the
 *  stream is cancelled rather than drained, so the rest of an oversized body
 *  is never buffered. */
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
      { error: `Request body exceeds the ${MAX_REQUEST_BODY_BYTES}-byte limit.` },
      { status: 413 },
    );
  }

  let body: AnalyzeBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON." },
      { status: 400 },
    );
  }

  const url = body.url?.trim();
  // `image` is a deprecated single-image alias for `images`; both may be
  // present in old clients/bookmarked requests, so merge rather than choose.
  const images: ImageEntry[] = [
    ...(body.image?.trim() ? [{ data: body.image.trim(), name: body.imageName }] : []),
    ...(body.images ?? []),
  ].slice(0, MAX_IMAGES);
  const mode = body.mode || "both";

  if (!url && images.length === 0) {
    return NextResponse.json(
      { error: "Missing 'url' or 'images' in request body." },
      { status: 400 },
    );
  }

  const imagesKeyPart = images.map((img) => img.data).join("|");
  const cacheKey = createCacheKey(`${url || ""}:${imagesKeyPart}:${mode}`);
  if (!body.forceRefresh) {
    const cached = getCache<unknown>(cacheKey);
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
        { ok: false, error: err.message },
        { status: 429, headers: { "Retry-After": String(err.retryAfterSeconds) } },
      );
    }
    throw err;
  }

  try {
    if (images.length > 0) {
      const cleaned = images.map((img, i) => ({
        raw: img.data,
        clean: stripDataUrlPrefix(img.data),
        name: img.name || `uploaded-image-${i + 1}`,
      }));

      const { report, markdown, meta, refinements, structureReport, structureUnavailableReason } =
        await analyzeImages(
          cleaned.map((img) => ({ data: img.clean, name: img.name })),
          mode,
        );

      const responsePayload = {
        ok: true,
        report,
        markdown,
        structureReport: structureReport ?? null,
        structureUnavailableReason,
        refinements,
        meta: {
          ...meta,
          capturedAt: report.source.capturedAt,
          // Preview strip: every source image, in submitted order.
          viewportShots: cleaned.map((img) =>
            img.raw.startsWith("data:") ? img.raw : `data:image/png;base64,${img.clean}`,
          ),
          viewportShot: cleaned[0].raw.startsWith("data:")
            ? cleaned[0].raw
            : `data:image/png;base64,${cleaned[0].clean}`,
        },
      };

      // Don't cache a transient structure failure — replaying it verbatim for
      // the full TTL would hide a one-off vision-model flake/timeout from a
      // resubmission seconds later (§ code review finding #3).
      if (!structureUnavailableReason) {
        setCache(cacheKey, responsePayload);
      }
      return NextResponse.json(responsePayload);
    }

    // Single Playwright render yields capture containing styleDump + rawHarvestNode (§4).
    const { report, markdown, capture, meta, refinements } =
      await analyzeUrl(url!);

    let structureReport = null;
    let structureUnavailableReason: string | undefined;
    if (mode === "structure" || mode === "both") {
      try {
        // `both` mode passes the already-built design report so the structure
        // lane can cross-link components to tokens (§P3-1); `structure`-only
        // mode has no design report to link against.
        structureReport = await extractStructureFromCapture(
          capture,
          mode === "both" ? report : undefined,
        );
      } catch (err) {
        console.warn("Structure extraction error:", err);
        structureUnavailableReason = "Structure extraction failed for this page.";
      }
    }

    const responsePayload = {
      ok: true,
      report,
      markdown,
      structureReport,
      structureUnavailableReason,
      refinements,
      meta: {
        ...meta,
        capturedAt: capture.source.capturedAt,
        viewportShot: `data:image/png;base64,${capture.viewportShot}`,
        viewportShots: [capture.viewportShot, ...(capture.panoramaShot ? [capture.panoramaShot] : [])].map(
          (shot) => `data:image/png;base64,${shot}`,
        ),
      },
    };

    // Don't cache a transient structure failure — replaying it verbatim for
    // the full TTL would hide a one-off flake/timeout from a resubmission
    // seconds later (mirrors the image path, § code review finding #3).
    if (!structureUnavailableReason) {
      setCache(cacheKey, responsePayload);
    }
    return NextResponse.json(responsePayload);
  } catch (err) {
    if (err instanceof UnsafeUrlError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    // Degenerate image upload (fully transparent / unreadable): the input is
    // at fault, not the pipeline — answer with an actionable 422, not a 502.
    if (err instanceof DegenerateImageError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 422 });
    }
    // §9: surface a clear error, never fabricate results — but keep internals
    // out of it. Raw error messages from the render/AI pipeline can carry
    // internal details (Playwright/Chromium errors, file paths, upstream API
    // responses), so the full error goes to server logs only and the client
    // gets a fixed generic message (issue #27 / review S6). The typed
    // branches above stay verbatim: those messages are deliberately
    // client-facing and actionable.
    console.error("Analyze pipeline error:", err);
    return NextResponse.json(
      { ok: false, error: "Analysis failed due to an internal error. Please try again." },
      { status: 502 },
    );
  }
}

