import fs from "fs";
import path from "path";
import type { Page } from "playwright";
import type { Mitigation } from "@/lib/schema";

export interface AutoconsentTracker {
  detectedCmp: string | null;
  action: "optOut" | "optIn";
  isDone: boolean;
  noCmp: boolean;
}

let bundleCache: string | null = null;

function getBundle(): string {
  if (bundleCache === null) {
    const pkgMain = require.resolve("@duckduckgo/autoconsent");
    const standalonePath = path.join(path.dirname(pkgMain), "autoconsent.standalone.js");
    bundleCache = fs.readFileSync(standalonePath, "utf8");
  }
  return bundleCache;
}

export async function setupAutoconsent(page: Page): Promise<AutoconsentTracker> {
  const tracker: AutoconsentTracker = {
    detectedCmp: null,
    action: "optOut",
    isDone: false,
    noCmp: false,
  };

  page.on("console", (msg) => {
    const text = msg.text();
    const optOutMatch = text.match(/autoconsent opt-out result:\s*([^\s]+)\s+true\b/i);
    if (optOutMatch) {
      tracker.detectedCmp = optOutMatch[1];
      tracker.action = "optOut";
    }
    const optInMatch = text.match(/autoconsent opt-in result:\s*([^\s]+)\s+true\b/i);
    if (optInMatch) {
      tracker.detectedCmp = optInMatch[1];
      tracker.action = "optIn";
    }
    if (text.includes("autoconsent done:")) {
      tracker.isDone = true;
    }
    if (text.includes("no CMP found")) {
      tracker.noCmp = true;
    }
  });

  const bundleText = getBundle();
  await page.addInitScript({ content: bundleText });
  return tracker;
}

export async function waitForAutoconsent(
  _page: Page,
  tracker: AutoconsentTracker,
  timeoutCapMs?: number,
): Promise<Mitigation | null> {
  const cap =
    timeoutCapMs ??
    (process.env.AUTOCONSENT_TIMEOUT_MS
      ? parseInt(process.env.AUTOCONSENT_TIMEOUT_MS, 10)
      : 1500);

  const start = Date.now();

  while (Date.now() - start < cap) {
    if (tracker.isDone || tracker.noCmp) {
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  if (tracker.detectedCmp) {
    return {
      kind: "consent",
      cmp: tracker.detectedCmp,
      action: tracker.action,
    };
  }

  return null;
}
