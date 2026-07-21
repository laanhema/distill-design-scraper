import { NextResponse } from "next/server";
import { analyzeUrl } from "@/lib/analyze";

// Playwright needs the full Node runtime + a real Chromium binary — never Edge.
export const runtime = "nodejs";
// Rendering an arbitrary page is inherently dynamic; don't let Next cache it.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

interface AnalyzeBody {
  url?: string;
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
  if (!url) {
    return NextResponse.json(
      { error: "Missing 'url' in request body." },
      { status: 400 },
    );
  }

  try {
    // render → measured extraction (palette + type) → AI lane (identity,
    // imageMood, role refinements) → .md. The AI step degrades gracefully when
    // no API key is set, so this still returns a measured-only report (§6).
    const { report, markdown, capture, meta, refinements } =
      await analyzeUrl(url);
    return NextResponse.json({
      ok: true,
      report,
      markdown,
      refinements,
      meta: {
        ...meta,
        capturedAt: capture.source.capturedAt,
        viewportShot: `data:image/png;base64,${capture.viewportShot}`,
      },
    });
  } catch (err) {
    // §9: surface a clear error, never fabricate results.
    const message =
      err instanceof Error ? err.message : "Unknown rendering error.";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
