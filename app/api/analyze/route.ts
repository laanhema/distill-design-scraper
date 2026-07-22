import { NextResponse } from "next/server";
import { analyzeImage, analyzeUrl, extractStructureFromCapture } from "@/lib/analyze";
import { createCacheKey, getCache, setCache } from "@/lib/cache";

// Playwright needs the full Node runtime + a real Chromium binary — never Edge.
export const runtime = "nodejs";
// Rendering an arbitrary page is inherently dynamic; don't let Next cache it.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface AnalyzeBody {
  url?: string;
  image?: string;
  imageName?: string;
  mode?: "tokens" | "structure" | "both";
  forceRefresh?: boolean;
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
  const image = body.image?.trim();
  const mode = body.mode || "both";

  if (!url && !image) {
    return NextResponse.json(
      { error: "Missing 'url' or 'image' in request body." },
      { status: 400 },
    );
  }

  const cacheKey = createCacheKey(`${url || ""}:${image ? image.slice(0, 100) : ""}:${mode}`);
  if (!body.forceRefresh) {
    const cached = getCache<unknown>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }
  }

  try {
    if (image) {
      // Strip data URL prefix if present e.g. "data:image/png;base64,..."
      const cleanBase64 = image.replace(/^data:image\/[a-zA-Z]+;base64,/, "");
      const imageName = body.imageName || "uploaded-image";
      const { report, markdown, meta, refinements } = await analyzeImage(
        cleanBase64,
        imageName,
      );

      const responsePayload = {
        ok: true,
        report,
        markdown,
        refinements,
        meta: {
          ...meta,
          capturedAt: report.source.capturedAt,
          viewportShot: image.startsWith("data:") ? image : `data:image/png;base64,${cleanBase64}`,
        },
      };

      setCache(cacheKey, responsePayload);
      return NextResponse.json(responsePayload);
    }

    // Single Playwright render yields capture containing styleDump + rawHarvestNode (§4).
    const { report, markdown, capture, meta, refinements } =
      await analyzeUrl(url!);

    let structureReport = null;
    if (mode === "structure" || mode === "both") {
      try {
        structureReport = await extractStructureFromCapture(capture);
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
      },
    };

    setCache(cacheKey, responsePayload);
    return NextResponse.json(responsePayload);
  } catch (err) {
    // §9: surface a clear error, never fabricate results.
    const message =
      err instanceof Error ? err.message : "Unknown rendering error.";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}

