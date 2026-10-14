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
 * Orchestration (§8, URL & Image pipelines). Extraction is split from rendering on
 * purpose: `extractFromCapture` takes only the captured artifacts (style dump +
 * screenshot), so the eval harness (§10) can replay a cached render offline and
 * exercise every heuristic without launching a browser.
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
 * already-built design-tokens report) in `both` mode to enable the P3-1
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
 * Interpretation pass (§6): run the AI lane over an already-measured report and
 * merge its identity/imageMood plus Stage E role refinements (§5). Kept
 * separate from `extractFromCapture` on purpose — the measured lane must stay
 * browser- and network-free so the eval harness can replay captures offline;
 * only the live URL/image paths reach for the model. Falls back to the measured
 * report untouched when no API key is set or the model fails (§6, §9).
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
  // measured lane must survive it untouched. Enumerating them by hand silently
  // dropped `motion` when that lane was added — a spread can't drift.
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

/** What the structure lane of the image path came to: the inferred report, or
 *  the reason there is none. Both are `undefined` when structure was not
 *  requested. Every arm of the lane in `analyzeImages` is annotated with it. */
interface ImageStructureOutcome {
  structureReport: StructureReport | undefined;
  structureUnavailableReason: string | undefined;
}

/**
 * Phase 3 / §P6-1: Full image processing path ("Palette & Mood" report).
 * Accepts one or more images of the same subject — palettes are merged at the
 * pixel-cluster level (§P6-1, `extractImagePalette`) rather than averaged
 * after role-assignment, so the result is still one coherent, unique-per-role
 * palette instead of N colliding ones.
 */
export async function analyzeImages(
  images: ImageInput[],
  mode: AnalyzeMode = "tokens",
): Promise<
  AnalyzeResult & {
    refinements: RefinementChange[];
    structureReport?: StructureReport;
    /** Set when structure was requested but couldn't be produced — no API
     *  key, or the vision model failed — so the caller can explain the gap
     *  instead of silently omitting it (§P6-2 step 2). */
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
            // changes), not a one-off flake — see the route.ts caching gate,
            // which relies on that distinction (DIST-050).
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

/** Picks up to `maxCount` items evenly spread across `items` (always
 *  including the first and last), so a long top-to-bottom tile sequence
 *  still gives the AI lane full-page coverage instead of just whatever the
 *  first few happen to be. */
function subsampleEvenly<T>(items: T[], maxCount: number): T[] {
  if (items.length <= maxCount) return items;
  const result: T[] = [];
  for (let i = 0; i < maxCount; i++) {
    result.push(items[Math.round((i * (items.length - 1)) / (maxCount - 1))]);
  }
  return result;
}

/** Full URL path: render, extract (measured), then interpret (AI, §6). */
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
  // A "structure"-only caller has no use for the identity/imageMood AI pass
  // over the palette-mood report, so skip it rather than paying for both.
  const wantsTokenEnrichment = mode === "tokens" || mode === "both";
  const wantsStructure = mode === "structure" || mode === "both";

  // Run the two model calls concurrently: Track A token enrichment and
  // Track B structure Stage 7 labelling start together via Promise.all (#175).
  // The labelling call needs nothing from the enriched report.
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

