import type { Report, StructureReport } from "@/lib/schema";
import type { RefinementChange } from "@/lib/interpret";

/**
 * Shared API contract between `app/api/analyze/route.ts` and `app/page.tsx` (DIST-071, TODO-7).
 * Uses type-only imports for `Report` and `StructureReport` so client callers do
 * not pull `zod`, `js-yaml`, or schema parsers into browser bundles.
 */

export const MAX_IMAGES = 6;

export interface AnalyzeMeta {
  finalUrl: string;
  title: string;
  elapsedMs: number;
  bannerDismissed: boolean;
  capturedAt: string;
  viewportShot: string;
  /** Every source image, in submitted order (image mode only, §P6-1). */
  viewportShots?: string[];
  aiApplied: boolean;
}

export type Meta = AnalyzeMeta;
export type { RefinementChange };
export type Refinement = RefinementChange;

export interface AnalyzeSuccess {
  ok: true;
  report: Report;
  markdown: string;
  structureReport: StructureReport | null;
  /** Set when structure was requested but couldn't be produced (image mode
   *  without an API key, or the vision model failed) — §P6-2 step 2. */
  structureUnavailableReason?: string;
  refinements: RefinementChange[];
  meta: AnalyzeMeta;
}

export interface AnalyzeFailure {
  ok: false;
  error: string;
}

export type AnalyzeResponse = AnalyzeSuccess | AnalyzeFailure;

export function isAnalyzeResponse(data: unknown): data is AnalyzeResponse {
  return (
    typeof data === "object" &&
    data !== null &&
    "ok" in data &&
    typeof (data as { ok: unknown }).ok === "boolean"
  );
}
