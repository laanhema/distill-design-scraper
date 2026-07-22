import { NextResponse } from "next/server";
import { analyzeImages, analyzeUrl, extractStructureFromCapture } from "@/lib/analyze";
import { createCacheKey, getCache, setCache } from "@/lib/cache";
import { UnsafeUrlError } from "@/lib/security/ssrfGuard";

// Playwright needs the full Node runtime + a real Chromium binary — never Edge.
export const runtime = "nodejs";
// Rendering an arbitrary page is inherently dynamic; don't let Next cache it.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Bound the measured-lane palette merge; the AI lane applies its own, tighter
// cap (MAX_INTERPRET_IMAGES in lib/interpret.ts) on top of whatever's accepted here.
const MAX_IMAGES = 6;

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

export async function POST(request: Request) {
  let body: AnalyzeBody;
  try {
    body = await request.json();
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

  const imagesKeyPart = images.map((img) => img.data.slice(0, 100)).join("|");
  const cacheKey = createCacheKey(`${url || ""}:${imagesKeyPart}:${mode}`);
  if (!body.forceRefresh) {
    const cached = getCache<unknown>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }
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
      }
    }

    const responsePayload = {
      ok: true,
      report,
      markdown,
      structureReport,
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

    setCache(cacheKey, responsePayload);
    return NextResponse.json(responsePayload);
  } catch (err) {
    if (err instanceof UnsafeUrlError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    // §9: surface a clear error, never fabricate results.
    const message =
      err instanceof Error ? err.message : "Unknown rendering error.";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}

