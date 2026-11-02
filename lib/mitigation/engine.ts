import fs from "fs/promises";
import path from "path";
import { PlaywrightBlocker } from "@ghostery/adblocker-playwright";

export const COOKIE_FILTER_LIST_URLS = [
  "https://raw.githubusercontent.com/ghostery/adblocker/master/packages/adblocker/assets/easylist/easylist-cookie.txt",
  "https://raw.githubusercontent.com/ghostery/adblocker/master/packages/adblocker/assets/ublock-origin/annoyances-cookies.txt",
  "https://raw.githubusercontent.com/ghostery/adblocker/master/packages/adblocker/assets/ublock-origin/annoyances-others.txt",
];

export const APPLIED_FILTER_LISTS = [
  "easylist-cookie",
  "annoyances-cookies",
  "annoyances-others",
];

export async function fetchWithRetry(
  fetchImpl: typeof fetch,
  url: string,
  retries = 3,
  delayMs = 500,
): Promise<Response> {
  let attempt = 0;
  while (true) {
    try {
      const res = await fetchImpl(url);
      if (!res.ok) {
        throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
      }
      return res;
    } catch (err) {
      attempt++;
      if (attempt > retries) {
        throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

function getCachePath(): string {
  return (
    process.env.DISTILL_FILTER_CACHE_PATH ||
    path.join(process.cwd(), "node_modules/.cache/distill/filters.bin")
  );
}

let filterListsActive = false;

async function initBlocker(): Promise<PlaywrightBlocker> {
  const cachePath = getCachePath();
  const caching = {
    path: cachePath,
    read: (filePath: string) => fs.readFile(filePath),
    write: async (filePath: string, buffer: Uint8Array) => {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, buffer);
    },
  };

  try {
    const customFetch = (url: string) => fetchWithRetry(fetch, url);
    const blocker = await PlaywrightBlocker.fromLists(
      customFetch as unknown as Parameters<typeof PlaywrightBlocker.fromLists>[0],
      COOKIE_FILTER_LIST_URLS,
      {},
      caching,
    );
    filterListsActive = true;
    return blocker;
  } catch (err) {
    console.warn(
      "Failed to initialize Ghostery filter engine, falling back to empty blocker:",
      err,
    );
    filterListsActive = false;
    return PlaywrightBlocker.empty();
  }
}

let blockerPromise: Promise<PlaywrightBlocker> | null = null;

export function getBlocker(): Promise<PlaywrightBlocker> {
  if (!blockerPromise) {
    blockerPromise = initBlocker();
  }
  return blockerPromise;
}

export async function isFilterEngineActive(): Promise<boolean> {
  await getBlocker();
  return filterListsActive;
}
