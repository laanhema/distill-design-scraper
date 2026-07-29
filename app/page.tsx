"use client";

import { useState } from "react";
import type { Report, StructureReport } from "@/lib/schema";
import { emitTailwindTheme } from "@/lib/emit";

interface Meta {
  finalUrl: string;
  title: string;
  elapsedMs: number;
  bannerDismissed: boolean;
  capturedAt: string;
  viewportShot: string;
  /** Every source image, in submitted order (image mode only, §P6-1). */
  viewportShots?: string[];
  aiApplied: boolean;
}

interface Refinement {
  hex: string;
  from: string;
  to: string;
}

interface AnalyzeResponse {
  ok: boolean;
  report?: Report;
  markdown?: string;
  structureReport?: StructureReport;
  /** Set when structure was requested but couldn't be produced (image mode
   *  without an API key, or the vision model failed) — §P6-2 step 2. */
  structureUnavailableReason?: string;
  meta?: Meta;
  refinements?: Refinement[];
  error?: string;
}

type Status = "idle" | "loading" | "done" | "error";
type InputMode = "url" | "image";

/** A selected file and its data-URL preview, kept in one entry so the pairing
 *  can never drift — previews used to live in a separate array appended in
 *  `FileReader.onload` completion order, which mismatched indexes (#23). */
interface SelectedImage {
  file: File;
  preview: string;
}

const MAX_IMAGES = 6;

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

/** Shared Blob → object URL → anchor → click → revoke sequence for the two
 *  workbench download actions, so a future fix to this plumbing can't land
 *  in one handler and silently miss the other (#101). */
function downloadBlob(content: string, mimeType: string, filename: string): void {
  const blob = new Blob([content], { type: mimeType });
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(href);
}

export default function Home() {
  const [inputMode, setInputMode] = useState<InputMode>("url");
  const [url, setUrl] = useState("");
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [markdown, setMarkdown] = useState<string>("");
  const [structureReport, setStructureReport] = useState<StructureReport | null>(null);
  const [structureUnavailableReason, setStructureUnavailableReason] = useState<string | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [refinements, setRefinements] = useState<Refinement[]>([]);
  const [tab, setTab] = useState<"preview" | "tokens" | "structure">("preview");
  const [copied, setCopied] = useState(false);

  async function handleFilesSelect(files: File[]) {
    const room = MAX_IMAGES - images.length;
    if (room <= 0) return;
    const accepted = files.slice(0, room);
    // Read every file first, then append file+preview pairs together in
    // selection order — pairing is structural, so read-completion order
    // can't mismatch previews, names, and remove targets (#23). A file
    // whose read fails is skipped rather than guessed at.
    const results = await Promise.allSettled(
      accepted.map(async (file): Promise<SelectedImage> => ({
        file,
        preview: await readFileAsDataURL(file),
      })),
    );
    const pairs = results
      .filter((r): r is PromiseFulfilledResult<SelectedImage> => r.status === "fulfilled")
      .map((r) => r.value);
    if (pairs.length === 0) return;
    setImages((prev) => [...prev, ...pairs].slice(0, MAX_IMAGES));
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  async function analyze(e: React.FormEvent) {
    e.preventDefault();
    if (inputMode === "url" && !url.trim()) return;
    if (inputMode === "image" && images.length === 0) return;

    setStatus("loading");
    setError(null);
    setReport(null);
    setMarkdown("");
    setStructureReport(null);
    setStructureUnavailableReason(null);
    setMeta(null);
    setRefinements([]);

    try {
      const bodyData: Record<string, unknown> = { mode: "both" };
      if (inputMode === "url") {
        bodyData.url = url;
      } else {
        // Image mode's structure lane is vision-inferred rather than DOM-measured
        // (§P6-2 step 2) — the API reports back if it couldn't run (no key).
        bodyData.images = images.map(({ file, preview }, i) => ({
          data: preview,
          name: file.name || `uploaded-image-${i + 1}`,
        }));
      }

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData),
      });
      const data = (await res.json()) as AnalyzeResponse;
      if (!res.ok || !data.ok || !data.report) {
        throw new Error(data.error ?? `Request failed (${res.status}).`);
      }
      setReport(data.report);
      setMarkdown(data.markdown ?? "");
      setStructureReport(data.structureReport ?? null);
      // A new analysis may have no structure report — never leave the active
      // tab pointing at a pane that no longer exists (#23).
      if (!data.structureReport) {
        setTab((t) => (t === "structure" ? "preview" : t));
      }
      setStructureUnavailableReason(data.structureUnavailableReason ?? null);
      setMeta(data.meta ?? null);
      setRefinements(data.refinements ?? []);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
    }
  }

  async function copyActiveMarkdown() {
    const textToCopy = tab === "structure" ? (structureReport?.markdown ?? "") : markdown;
    await navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  /** Hostname derivation shared by both download handlers: prefer the
   *  analyzed URL's hostname, then the first uploaded image's basename,
   *  then the caller-supplied default — kept identical across both
   *  handlers so a hostname-sanitizing fix can't miss one of them (#101). */
  function deriveHost(defaultHost: string): string {
    let host = defaultHost;
    try {
      host = new URL(meta?.finalUrl ?? url).hostname.replace(/^www\./, "");
    } catch {
      if (inputMode === "image" && images[0]) {
        host = images[0].file.name.replace(/\.[^/.]+$/, "");
      }
    }
    return host;
  }

  function downloadActiveMarkdown() {
    const textToDownload = tab === "structure" ? (structureReport?.markdown ?? "") : markdown;
    const isStruct = tab === "structure";
    const host = deriveHost("report");
    downloadBlob(textToDownload, "text/markdown", `distill-${isStruct ? "structure-" : ""}${host}.md`);
  }

  function downloadTailwindTheme() {
    if (!report) return;
    const themeCss = emitTailwindTheme(report);
    const host = deriveHost("theme");
    downloadBlob(themeCss, "text/css", `distill-theme-${host}.css`);
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <header className="mb-10">
        <h1 className="text-4xl font-semibold tracking-tight">Distill</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Point it at a URL for a measured Design System &amp; Layout Structure report, or drop in
          image(s) for a Palette &amp; Mood report plus a vision-inferred layout skeleton.{" "}
          <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-xs font-medium dark:bg-neutral-800">
            {inputMode === "url"
              ? "Track A (Design System, measured) + Track B (Layout Structure, measured)"
              : "Palette & Mood (measured) + Layout Structure (inferred)"}
          </span>
        </p>
      </header>

      <div className="mb-4 flex gap-2 border-b border-neutral-200 pb-2 dark:border-neutral-800">
        <button
          type="button"
          onClick={() => setInputMode("url")}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${
            inputMode === "url"
              ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
              : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
          }`}
        >
          URL Input
        </button>
        <button
          type="button"
          onClick={() => setInputMode("image")}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${
            inputMode === "image"
              ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
              : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
          }`}
        >
          Image Input
        </button>
      </div>

      <form onSubmit={analyze} className="space-y-4">
        {inputMode === "url" ? (
          <div className="flex gap-3">
            <input
              type="url"
              inputMode="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://stripe.com"
              required
              className="flex-1 rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm outline-none focus:border-neutral-500 focus:ring-2 focus:ring-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:focus:ring-neutral-700"
            />
            <button
              type="submit"
              disabled={status === "loading"}
              className="rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              {status === "loading" ? "Analyzing…" : "Analyze"}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (e.dataTransfer.files?.length) {
                  handleFilesSelect(Array.from(e.dataTransfer.files));
                }
              }}
              className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-neutral-300 p-8 text-center transition hover:border-neutral-400 dark:border-neutral-700 dark:hover:border-neutral-600"
            >
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  if (e.target.files?.length) handleFilesSelect(Array.from(e.target.files));
                  e.target.value = "";
                }}
                className="hidden"
                id="image-input"
              />
              <label
                htmlFor="image-input"
                className="cursor-pointer text-sm font-medium text-neutral-700 dark:text-neutral-300"
              >
                {images.length > 0 ? (
                  <span>
                    {images.length} image{images.length > 1 ? "s" : ""} selected —{" "}
                    <span className="underline">add more</span>
                  </span>
                ) : (
                  <span>Drag &amp; drop image(s) here, or <span className="underline">browse</span></span>
                )}
              </label>
            </div>
            {images.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {images.map((img, i) => (
                  <div key={i} className="group relative h-16 w-16 overflow-hidden rounded-md border border-neutral-200 dark:border-neutral-800">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.preview} alt={img.file.name || `image ${i + 1}`} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center bg-black/60 text-xs text-white opacity-0 transition group-hover:opacity-100"
                      aria-label={`Remove image ${i + 1}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-neutral-500">
              Multiple images of the same site/design merge into one palette (up to {MAX_IMAGES}).
              Layout structure from an image is vision-inferred, not measured (no DOM to walk) —
              it&apos;s stamped <code>fidelity: inferred</code> and requires an API key.
            </p>
            <button
              type="submit"
              disabled={status === "loading" || images.length === 0}
              className="self-end rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
            >
              {status === "loading" ? "Analyzing…" : `Analyze Image${images.length > 1 ? "s" : ""}`}
            </button>
          </div>
        )}
      </form>

      {status === "loading" && (
        <p className="mt-6 animate-pulse text-sm text-neutral-500">
          {inputMode === "url"
            ? "Rendering, measuring palette, typography, layout tokens & harvesting structure…"
            : "Processing image pixels & measuring color palette & mood…"}
        </p>
      )}

      {status === "error" && error && (
        <div className="mt-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <strong className="font-medium">Couldn&apos;t analyze this input.</strong>{" "}
          {error}
        </div>
      )}

      {status === "done" && report && meta && structureUnavailableReason && (
        <p className="mt-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          {structureUnavailableReason}
        </p>
      )}

      {status === "done" && report && meta && (
        <section className="mt-10 space-y-8">
          <div className="flex items-center gap-2 border-b border-neutral-200 pb-2 dark:border-neutral-800">
            <Tab active={tab === "preview"} onClick={() => setTab("preview")}>
              Design System Preview
            </Tab>
            <Tab active={tab === "tokens"} onClick={() => setTab("tokens")}>
              Design System Markdown
            </Tab>
            {structureReport && (
              <Tab active={tab === "structure"} onClick={() => setTab("structure")}>
                Layout Structure Markdown
                {structureReport.header.fidelity === "inferred" ? " (inferred)" : ""}
              </Tab>
            )}
            <div className="ml-auto flex gap-2">
              <button
                onClick={copyActiveMarkdown}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
              >
                {copied
                  ? "Copied ✓"
                  : tab === "structure"
                    ? "Copy Structure .md"
                    : "Copy Design System .md"}
              </button>
              <button
                onClick={downloadActiveMarkdown}
                className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
              >
                {tab === "structure" ? "Download Structure .md" : "Download Design System .md"}
              </button>
              <button
                onClick={downloadTailwindTheme}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
              >
                Download Tailwind @theme
              </button>
            </div>
          </div>

          {tab === "preview" && (
            <Preview report={report} meta={meta} refinements={refinements} />
          )}

          {tab === "tokens" && (
            <pre className="overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-xs leading-relaxed dark:border-neutral-800 dark:bg-neutral-900">
              <code>{markdown}</code>
            </pre>
          )}

          {tab === "structure" && structureReport && (
            <pre className="overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-xs leading-relaxed dark:border-neutral-800 dark:bg-neutral-900">
              <code>{structureReport.markdown}</code>
            </pre>
          )}
        </section>
      )}
    </main>
  );
}

function Preview({
  report,
  meta,
  refinements,
}: {
  report: Report;
  meta: Meta;
  refinements: Refinement[];
}) {
  return (
    <div className="space-y-10">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <Meta label="Source" value={report.source.ref} />
        <Meta label="Report Kind" value={report.reportKind} />
        <Meta label="Render time" value={`${meta.elapsedMs} ms`} />
        <Meta
          label="AI lane"
          value={meta.aiApplied ? "applied" : "skipped (no key)"}
        />
      </dl>

      {!meta.aiApplied && (
        <p className="rounded-md border border-neutral-200 bg-neutral-50 px-3.5 py-2 text-xs text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900/50 dark:text-neutral-400">
          💡 <strong>Setup Hint:</strong> Set <code className="font-mono text-neutral-800 dark:text-neutral-200">GEMINI_API_KEY</code> in <code className="font-mono text-neutral-800 dark:text-neutral-200">.env.local</code> to enable optional AI vision enrichment (§7). Get a free key at{" "}
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-neutral-900 dark:hover:text-neutral-200"
          >
            aistudio.google.com/apikey
          </a>.
        </p>
      )}

      <section>
        <SectionTitle provenance={report.palette.provenance}>Palette</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {report.palette.colors.map((c) => (
            <div
              key={c.role}
              className="overflow-hidden rounded-lg border border-neutral-200 dark:border-neutral-800"
            >
              <div className="h-16 w-full" style={{ backgroundColor: c.hex }} />
              <div className="px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{c.role}</span>
                  {c.imageSourced && (
                    <span className="text-[10px] text-neutral-400">img</span>
                  )}
                </div>
                <div className="font-mono text-xs text-neutral-500">{c.hex}</div>
                <div className="text-[11px] text-neutral-400">
                  {c.usage} · {Math.round(c.areaWeight * 100)}%
                </div>
              </div>
            </div>
          ))}
        </div>
        {report.palette.contrast.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {report.palette.contrast.map((p) => (
              <span
                key={p.pair.join("-")}
                className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs dark:border-neutral-800"
              >
                {p.pair[0]}/{p.pair[1]}: {p.ratio}:1{" "}
                <strong
                  className={
                    p.wcag === "fail"
                      ? "text-red-600 dark:text-red-400"
                      : "text-green-700 dark:text-green-400"
                  }
                >
                  {p.wcag}
                </strong>
              </span>
            ))}
          </div>
        )}
        {refinements.length > 0 && (
          <p className="mt-3 text-xs text-neutral-500">
            AI relabelled{" "}
            {refinements
              .map((r) => `${r.hex} ${r.from}→${r.to}`)
              .join(", ")}
            .
          </p>
        )}
      </section>

      {report.typography && (
        <section>
          <SectionTitle provenance={report.typography.provenance}>
            Typography
          </SectionTitle>
          <div className="mb-4 flex flex-wrap gap-2 text-xs">
            {report.typography.families.map((f) => (
              <span
                key={f.name}
                className="rounded-md bg-neutral-100 px-2.5 py-1 dark:bg-neutral-800"
              >
                <strong>{f.name}</strong> · {f.role} · {f.classification}
              </span>
            ))}
          </div>
          <div className="space-y-1.5">
            {report.typography.scale.map((s) => (
              <div key={s.token} className="flex items-baseline gap-4">
                <span className="w-16 shrink-0 font-mono text-xs text-neutral-400">
                  {s.token}
                </span>
                <span
                  className="truncate"
                  style={{
                    fontSize: `${Math.min(s.sizePx, 40)}px`,
                    fontWeight: s.weight,
                    lineHeight: 1.1,
                  }}
                  title={`${s.sizePx}px / ${s.weight} / lh ${s.lineHeight} / ls ${s.letterSpacing}`}
                >
                  {s.sizePx}px · {s.weight}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {report.spacing && (
        <section>
          <SectionTitle provenance={report.spacing.provenance}>
            Spacing
          </SectionTitle>
          <p className="mb-2 text-xs text-neutral-500">
            Base unit: <strong className="font-mono">{report.spacing.baseUnitPx}px</strong>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {report.spacing.scale.map((px) => (
              <div
                key={px}
                className="flex items-center gap-2 rounded-md border border-neutral-200 px-3 py-1.5 text-xs dark:border-neutral-800"
              >
                <div
                  className="bg-neutral-800 dark:bg-neutral-200"
                  style={{ width: `${Math.min(px, 32)}px`, height: "8px" }}
                />
                <span className="font-mono">{px}px</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {report.radius && (
        <section>
          <SectionTitle provenance={report.radius.provenance}>
            Radius
          </SectionTitle>
          <div className="flex flex-wrap items-center gap-3">
            {report.radius.scale.map((rad) => (
              <div
                key={rad}
                className="flex h-12 w-12 items-center justify-center border-2 border-neutral-800 bg-neutral-100 text-[10px] font-mono dark:border-neutral-200 dark:bg-neutral-800"
                style={{ borderRadius: rad }}
              >
                {rad}
              </div>
            ))}
          </div>
        </section>
      )}

      {report.elevation && report.elevation.shadows.length > 0 && (
        <section>
          <SectionTitle provenance={report.elevation.provenance}>
            Elevation
          </SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            {report.elevation.shadows.map((sh) => (
              <div
                key={sh.name}
                className="rounded-lg bg-white p-4 text-xs font-mono text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400"
                style={{ boxShadow: sh.value }}
              >
                <span className="font-semibold">{sh.name}</span> {sh.value}
              </div>
            ))}
          </div>
        </section>
      )}

      {report.identity && (
        <section>
          <SectionTitle provenance={report.identity.provenance}>
            Identity
          </SectionTitle>
          <p className="text-sm font-medium">{report.identity.archetype}</p>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
            {report.identity.description}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {report.identity.adjectives.map((a) => (
              <span
                key={a}
                className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs dark:bg-neutral-800"
              >
                {a}
              </span>
            ))}
          </div>
        </section>
      )}

      {report.imageMood && (
        <section>
          <SectionTitle provenance={report.imageMood.provenance}>
            Image mood
          </SectionTitle>
          <div className="grid gap-6 sm:grid-cols-2">
            <MoodList label="Hero" queries={report.imageMood.hero} />
            <MoodList label="Texture" queries={report.imageMood.texture} />
          </div>
        </section>
      )}

      {meta.viewportShots && meta.viewportShots.length > 1 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {meta.viewportShots.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={src}
              alt={`Source image ${i + 1} of ${meta.finalUrl}`}
              className="w-full rounded-lg border border-neutral-200 shadow-sm dark:border-neutral-800"
            />
          ))}
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={meta.viewportShot}
          alt={`Screenshot of ${meta.finalUrl}`}
          className="w-full rounded-lg border border-neutral-200 shadow-sm dark:border-neutral-800"
        />
      )}
    </div>
  );
}

function SectionTitle({
  children,
  provenance,
}: {
  children: React.ReactNode;
  provenance: string;
}) {
  return (
    <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
      {children}
      <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
        {provenance}
      </span>
    </h2>
  );
}

function MoodList({ label, queries }: { label: string; queries: string[] }) {
  return (
    <div>
      <div className="mb-2 text-xs uppercase tracking-wide text-neutral-500">
        {label}
      </div>
      <ul className="space-y-1.5">
        {queries.map((q) => (
          <li
            key={q}
            className="rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm dark:border-neutral-800"
          >
            {q}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs uppercase tracking-wide text-neutral-500">
        {label}
      </dt>
      <dd className="truncate font-medium" title={value}>
        {value}
      </dd>
    </div>
  );
}

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-md px-3 py-1.5 text-sm font-medium transition " +
        (active
          ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
          : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800")
      }
    >
      {children}
    </button>
  );
}
