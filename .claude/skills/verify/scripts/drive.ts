/**
 * Playwright driver for Distill's UI. Invoked through `verify.sh drive`, which
 * supplies APP_URL, FIXTURE_URL, EVIDENCE_DIR and AI_LANE from the running
 * instance. Each scenario drives the real page the way a user would, writes
 * evidence to EVIDENCE_DIR, and exits non-zero if any check fails.
 *
 *   analyze-url     [--target clean-light|dark-mode|adversarial-shell|<http url>]
 *   tabs-downloads  [--target …]
 *   analyze-images  [--fixtures clean-light,dark-mode,adversarial-shell] [--remove <n>]
 *   error           [--url http://10.0.0.1/]
 */
import { chromium, type Page } from "playwright";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const APP_URL = need("APP_URL");
const FIXTURE_URL = need("FIXTURE_URL");
const OUT = need("EVIDENCE_DIR");
const AI_ON = process.env.AI_LANE === "on";
const ANALYZE_TIMEOUT_MS = 180_000;

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set; run this through verify.sh drive`);
  return v;
}

function flag(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function targetUrl(target: string): string {
  return /^https?:\/\//.test(target) ? target : `${FIXTURE_URL}/${target}.html`;
}

interface Check {
  label: string;
  ok: boolean;
  detail?: string;
}

const checks: Check[] = [];
let shotIndex = 0;

function check(label: string, ok: boolean, detail?: string): void {
  checks.push({ label, ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
}

async function shot(page: Page, name: string): Promise<void> {
  const file = `${String(shotIndex++).padStart(2, "0")}-${name}`;
  await page.screenshot({ path: join(OUT, `${file}.png`), fullPage: true });
  writeFileSync(join(OUT, `${file}.aria.yaml`), await page.locator("main").ariaSnapshot());
}

/** Response JSON minus the base64 screenshots, which would bloat the evidence. */
function slim(body: Record<string, unknown>): Record<string, unknown> {
  const meta = (body.meta ?? {}) as Record<string, unknown>;
  const shots = (meta.viewportShots as string[] | undefined) ?? [];
  return {
    ...body,
    meta: { ...meta, viewportShot: "<omitted>", viewportShots: shots.map((s) => `<${s.length} chars>`) },
  };
}

interface Analysis {
  status: number;
  body: Record<string, unknown>;
}

/** Submits the form and waits for the API round-trip plus the UI's settled state. */
async function submitAndWait(page: Page, buttonName: RegExp): Promise<Analysis> {
  const responsePromise = page.waitForResponse(
    (r) => r.url().endsWith("/api/analyze") && r.request().method() === "POST",
    { timeout: ANALYZE_TIMEOUT_MS },
  );
  await page.getByRole("button", { name: buttonName }).click();
  const analyzing = page.getByRole("button", { name: "Analyzing…" });
  check("submit shows the Analyzing… state", await analyzing.isVisible().catch(() => false));
  await shot(page, "loading");

  const response = await responsePromise;
  const body = (await response.json()) as Record<string, unknown>;
  writeFileSync(join(OUT, "response.json"), JSON.stringify(slim(body), null, 2));
  if (typeof body.markdown === "string") writeFileSync(join(OUT, "report.md"), body.markdown);
  const structure = body.structureReport as { markdown?: string } | null;
  if (structure?.markdown) writeFileSync(join(OUT, "structure.md"), structure.markdown);

  await page
    .getByRole("button", { name: "Design System Preview" })
    .or(page.getByText("Couldn't analyze this input."))
    .first()
    .waitFor({ timeout: 30_000 });
  return { status: response.status(), body };
}

async function analyzeUrl(page: Page, url: string): Promise<Analysis> {
  await page.goto(APP_URL);
  await page.getByRole("heading", { name: "Distill", level: 1 }).waitFor();
  await page.getByRole("button", { name: "URL Input" }).click();
  await page.getByPlaceholder("https://stripe.com").fill(url);
  await shot(page, "url-entered");
  return submitAndWait(page, /^Analyze$/);
}

function checkDesignReport(page: Page, a: Analysis, url: string): Promise<void>[] {
  const report = a.body.report as { reportKind?: string; source?: { ref?: string } } | undefined;
  check("API answered 200 ok", a.status === 200 && a.body.ok === true, `status ${a.status}`);
  check("reportKind is design-system", report?.reportKind === "design-system", report?.reportKind);
  check("report.source.ref is the submitted URL", report?.source?.ref?.startsWith(url) ?? false, report?.source?.ref);
  check("markdown starts with YAML frontmatter", String(a.body.markdown ?? "").startsWith("---\n"));
  check("structureReport present in both mode", Boolean(a.body.structureReport));
  return [
    page.getByRole("button", { name: "Layout Structure Markdown" }).isVisible()
      .then((v) => check("Layout Structure Markdown tab is shown", v)),
    page.getByRole("heading", { name: /^Palette/ }).first().isVisible()
      .then((v) => check("Preview renders the Palette section", v)),
    page.getByText(AI_ON ? "applied" : "skipped (no key)", { exact: true }).isVisible()
      .then((v) => check(`AI lane meta reads ${AI_ON ? "applied" : "skipped (no key)"}`, v)),
  ];
}

async function scenarioAnalyzeUrl(page: Page): Promise<void> {
  const url = targetUrl(flag("target", "clean-light"));
  const a = await analyzeUrl(page, url);
  await Promise.all(checkDesignReport(page, a, url));
  await shot(page, "result-preview");
}

async function scenarioTabsDownloads(page: Page): Promise<void> {
  const url = targetUrl(flag("target", "clean-light"));
  const a = await analyzeUrl(page, url);
  await Promise.all(checkDesignReport(page, a, url));
  const host = new URL(url).hostname.replace(/^www\./, "");
  const structureMd = (a.body.structureReport as { markdown?: string } | null)?.markdown ?? "";

  const download = async (buttonName: string, expectedName: string): Promise<string> => {
    const pending = page.waitForEvent("download");
    await page.getByRole("button", { name: buttonName }).click();
    const d = await pending;
    const path = join(OUT, "downloads", d.suggestedFilename());
    await d.saveAs(path);
    check(`"${buttonName}" saves ${expectedName}`, d.suggestedFilename() === expectedName, d.suggestedFilename());
    return readFileSync(path, "utf8");
  };

  await page.getByRole("button", { name: "Design System Markdown" }).click();
  await shot(page, "tab-tokens");
  check("tokens tab shows the design markdown", (await page.locator("pre code").innerText()).trim() === String(a.body.markdown).trim());
  const designMd = await download("Download Design System .md", `distill-${host}.md`);
  check("downloaded design .md equals API markdown", designMd === a.body.markdown);

  await page.getByRole("button", { name: "Layout Structure Markdown" }).click();
  await shot(page, "tab-structure");
  check("structure tab shows the structure markdown", (await page.locator("pre code").innerText()).trim() === structureMd.trim());
  const layoutMd = await download("Download Layout Structure .md", `distill-structure-${host}.md`);
  check("downloaded structure .md equals API structureReport.markdown", layoutMd === structureMd);

  const theme = await download("Download Tailwind @theme", `distill-theme-${host}.css`);
  check("Tailwind theme contains an @theme block", theme.includes("@theme {"));

  await page.getByRole("button", { name: "Design System Preview" }).click();
  await shot(page, "tab-preview");
  check("download label reverts on preview tab", await page.getByRole("button", { name: "Download Design System .md" }).isVisible());
}

async function scenarioAnalyzeImages(page: Page, browser: Awaited<ReturnType<typeof chromium.launch>>): Promise<void> {
  const fixtures = flag("fixtures", "clean-light,dark-mode,adversarial-shell").split(",");
  const remove = Number(flag("remove", fixtures.length > 1 ? String(fixtures.length) : "0"));

  // Upload inputs: real screenshots of the fixture pages, like a user would drop in.
  const shooter = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const files: string[] = [];
  for (const f of fixtures) {
    await shooter.goto(targetUrl(f));
    const file = join(OUT, "inputs", `${f}.png`);
    await shooter.screenshot({ path: file });
    files.push(file);
  }
  await shooter.close();

  await page.goto(APP_URL);
  await page.getByRole("button", { name: "Image Input" }).click();
  await page.locator("#image-input").setInputFiles(files);
  const plural = (n: number) => `${n} image${n > 1 ? "s" : ""} selected`;
  check(`label reads "${plural(files.length)}"`, await page.getByText(plural(files.length)).isVisible());
  for (const f of fixtures) {
    check(`thumbnail for ${f}.png shown`, await page.getByRole("img", { name: `${f}.png` }).isVisible());
  }
  await shot(page, "images-selected");

  let kept = fixtures;
  if (remove > 0) {
    const thumb = page.getByRole("img", { name: `${fixtures[remove - 1]}.png` });
    await thumb.hover();
    await page.getByRole("button", { name: `Remove image ${remove}` }).click();
    kept = fixtures.filter((_, i) => i !== remove - 1);
    check(`after removing image ${remove}, label reads "${plural(kept.length)}"`, await page.getByText(plural(kept.length)).isVisible());
    check(`${fixtures[remove - 1]}.png thumbnail is gone`, (await thumb.count()) === 0);
    await shot(page, "image-removed");
  }

  const a = await submitAndWait(page, /^Analyze Images?$/);
  const report = a.body.report as { reportKind?: string } | undefined;
  const shots = ((a.body.meta as Record<string, unknown>)?.viewportShots as string[] | undefined) ?? [];
  check("API answered 200 ok", a.status === 200 && a.body.ok === true, `status ${a.status}`);
  check("reportKind is palette-mood", report?.reportKind === "palette-mood", report?.reportKind);
  check(`viewportShots has one entry per kept image (${kept.length})`, shots.length === kept.length, String(shots.length));
  check("Preview renders the Palette section", await page.getByRole("heading", { name: /^Palette/ }).first().isVisible());
  if (AI_ON) {
    check("inferred structure tab is shown", await page.getByRole("button", { name: "Layout Structure Markdown (inferred)" }).isVisible());
  } else {
    const reason = String(a.body.structureUnavailableReason ?? "");
    check("structureUnavailableReason returned without a key", reason.length > 0, reason);
    check("structure-unavailable banner is shown", reason.length > 0 && (await page.getByText(reason).isVisible()));
    check("no structure tab without a key", !(await page.getByRole("button", { name: /Layout Structure Markdown/ }).isVisible()));
  }
  await shot(page, "result-preview");
}

async function scenarioError(page: Page): Promise<void> {
  const url = flag("url", "http://10.0.0.1/");
  const a = await analyzeUrl(page, url);
  const message = String(a.body.error ?? "");
  check("API answered 400", a.status === 400, `status ${a.status}`);
  check("error banner is shown", await page.getByText("Couldn't analyze this input.").isVisible());
  check("banner carries the API message", message.length > 0 && (await page.getByText(message).isVisible()), message);
  check("no result tabs rendered", !(await page.getByRole("button", { name: "Design System Preview" }).isVisible()));
  await shot(page, "error");
}

async function main(): Promise<void> {
  const scenario = process.argv[2];
  for (const dir of ["", "downloads", "inputs"]) mkdirSync(join(OUT, dir), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => consoleErrors.push(String(e)));

  try {
    switch (scenario) {
      case "analyze-url": await scenarioAnalyzeUrl(page); break;
      case "tabs-downloads": await scenarioTabsDownloads(page); break;
      case "analyze-images": await scenarioAnalyzeImages(page, browser); break;
      case "error": await scenarioError(page); break;
      default: throw new Error(`unknown scenario "${scenario}"`);
    }
  } catch (err) {
    check("scenario ran to completion", false, err instanceof Error ? err.message : String(err));
    await page.screenshot({ path: join(OUT, "failure.png"), fullPage: true }).catch(() => {});
  } finally {
    writeFileSync(join(OUT, "console-errors.txt"), consoleErrors.join("\n"));
    writeFileSync(join(OUT, "checks.json"), JSON.stringify({ scenario, argv: process.argv.slice(3), checks }, null, 2));
    await browser.close();
  }
  const failed = checks.filter((c) => !c.ok).length;
  console.log(`\n${failed ? `${failed} check(s) failed` : "all checks passed"} — evidence: ${OUT}`);
  process.exit(failed ? 1 : 0);
}

void main();
