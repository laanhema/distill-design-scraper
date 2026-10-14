/**
 * The eval corpus: reference pages, each with a hand-authored `expected.yaml`.
 * A `fixture` entry's capture is committed, so `npm run eval` runs offline in
 * CI; a `url` entry is captured on demand and its capture is git-ignored.
 */

interface CorpusEntryBase {
  slug: string;
  bucket:
    | "clean-design-system"
    | "content-heavy"
    | "dark-mode"
    | "css-variable"
    | "gradient-hero"
    | "hostile";
  /** If true, missing capture.json / expected.yaml is logged as a skip rather than failing the run. */
  optional?: boolean;
}

/** An entry with neither source does not compile; with both, capture uses the fixture. */
export type CorpusEntry =
  | (CorpusEntryBase & {
      fixture: string;
    })
  | (CorpusEntryBase & {
      url: string;
    });

export const CORPUS: CorpusEntry[] = [
  // Committed, offline fixtures — the regression floor for CI.
  { slug: "clean-light", bucket: "clean-design-system", fixture: "clean-light.html" },
  { slug: "dark-mode", bucket: "dark-mode", fixture: "dark-mode.html" },
  { slug: "adversarial-shell", bucket: "hostile", fixture: "adversarial-shell.html" },
  { slug: "saas-landing", bucket: "css-variable", fixture: "saas-landing.html" },

  // Live references — capture + author expected.yaml to bring these online.
  { slug: "stripe", bucket: "clean-design-system", url: "https://stripe.com", optional: true },
  { slug: "linear", bucket: "clean-design-system", url: "https://linear.app", optional: true },
  { slug: "vercel", bucket: "clean-design-system", url: "https://vercel.com", optional: true },
];
