import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { load as yamlLoad } from "js-yaml";
import { extractFromCapture, extractStructureFromCapture, type Capture } from "@/lib/analyze";
import { CORPUS } from "./corpus";
import {
  scorePalette,
  scoreTypography,
  combinedScore,
  type ExpectedSpec,
} from "./score";
import { scoreStructure } from "./scoreStructure";

/**
 * Eval runner (§10). Replays each committed capture offline, runs the measured
 * extraction lane, diffs against `expected.yaml`, and prints per-site +
 * aggregate scores. Wired into CI as a regression gate over the extractor:
 *
 *   • every scored site must clear an absolute floor, and
 *   • no site's combined score may drop below the committed baseline.
 *
 * Refresh the baseline deliberately after an intended improvement:
 *   UPDATE_BASELINE=1 npm run eval
 */

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

/** Absolute floor — catches total breakage even with no baseline present. */
const SITE_FLOOR = 0.7;
/** A drop larger than this below baseline is a regression. */
const REGRESSION_EPS = 0.01;

interface SiteResult {
  slug: string;
  combined: number;
  roleAccuracy: number;
  scaleAccuracy: number | null;
  avgDeltaE: number;
  bodyFamilyOk: boolean | null;
  structureScore: number | null;
  notes: string[];
}

async function scoreSite(slug: string): Promise<SiteResult | null> {
  const capturePath = here(`corpus/${slug}/capture.json`);
  const expectedPath = here(`corpus/${slug}/expected.yaml`);
  if (!existsSync(capturePath) || !existsSync(expectedPath)) return null;

  const capture = JSON.parse(readFileSync(capturePath, "utf8")) as Capture;
  const expected = yamlLoad(readFileSync(expectedPath, "utf8")) as ExpectedSpec;

  const { report } = await extractFromCapture(capture);
  const pal = scorePalette(report.palette, expected.palette);
  const typo = scoreTypography(report.typography, expected.typography);

  let structureScore: number | null = null;
  let structureMisses: string[] = [];
  if (capture.rawHarvestNode) {
    try {
      // Force the heuristic Stage 7 fallback (DIST-013) so the eval path
      // never makes AI calls — keeps `npm run eval`
      // offline and deterministic even when `GEMINI_API_KEY` is set.
      const structReport = await extractStructureFromCapture(
        capture,
        undefined,
        { forceHeuristicNaming: true },
      );
      const structResult = scoreStructure(structReport, expected.structure);
      structureScore = structResult.combined;
      structureMisses = structResult.misses;
    } catch (err) {
      // A structure-extraction/scoring failure is a real regression —
      // force `structureScore = 0` so `combinedScore` drops by 0.2
      // (well past REGRESSION_EPS) instead of silently falling back to
      // the old palette-only weighting (which would yield 1.0 on these
      // perfect-palette/perfect-type fixtures and keep the gate green).
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`  ⚠ structure lane error for ${slug}: ${msg}`);
      structureScore = 0;
      structureMisses = [`lane error: ${msg}`];
    }
  }

  const combined = combinedScore(pal, typo, structureScore);

  const notes: string[] = [];
  for (const m of pal.misses) {
    notes.push(
      `palette ${m.role}: expected ${m.expected}, got ${m.got ?? "—"}` +
        (m.deltaE !== null ? ` (ΔE ${m.deltaE.toFixed(1)})` : ""),
    );
  }
  if (typo) {
    for (const m of typo.misses) {
      notes.push(`type ${m.token}: expected ${m.expected}px, got ${m.got ?? "—"}px`);
    }
    if (typo.bodyFamilyOk === false) {
      notes.push(`body family mismatch (expected ${expected.typography?.bodyFamily})`);
    }
  }
  for (const m of structureMisses) {
    notes.push(`structure: ${m}`);
  }

  return {
    slug,
    combined,
    roleAccuracy: pal.roleAccuracy,
    scaleAccuracy: typo?.scaleAccuracy ?? null,
    avgDeltaE: pal.avgDeltaE,
    bodyFamilyOk: typo?.bodyFamilyOk ?? null,
    structureScore,
    notes,
  };
}


function fmtPct(n: number): string {
  return `${(n * 100).toFixed(0)}%`;
}

async function main() {
  const results: SiteResult[] = [];
  const skipped: string[] = [];

  for (const entry of CORPUS) {
    const r = await scoreSite(entry.slug);
    if (r) results.push(r);
    else skipped.push(entry.slug);
  }

  if (results.length === 0) {
    console.error(
      "No scorable sites (need both capture.json and expected.yaml).\n" +
        "Run `npm run eval:capture` first.",
    );
    process.exit(1);
  }

  // Per-site table.
  console.log("\nDistill eval — measured lane (§10)\n");
  for (const r of results) {
    const typ = r.scaleAccuracy === null ? "  —  " : fmtPct(r.scaleAccuracy);
    console.log(
      `  ${r.slug.padEnd(14)} combined ${fmtPct(r.combined).padStart(4)}` +
        `  roles ${fmtPct(r.roleAccuracy).padStart(4)}` +
        `  type ${typ.padStart(4)}` +
        `  ΔE ${r.avgDeltaE.toFixed(1)}`,
    );
    for (const n of r.notes) console.log(`      ↳ ${n}`);
  }

  const aggregate =
    results.reduce((s, r) => s + r.combined, 0) / results.length;
  console.log(`\n  aggregate combined: ${fmtPct(aggregate)}`);
  if (skipped.length) {
    console.log(`  skipped (no capture/expected): ${skipped.join(", ")}`);
  }

  // Gate 1: absolute floor.
  const belowFloor = results.filter((r) => r.combined < SITE_FLOOR);

  // Gate 2: baseline regression.
  const baselinePath = here("baseline.json");
  const baseline: Record<string, number> = existsSync(baselinePath)
    ? JSON.parse(readFileSync(baselinePath, "utf8"))
    : {};

  if (process.env.UPDATE_BASELINE) {
    const next: Record<string, number> = {};
    for (const r of results) next[r.slug] = Number(r.combined.toFixed(4));
    writeFileSync(baselinePath, JSON.stringify(next, null, 2) + "\n", "utf8");
    console.log(`\n  baseline updated (${results.length} sites).`);
    return;
  }

  const regressions = results.filter(
    (r) => r.slug in baseline && r.combined < baseline[r.slug] - REGRESSION_EPS,
  );

  let failed = false;
  if (belowFloor.length) {
    failed = true;
    console.error(
      `\n  ✗ below floor (${fmtPct(SITE_FLOOR)}): ${belowFloor.map((r) => r.slug).join(", ")}`,
    );
  }
  if (regressions.length) {
    failed = true;
    for (const r of regressions) {
      console.error(
        `  ✗ regression ${r.slug}: ${fmtPct(r.combined)} < baseline ${fmtPct(baseline[r.slug])}`,
      );
    }
  }

  if (failed) process.exit(1);
  console.log("\n  ✓ all gates passed\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
