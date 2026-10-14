import type { Report, StructureReport } from "@/lib/schema";
import type { RefinementChange } from "@/lib/interpret";

/**
 * Type-only imports, so the client does not pull `zod`, `js-yaml`, or schema
 * parsers into the browser bundle.
 */

export const MAX_IMAGES = 6;

export type AiOutcome = "applied" | "no-key" | "failed" | "not-requested";

export interface AnalyzeMeta {
  finalUrl: string;
  title: string;
  elapsedMs: number;
  bannerDismissed: boolean;
  capturedAt: string;
  /** Screenshots of a URL render, as data URLs: the viewport shot, then the
   *  panorama when one was captured. Absent for image input — the uploads are
   *  not sent back to the client that sent them. */
  viewportShots?: string[];
  aiOutcome: AiOutcome;
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
   *  without an API key, or the vision model failed). */
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
