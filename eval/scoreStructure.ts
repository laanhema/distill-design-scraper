import type { StructureReport } from "@/lib/schema";

export interface ExpectedStructureSpec {
  expectedRegions?: string[];
  expectedComponents?: Record<string, { count?: number; type?: string }>;
}

export interface StructureScoreResult {
  regionAccuracy: number;
  componentCountAccuracy: number;
  combined: number;
  misses: string[];
}

/**
 * Structure Evaluation Scoring (§10)
 * Evaluates extracted structure against expected specifications.
 */
export function scoreStructure(
  report: StructureReport,
  expected?: ExpectedStructureSpec,
): StructureScoreResult {
  if (!expected) {
    return {
      regionAccuracy: 1.0,
      componentCountAccuracy: 1.0,
      combined: 1.0,
      misses: [],
    };
  }

  const misses: string[] = [];

  // 1. Region accuracy
  let regionHits = 0;
  const expectedRegions = expected.expectedRegions || [];
  if (expectedRegions.length > 0) {
    const emittedAscii = report.skeletonAscii;
    for (const reg of expectedRegions) {
      if (emittedAscii.toLowerCase().includes(reg.toLowerCase())) {
        regionHits++;
      } else {
        misses.push(`Missing expected region: ${reg}`);
      }
    }
  }
  const regionAccuracy =
    expectedRegions.length > 0 ? regionHits / expectedRegions.length : 1.0;

  // 2. Component count accuracy
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

  const combined = (regionAccuracy + componentCountAccuracy) / 2;

  return {
    regionAccuracy,
    componentCountAccuracy,
    combined,
    misses,
  };
}
