import type { StructureReport } from "@/lib/schema";

export interface ExpectedSectionEntry {
  name: string;
  instances?: number;
}

export interface ExpectedStructureSpec {
  expectedRegions?: string[];
  expectedComponents?: Record<string, { count?: number; type?: string }>;
  /** Ordered section-digest names/instances (DIST-028) — the primary
   *  structure-lane signal. Scored by ordinal position so a missing or
   *  reordered band registers as a real regression. */
  expectedSections?: ExpectedSectionEntry[];
}

export interface StructureScoreResult {
  regionAccuracy: number;
  componentCountAccuracy: number;
  /** Section-digest ordinal accuracy — `null` when no `expectedSections`
   *  were provided (excluded from `combined`). `0` when sections were
   *  expected but the digest is absent (real regression signal). */
  sectionAccuracy: number | null;
  combined: number;
  misses: string[];
}

/**
 * Structure Evaluation Scoring (§10)
 * Evaluates extracted structure against expected specifications.
 *
 * Scoring order of precedence when `expectedSections` is provided:
 *   sections (primary) → regions (skeleton presence) → component counts.
 * When `expectedSections` is absent, falls back to the historical
 * region+component average so callers that only spec the legacy fields
 * keep their old scores.
 */
export function scoreStructure(
  report: StructureReport,
  expected?: ExpectedStructureSpec,
): StructureScoreResult {
  if (!expected) {
    return {
      regionAccuracy: 1.0,
      componentCountAccuracy: 1.0,
      sectionAccuracy: null,
      combined: 1.0,
      misses: [],
    };
  }

  const misses: string[] = [];

  // 1. Section-digest ordinal accuracy (DIST-028) — primary signal.
  const expectedSections = expected.expectedSections ?? [];
  let sectionAccuracy: number | null = null;
  if (expectedSections.length > 0) {
    const emitted = report.machineBlock.sections ?? [];
    if (emitted.length === 0) {
      sectionAccuracy = 0;
      misses.push("Sections digest absent but expectedSections provided");
    } else {
      let hits = 0;
      for (let i = 0; i < expectedSections.length; i++) {
        const want = expectedSections[i];
        const got = emitted[i];
        if (!got) {
          misses.push(`Missing/extra section at ordinal ${i + 1}: expected ${want.name}, got —`);
          continue;
        }
        const nameOk = got.name.toLowerCase() === want.name.toLowerCase();
        const instancesOk =
          want.instances === undefined ||
          (got.instances ?? 1) === want.instances;
        if (nameOk && instancesOk) {
          hits++;
        } else {
          const gotInst = got.instances ? ` ×${got.instances}` : "";
          const wantInst = want.instances ? ` ×${want.instances}` : "";
          misses.push(
            `Missing/extra section at ordinal ${i + 1}: expected ${want.name}${wantInst}, got ${got.name}${gotInst}`,
          );
        }
      }
      sectionAccuracy = hits / expectedSections.length;
    }
  }

  // 2. Region accuracy (skeleton ASCII presence) — secondary signal.
  let regionHits = 0;
  const expectedRegions = expected.expectedRegions || [];
  if (expectedRegions.length > 0) {
    const emittedAscii = report.skeletonAscii;
    for (const reg of expectedRegions) {
      // Word-boundary match so `Main` does not satisfy `MainContent`,
      // and `Site` does not satisfy both `SiteHeader` and `SiteFooter`.
      const re = new RegExp(
        `\\b${reg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`,
        "i",
      );
      if (re.test(emittedAscii)) {
        regionHits++;
      } else {
        misses.push(`Missing expected region: ${reg}`);
      }
    }
  }
  const regionAccuracy =
    expectedRegions.length > 0 ? regionHits / expectedRegions.length : 1.0;

  // 3. Component count accuracy — secondary signal.
  let countHits = 0;
  const expectedComps = expected.expectedComponents || {};
  const expectedCompKeys = Object.keys(expectedComps);

  if (expectedCompKeys.length > 0) {
    for (const [name, spec] of Object.entries(expectedComps)) {
      const gotDef = report.machineBlock.components[name];
      if (!gotDef) {
        misses.push(`Missing expected component definition: ${name}`);
        continue;
      }
      if (spec.count !== undefined && gotDef.instances !== undefined) {
        if (Math.abs(gotDef.instances - spec.count) <= 1) {
          countHits++;
        } else {
          misses.push(
            `Component count mismatch for ${name}: expected ${spec.count}, got ${gotDef.instances}`,
          );
        }
      } else {
        countHits++;
      }
    }
  }
  const componentCountAccuracy =
    expectedCompKeys.length > 0 ? countHits / expectedCompKeys.length : 1.0;

  // Combined: sections primary when present, otherwise the historical mean.
  let combined: number;
  if (sectionAccuracy !== null) {
    combined =
      sectionAccuracy * 0.5 +
      regionAccuracy * 0.2 +
      componentCountAccuracy * 0.3;
  } else {
    combined = (regionAccuracy + componentCountAccuracy) / 2;
  }

  return {
    regionAccuracy,
    componentCountAccuracy,
    sectionAccuracy,
    combined,
    misses,
  };
}
