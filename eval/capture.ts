import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { capturePage } from "@/lib/ingest";
import type { Capture } from "@/lib/analyze";
import { CORPUS, type CorpusEntry } from "./corpus";

/**
 * Writes eval/corpus/<slug>/capture.json for the offline scorer to replay.
 * Live-URL captures are git-ignored: they move, and CI has no network.
 *
 *   npm run eval:capture            → all offline fixtures (safe, no network)
 *   npm run eval:capture -- stripe  → named live entries (opens a browser)
 *   npm run eval:capture -- --all   → every entry, fixtures + live
 */

const VIEWPORT = { width: 1440, height: 900 };
const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));

async function captureEntry(entry: CorpusEntry): Promise<Capture> {
  const { target, ref } =
    "fixture" in entry
      ? { target: new URL(`fixtures/${entry.fixture}`, import.meta.url).href, ref: entry.fixture }
      : { target: entry.url, ref: entry.url };

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      // Same explicit baseline as `lib/ingest.ts` — deterministic
      // capture regardless of the CI/OS default color scheme.
      colorScheme: "light",
    });
    const page = await context.newPage();
    await page.goto(target, { waitUntil: "domcontentloaded", timeout: 30_000 });
    try {
      await page.waitForLoadState("networkidle", { timeout: 8_000 });
    } catch {
      /* chatty sites never idle — proceed with what has painted */
    }
    const { bannerDismissed, ...artifacts } = await capturePage(page);
    void bannerDismissed;
    const capture: Capture = {
      source: {
        type: "url",
        ref,
        capturedAt: new Date().toISOString(),
      },
      finalUrl: page.url(),
      title: await page.title(),
      viewport: VIEWPORT,
      ...artifacts,
    };
    await context.close();
    return capture;
  } finally {
    await browser.close();
  }
}

function selectEntries(args: string[]): CorpusEntry[] {
  if (args.includes("--all")) return CORPUS;
  const named = args.filter((a) => !a.startsWith("--"));
  if (named.length > 0) {
    return CORPUS.filter((e) => named.includes(e.slug));
  }
  // Default: offline fixtures only — never touch the network unprompted.
  return CORPUS.filter((e) => "fixture" in e);
}

async function main() {
  const entries = selectEntries(process.argv.slice(2));
  if (entries.length === 0) {
    console.error("No matching corpus entries.");
    process.exit(1);
  }

  for (const entry of entries) {
    process.stdout.write(`Capturing ${entry.slug}… `);
    try {
      const capture = await captureEntry(entry);
      const dir = here(`corpus/${entry.slug}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        `${dir}/capture.json`,
        JSON.stringify(capture, null, 2),
        "utf8",
      );
      const bytes = capture.styleDump.nodes.length;
      console.log(`ok (${bytes} nodes${capture.styleDump.truncated ? ", truncated" : ""})`);
    } catch (err) {
      console.log(`FAILED: ${err instanceof Error ? err.message : err}`);
    }
  }
}

main();
