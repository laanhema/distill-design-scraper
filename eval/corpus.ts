/**
 * The eval corpus (§10). A fixed set of reference pages, each paired with a
 * hand-authored `expected.yaml`, chosen to span the real failure modes.
 *
 * Two kinds of entry:
 *   • `fixture` — a local HTML page under eval/fixtures. Its capture is rendered
 *     once and *committed* to eval/corpus/<slug>/capture.json, so `npm run eval`
 *     runs fully offline in CI with a known answer.
 *   • `url` — a live reference site. Captured on demand by `npm run eval:capture`
 *     (network + a browser); the capture is git-ignored. Score it once you have
 *     authored its expected.yaml from the captured render.
 */

export interface CorpusEntry {
  slug: string;
  bucket:
    | "clean-design-system"
    | "content-heavy"
    | "dark-mode"
    | "css-variable"
    | "gradient-hero"
    | "hostile";
  /** Local fixture filename under eval/fixtures (offline, committed capture). */
  fixture?: string;
  /** Live reference URL (captured on demand; capture git-ignored). */
  url?: string;
}

export const CORPUS: CorpusEntry[] = [
  // Committed, offline fixtures — the regression floor for CI.
  { slug: "clean-light", bucket: "clean-design-system", fixture: "clean-light.html" },
  { slug: "dark-mode", bucket: "dark-mode", fixture: "dark-mode.html" },

  // Live references — capture + author expected.yaml to bring these online.
  { slug: "stripe", bucket: "clean-design-system", url: "https://stripe.com" },
  { slug: "linear", bucket: "clean-design-system", url: "https://linear.app" },
  { slug: "vercel", bucket: "clean-design-system", url: "https://vercel.com" },
];
