import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { extractFromCapture, type Capture } from "@/lib/analyze";
import { aiLaneAvailable, interpret } from "@/lib/interpret";
import { CORPUS } from "./corpus";

/**
 * AI-lane stability eval (§10). The interpretive lane has no golden label, so
 * we use **stability as the proxy for quality**: run each input 3× and assert
 * the `identity.adjectives` set and `archetype` stay consistent across runs
 * (Jaccard overlap above a threshold). This catches temperature/prompt
 * regressions without a "correct" answer.
 *
 * Unlike `npm run eval` (the measured lane, offline and CI-gated), this makes
 * live model calls, so it is opt-in: `npm run eval:ai`, and a no-op without an
 * GEMINI_API_KEY. Screenshots come from the committed captures, so only the
 * AI lane varies between runs.
 */

const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

const RUNS = 3;
const ADJECTIVE_JACCARD_FLOOR = 0.5;
const ARCHETYPE_JACCARD_FLOOR = 0.3;

function normalize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Mean pairwise Jaccard overlap of a set of token lists (1 for <2 lists). */
function meanPairwiseJaccard(sets: string[][]): number {
  if (sets.length < 2) return 1;
  const uniq = sets.map((s) => new Set(s));
  let sum = 0;
  let pairs = 0;
  for (let i = 0; i < uniq.length; i++) {
    for (let j = i + 1; j < uniq.length; j++) {
      const a = uniq[i];
      const b = uniq[j];
      const inter = [...a].filter((x) => b.has(x)).length;
      const union = new Set([...a, ...b]).size;
      sum += union === 0 ? 1 : inter / union;
      pairs++;
    }
  }
  return pairs === 0 ? 1 : sum / pairs;
}

async function scoreSite(slug: string): Promise<{
  slug: string;
  adjJaccard: number;
  archJaccard: number;
  ok: boolean;
} | null> {
  const capturePath = here(`corpus/${slug}/capture.json`);
  if (!existsSync(capturePath)) return null;

  const capture = JSON.parse(readFileSync(capturePath, "utf8")) as Capture;
  const { report } = await extractFromCapture(capture);

  const adjectiveSets: string[][] = [];
  const archetypeSets: string[][] = [];
  for (let i = 0; i < RUNS; i++) {
    const interpretation = await interpret({
      screenshotsPngBase64: [capture.viewportShot],
      palette: report.palette,
      typography: report.typography,
    });
    if (!interpretation) return null; // model unavailable — skip, don't fail
    adjectiveSets.push(
      interpretation.identity.adjectives.map((a) => a.toLowerCase().trim()),
    );
    archetypeSets.push(normalize(interpretation.identity.archetype));
  }

  const adjJaccard = meanPairwiseJaccard(adjectiveSets);
  const archJaccard = meanPairwiseJaccard(archetypeSets);
  return {
    slug,
    adjJaccard,
    archJaccard,
    ok: adjJaccard >= ADJECTIVE_JACCARD_FLOOR && archJaccard >= ARCHETYPE_JACCARD_FLOOR,
  };
}

async function main() {
  if (!aiLaneAvailable()) {
    console.log(
      "AI-lane stability eval skipped: set GEMINI_API_KEY or OPENROUTER_API_KEY to run it.",
    );
    return;
  }

  console.log(`\nDistill AI-lane stability (§10) — ${RUNS} runs per site\n`);
  let failed = false;
  let scored = 0;

  for (const entry of CORPUS) {
    const r = await scoreSite(entry.slug);
    if (!r) continue;
    scored++;
    const mark = r.ok ? "✓" : "✗";
    console.log(
      `  ${mark} ${r.slug.padEnd(14)} adjectives ${r.adjJaccard.toFixed(2)}` +
        `  archetype ${r.archJaccard.toFixed(2)}`,
    );
    if (!r.ok) failed = true;
  }

  if (scored === 0) {
    console.log("  (no captures with a live interpretation to score)");
    return;
  }
  console.log(
    `\n  thresholds: adjectives ≥ ${ADJECTIVE_JACCARD_FLOOR}, archetype ≥ ${ARCHETYPE_JACCARD_FLOOR}`,
  );
  if (failed) {
    console.error("\n  ✗ AI lane unstable — check temperature/prompt\n");
    process.exit(1);
  }
  console.log("\n  ✓ AI lane stable\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
