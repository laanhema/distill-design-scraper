import { z } from "zod";
import { renderUrl, type RenderResult, type CaptureArtifacts } from "@/lib/ingest";
import { extractPalette, extractDarkPalette } from "@/lib/extract/palette";
import { extractTypography, applyMobileTypeSizes } from "@/lib/extract/typography";
import { extractTokens } from "@/lib/extract/tokens";
import { buildRecipes } from "@/lib/extract/recipes";
import { buildStates } from "@/lib/extract/states";
import { extractMotion } from "@/lib/extract/motion";
import { extractImagePalette } from "@/lib/extract/imagePalette";
import {
  extractStructure,
  extractStructureThroughStage7,
  finalizeStructure,
} from "@/lib/extract/structure";
import { structureFromImages } from "@/lib/extract/structureFromImage";
import { buildReport, renderMarkdown } from "@/lib/emit";
import {
  aiLaneAvailable,
  applyRoleRefinements,
  interpret,
  type RefinementChange,
} from "@/lib/interpret";
import type { Report, StructureReport } from "@/lib/schema";
import type { AiOutcome } from "@/lib/api";

/**
 * Orchestration of the URL and image pipelines. Extraction is split from
 * rendering on purpose: `extractFromCapture` takes only the captured artifacts,
 * so the eval harness can replay a cached render offline and exercise every
 * heuristic without launching a browser.
 */

export interface Capture extends CaptureArtifacts {
  source: { type: "url"; ref: string; capturedAt: string };
  finalUrl: string;
  title: string;
  viewport?: { width: number; height: number };
}

export interface AnalyzeResult {
  report: Report;
  markdown: string;
}

export const modeSchema = z.enum(["tokens", "structure", "both"]);
export type AnalyzeMode = z.infer<typeof modeSchema>;

/** Run the measured lanes over an already-captured page. Browser-free. */
export async function extractFromCapture(
  capture: Capture,
): Promise<AnalyzeResult> {
  const palette = await extractPalette({
    dump: capture.styleDump,
    screenshotPngBase64: capture.panoramaShot ?? capture.viewportShot,
  });
  let typography = extractTypography(capture.styleDump);
  const tokens = extractTokens(capture.styleDump);
  const recipes = buildRecipes(capture.styleDump, { palette, typography });
  const states = buildStates(capture.styleDump, palette);
  const motion = extractMotion(capture.styleDump);

  const mobileTypeSizes = capture.responsiveHarvests?.find(
    (h) => h.viewport.width === 390,
  )?.typeSizesPx;
  if (typography && mobileTypeSizes) {
    typography = applyMobileTypeSizes(typography, mobileTypeSizes);
  }

  const paletteDark = capture.darkCapture
    ? await extractDarkPalette(
        { dump: capture.darkCapture.styleDump, screenshotPngBase64: capture.darkCapture.viewportShot },
        palette,
      )
    : undefined;

  const report = buildReport({
    reportKind: "design-system",
    source: capture.source,
    palette,
    paletteDark,
    typography,
    spacing: tokens.spacing,
    radius: tokens.radius,
    elevation: tokens.elevation,
    recipes,
    states,
    motion,
  });

  return { report, markdown: renderMarkdown(report) };
}

/**
 * Run the structure lane over an already-captured page. Pass `report` (the
 * already-built design-tokens report) in `both` mode to enable the
 * component → token cross-link; omitted, the structure report has no hints.
 */
export async function extractStructureFromCapture(
  capture: Capture,
  report?: Report,
  opts?: {
    forceHeuristicNaming?: boolean
  },
): Promise<StructureReport> {
  if (!capture.rawHarvestNode) {
    throw new Error("Capture does not contain rawHarvestNode for structure extraction.");
  }
  return extractStructure({
    sourceUrl: capture.source.ref,
    capturedAt: capture.source.capturedAt,
    viewport: capture.viewport,
    rawHarvestNode: capture.rawHarvestNode,
    dump: report ? capture.styleDump : undefined,
    report,
    responsiveHarvests: capture.responsiveHarvests,
    forceHeuristicNaming: opts?.forceHeuristicNaming,
  });
}

/**
 * Interpretation pass, kept apart from `extractFromCapture` so the measured
 * lane stays network-free for offline eval replay. Falls back to the measured
 * report untouched when no API key is set or the model fails.
 */
export interface EnrichWithAiOptions {
  requested?: boolean;
}

export type EnrichWithAiResult = AnalyzeResult & {
  refinements: RefinementChange[];
  outcome: AiOutcome;
};

export async function enrichWithAI(
  measured: AnalyzeResult,
  screenshotsPngBase64: string[],
  opts?: EnrichWithAiOptions,
): Promise<EnrichWithAiResult> {
  if (opts?.requested === false) {
    return { ...measured, refinements: [], outcome: "not-requested" };
  }
  if (!aiLaneAvailable()) {
    return { ...measured, refinements: [], outcome: "no-key" };
  }

  const interpretation = await interpret({
    screenshotsPngBase64,
    palette: measured.report.palette,
    typography: measured.report.typography,
  });
  if (!interpretation) {
    return { ...measured, refinements: [], outcome: "failed" };
  }

  const { palette, changes } = applyRoleRefinements(
    measured.report.palette,
    interpretation.roleRefinements,
  );

  // Spread the measured report rather than re-listing its fields: this pass
  // only *adds* interpretive lanes and swaps in the refined palette, so every
  // measured lane must survive it untouched, including one added later.
  const report = buildReport({
    ...measured.report,
    palette,
    identity: interpretation.identity,
    imageMood: interpretation.imageMood,
  });

  return {
    report,
    markdown: renderMarkdown(report),
    refinements: changes,
    outcome: "applied",
  };
}

export interface ImageInput {
  data: Buffer | string;
  name?: string;
}

/** Both fields are `undefined` when structure was not requested. */
interface ImageStructureOutcome {
  structureReport: StructureReport | undefined;
  structureUnavailableReason: string | undefined;
}

/**
 * Image path ("Palette & Mood" report). Several images of one subject merge at
 * the pixel-cluster level, not after role assignment, so the result is one
 * coherent palette instead of N colliding ones.
 */
export async function analyzeImages(
  images: ImageInput[],
  mode: AnalyzeMode = "tokens",
): Promise<
  AnalyzeResult & {
    refinements: RefinementChange[];
    structureReport?: StructureReport;
    structureUnavailableReason?: string;
    meta: {
      finalUrl: string;
      title: string;
      elapsedMs: number;
      bannerDismissed: boolean;
      aiOutcome: AiOutcome;
    };
  }
> {
  if (images.length === 0) {
    throw new Error("analyzeImages requires at least one image.");
  }

  const startedAt = Date.now();
  const capturedAt = new Date().toISOString();
  const names = images.map((img, i) => img.name || `uploaded-image-${i + 1}`);
  const ref = names.length === 1 ? names[0] : `${names[0]} +${names.length - 1} more`;

  const palette = await extractImagePalette(images.map((img) => img.data));

  const baseReport = buildReport({
    reportKind: "palette-mood",
    source: {
      type: "image",
      ref,
      ...(names.length > 1 ? { refs: names } : {}),
      capturedAt,
    },
    palette,
  });

  const measuredResult: AnalyzeResult = {
    report: baseReport,
    markdown: renderMarkdown(baseReport),
  };

  const screenshotsBase64 = images.map((img) =>
    typeof img.data === "string" ? img.data : img.data.toString("base64"),
  );

  const wantsStructure = mode === "structure" || mode === "both";
  // A "structure"-only caller has no use for the identity/imageMood AI pass
  // over the palette-mood report, so skip it rather than paying for both.
  const wantsTokenEnrichment = mode === "tokens" || mode === "both";

  const [enriched, structureOutcome] = await Promise.all([
    enrichWithAI(measuredResult, screenshotsBase64, { requested: wantsTokenEnrichment }),
    wantsStructure
      ? aiLaneAvailable()
        ? structureFromImages({
            imagesPngBase64: screenshotsBase64,
            sourceRef: ref,
            capturedAt,
          })
            .then((structureReport): ImageStructureOutcome => ({
              structureReport: structureReport ?? undefined,
              structureUnavailableReason: structureReport
                ? undefined
                : "Vision structure inference failed for this image.",
            }))
            .catch((err): ImageStructureOutcome => {
              console.warn("Image structure extraction error:", err);
              return {
                structureReport: undefined,
                structureUnavailableReason: "Vision structure inference failed for this image.",
              };
            })
        : Promise.resolve<ImageStructureOutcome>({
            structureReport: undefined,
            // Distinct from the vision-call failure above: this is a
            // persistent condition (no retry will fix it without config
            // changes), not a one-off flake — the route.ts caching gate
            // relies on that distinction.
            structureUnavailableReason:
              "Structure inference for images requires an AI key — set OPENROUTER_API_KEY.",
          })
      : Promise.resolve<ImageStructureOutcome>({
          structureReport: undefined,
          structureUnavailableReason: undefined,
        }),
  ]);

  const { structureReport, structureUnavailableReason } = structureOutcome;

  return {
    report: enriched.report,
    markdown: enriched.markdown,
    refinements: enriched.refinements,
    structureReport,
    structureUnavailableReason,
    meta: {
      finalUrl: ref,
      title: ref,
      elapsedMs: Date.now() - startedAt,
      bannerDismissed: false,
      aiOutcome: enriched.outcome,
    },
  };
}

/** Turn a live render into the artifacts the extraction lane consumes. */
export function captureFromRender(
  render: RenderResult,
  ref: string,
  capturedAt: string,
): Capture {
  const { finalUrl, title, viewport, elapsedMs, bannerDismissed, ...artifacts } = render;
  void elapsedMs;
  void bannerDismissed;
  return {
    source: { type: "url", ref, capturedAt },
    finalUrl,
    title,
    viewport,
    ...artifacts,
  };
}

/** Always includes the first and last item, so a long tile sequence still
 *  gives the AI lane full-page coverage. */
function subsampleEvenly<T>(items: T[], maxCount: number): T[] {
  if (items.length <= maxCount) return items;
  const result: T[] = [];
  for (let i = 0; i < maxCount; i++) {
    result.push(items[Math.round((i * (items.length - 1)) / (maxCount - 1))]);
  }
  return result;
}

/** Full URL path: render, extract (measured), then interpret (AI). */
export async function analyzeUrl(
  url: string,
  mode: AnalyzeMode = "both",
): Promise<AnalyzeResult & {
  capture: Capture;
  refinements: RefinementChange[];
  structureReport?: StructureReport;
  structureUnavailableReason?: string;
  meta: {
    finalUrl: string;
    title: string;
    elapsedMs: number;
    bannerDismissed: boolean;
    aiOutcome: AiOutcome;
  };
}> {
  const capturedAt = new Date().toISOString();
  const render = await renderUrl(url);
  const capture = captureFromRender(render, url, capturedAt);
  const measured = await extractFromCapture(capture);
  // Same structure-only skip as `analyzeImages`.
  const wantsTokenEnrichment = mode === "tokens" || mode === "both";
  const wantsStructure = mode === "structure" || mode === "both";

  // Track A token enrichment and Track B Stage 7 labelling run concurrently:
  // the labelling call needs nothing from the enriched report.
  const [enriched, preliminaryOutcome] = await Promise.all([
    enrichWithAI(
      measured,
      [
        capture.viewportShot,
        ...subsampleEvenly(capture.scrollShots ?? [], 3),
      ],
      { requested: wantsTokenEnrichment },
    ),
    wantsStructure
      ? capture.rawHarvestNode
        ? extractStructureThroughStage7({
            rawHarvestNode: capture.rawHarvestNode,
            viewport: capture.viewport,
            responsiveHarvests: capture.responsiveHarvests,
          })
            .then((preliminary) => ({ preliminary }))
            .catch((err) => {
              console.warn("Structure extraction error:", err);
              return { preliminary: undefined };
            })
        : (() => {
            console.warn(
              "Structure extraction error:",
              new Error("Capture does not contain rawHarvestNode for structure extraction."),
            );
            return Promise.resolve({ preliminary: undefined });
          })()
      : Promise.resolve({ preliminary: undefined }),
  ]);

  let structureReport: StructureReport | undefined;
  let structureUnavailableReason: string | undefined;

  if (wantsStructure) {
    if (preliminaryOutcome.preliminary) {
      try {
        structureReport = finalizeStructure(preliminaryOutcome.preliminary, {
          sourceUrl: capture.source.ref,
          capturedAt: capture.source.capturedAt,
          viewport: capture.viewport,
          secondaryViewports: capture.responsiveHarvests?.map((h) => h.viewport),
          dump: mode === "both" ? capture.styleDump : undefined,
          report: mode === "both" ? enriched.report : undefined,
        });
      } catch (err) {
        console.warn("Structure extraction error:", err);
        structureUnavailableReason = "Structure extraction failed for this page.";
      }
    } else {
      structureUnavailableReason = "Structure extraction failed for this page.";
    }
  }

  return {
    report: enriched.report,
    markdown: enriched.markdown,
    refinements: enriched.refinements,
    structureReport,
    structureUnavailableReason,
    capture,
    meta: {
      finalUrl: render.finalUrl,
      title: render.title,
      elapsedMs: render.elapsedMs,
      bannerDismissed: render.bannerDismissed,
      aiOutcome: enriched.outcome,
    },
  };
}

