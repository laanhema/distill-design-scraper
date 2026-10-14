"use client";

import { useState } from "react";
import type { Report } from "@/lib/schema";
import { emitTailwindTheme } from "@/lib/emitTailwind";
import {
  MAX_IMAGES,
  isAnalyzeResponse,
  type AiOutcome,
  type AnalyzeMeta,
  type AnalyzeSuccess,
  type RefinementChange,
} from "@/lib/api";

type AnalysisState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "done"; result: AnalyzeSuccess; sourceName: string; sourceImages: string[] };
type InputMode = "url" | "image";

/** A selected file and its data-URL preview, kept in one entry so the pairing
 *  can never drift. */
interface SelectedImage {
  file: File;
  preview: string;
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      // `readAsDataURL` always leaves a string in `result`; the check proves
      // to the compiler what a cast would only claim.
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error(`Failed to read ${file.name}`));
    };
    reader.onerror = () => reject(reader.error ?? new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

/** Derived from the analyzed result's source name, never the live form. */
function deriveHost(sourceName: string, defaultHost: string): string {
  let host = defaultHost;
  try {
    host = new URL(sourceName).hostname.replace(/^www\./, "");
  } catch {
    const cleaned = sourceName.replace(/\.[^/.]+$/, "").trim();
    if (cleaned) {
      host = cleaned;
    }
  }
  return host || defaultHost;
}

/** Shared by both download actions, so a fix can't land in only one. */
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
  const [state, setState] = useState<AnalysisState>({ status: "idle" });
  const [tab, setTab] = useState<"preview" | "tokens" | "structure">("preview");

  async function handleFilesSelect(files: File[]) {
    const room = MAX_IMAGES - images.length;
    if (room <= 0) return;
    const accepted = files.slice(0, room);
    // Read every file first, then append the pairs in selection order, so
    // read-completion order can't mismatch them. A failed read is skipped.
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

    // The selection as it stands at submit: the result is built from this
    // snapshot, never from the live form, which can change while the request
    // is in flight or after it settles.
    const submittedImages = images;
    setState({ status: "loading" });

    try {
      const bodyData: Record<string, unknown> = { mode: "both" };
      if (inputMode === "url") {
        bodyData.url = url;
      } else {
        // Image mode's structure lane is vision-inferred rather than
        // DOM-measured — the API reports back if it couldn't run (no key).
        bodyData.images = submittedImages.map(({ file, preview }, i) => ({
          data: preview,
          name: file.name || `uploaded-image-${i + 1}`,
        }));
      }

      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyData),
      });
      let raw: unknown;
      try {
        raw = await res.json();
      } catch {
        throw new Error(
          `Analysis failed (${res.status}): server returned an unexpected non-JSON response.`,
        );
      }

      if (!isAnalyzeResponse(raw)) {
        throw new Error(`Analysis failed (${res.status}): unexpected response structure.`);
      }

      const data = raw;
      if (!res.ok || !data.ok) {
        throw new Error(!data.ok ? data.error : `Request failed (${res.status}).`);
      }

      // A new analysis may have no structure report — never leave the active
      // tab pointing at a pane that no longer exists.
      if (!data.structureReport) {
        setTab((t) => (t === "structure" ? "preview" : t));
      }

      const sourceName =
        data.report.source.type === "url"
          ? (data.meta.finalUrl || url)
          : (submittedImages[0]?.file.name || data.report.source.ref || "image");

      // A URL response carries its screenshots. An image response carries
      // none, so the preview shows the uploads this request was built from.
      const sourceImages =
        data.report.source.type === "url"
          ? (data.meta.viewportShots ?? [])
          : submittedImages.map((img) => img.preview);

      setState({
        status: "done",
        result: data,
        sourceName,
        sourceImages,
      });
    } catch (err) {
      setState({
        status: "error",
        message: err instanceof Error ? err.message : "Something went wrong.",
      });
    }
  }

  function downloadActiveMarkdown() {
    if (state.status !== "done") return;
    const { result, sourceName } = state;
    const textToDownload = tab === "structure" ? (result.structureReport?.markdown ?? "") : result.markdown;
    const isStruct = tab === "structure";
    const host = deriveHost(sourceName, "report");
    downloadBlob(textToDownload, "text/markdown", `distill-${isStruct ? "structure-" : ""}${host}.md`);
  }

  function downloadTailwindTheme() {
    if (state.status !== "done") return;
    const themeCss = emitTailwindTheme(state.result.report);
    const host = deriveHost(state.sourceName, "theme");
    downloadBlob(themeCss, "text/css", `distill-theme-${host}.css`);
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <header className="mb-10">
        <h1 className="text-4xl font-semibold tracking-tight">Distill</h1>
        <p className="mt-2 text-ink-muted">
          Point it at a URL for a measured Design System &amp; Layout Structure report, or drop in
          image(s) for a Palette &amp; Mood report plus a vision-inferred layout skeleton.{" "}
          <span className="rounded bg-fill-strong px-1.5 py-0.5 text-xs font-medium">
            {inputMode === "url"
              ? "Track A (Design System, measured) + Track B (Layout Structure, measured)"
              : "Palette & Mood (measured) + Layout Structure (inferred)"}
          </span>
        </p>
      </header>

      <div className="mb-4 flex gap-2 border-b border-line pb-2">
        <button
          type="button"
          onClick={() => setInputMode("url")}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${
            inputMode === "url"
              ? "bg-action text-on-action"
              : "text-ink-muted hover:bg-fill"
          }`}
        >
          URL Input
        </button>
        <button
          type="button"
          onClick={() => setInputMode("image")}
          className={`px-3 py-1.5 text-sm font-medium rounded-md transition ${
            inputMode === "image"
              ? "bg-action text-on-action"
              : "text-ink-muted hover:bg-fill"
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
              className="flex-1 rounded-lg border border-line-strong bg-surface px-4 py-2.5 text-sm outline-none focus:border-line-focus focus:ring-2 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={state.status === "loading"}
              className="rounded-lg bg-action px-5 py-2.5 text-sm font-medium text-on-action transition hover:bg-action-hover disabled:opacity-50"
            >
              {state.status === "loading" ? "Analyzing…" : "Analyze"}
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
              className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-line-strong p-8 text-center transition hover:border-line-hover"
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
                className="cursor-pointer text-sm font-medium text-ink-soft"
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
                  <div key={i} className="group relative h-16 w-16 overflow-hidden rounded-md border border-line">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img.preview} alt={img.file.name || `image ${i + 1}`} className="h-full w-full object-cover" />
                    <button
                      type="button"
                      onClick={() => removeImage(i)}
                      className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center bg-scrim text-xs text-white opacity-0 transition group-hover:opacity-100"
                      aria-label={`Remove image ${i + 1}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-ink-subtle">
              Multiple images of the same site/design merge into one palette (up to {MAX_IMAGES}).
              Layout structure from an image is vision-inferred, not measured (no DOM to walk) —
              it&apos;s stamped <code>fidelity: inferred</code> and requires an API key.
            </p>
            <button
              type="submit"
              disabled={state.status === "loading" || images.length === 0}
              className="self-end rounded-lg bg-action px-5 py-2.5 text-sm font-medium text-on-action transition hover:bg-action-hover disabled:opacity-50"
            >
              {state.status === "loading" ? "Analyzing…" : `Analyze Image${images.length > 1 ? "s" : ""}`}
            </button>
          </div>
        )}
      </form>

      {state.status === "loading" && (
        <p className="mt-6 animate-pulse text-sm text-ink-subtle">
          {inputMode === "url"
            ? "Rendering, measuring palette, typography, layout tokens & harvesting structure…"
            : "Processing image pixels & measuring color palette & mood…"}
        </p>
      )}

      {state.status === "error" && (
        <div className="mt-6 rounded-lg border border-danger-line bg-danger-bg px-4 py-3 text-sm text-danger-ink">
          <strong className="font-medium">Couldn&apos;t analyze this input.</strong>{" "}
          {state.message}
        </div>
      )}

      {state.status === "done" && state.result.structureUnavailableReason && (
        <p className="mt-6 rounded-lg border border-warning-line bg-warning-bg px-4 py-3 text-sm text-warning-ink">
          {state.result.structureUnavailableReason}
        </p>
      )}

      {state.status === "done" && (
        <section className="mt-10 space-y-8">
          <div className="flex flex-wrap items-center gap-2 border-b border-line pb-2">
            <Tab active={tab === "preview"} onClick={() => setTab("preview")}>
              Design System Preview
            </Tab>
            <Tab active={tab === "tokens"} onClick={() => setTab("tokens")}>
              Design System Markdown
            </Tab>
            {state.result.structureReport && (
              <Tab active={tab === "structure"} onClick={() => setTab("structure")}>
                Layout Structure Markdown
                {state.result.structureReport.header.fidelity === "inferred" ? " (inferred)" : ""}
              </Tab>
            )}
            <div className="ml-auto flex flex-wrap justify-end gap-2">
              {/* Both labels share one grid cell so the button keeps the longer one's width on every tab. */}
              <button
                onClick={downloadActiveMarkdown}
                className="grid whitespace-nowrap rounded-md bg-action px-3 py-1.5 text-xs font-medium text-on-action hover:bg-action-hover"
              >
                <span className={"col-start-1 row-start-1" + (tab === "structure" ? " invisible" : "")}>
                  Download Design System .md
                </span>
                <span className={"col-start-1 row-start-1" + (tab === "structure" ? "" : " invisible")}>
                  Download Layout Structure .md
                </span>
              </button>
              <button
                onClick={downloadTailwindTheme}
                className="whitespace-nowrap rounded-md border border-line-strong px-3 py-1.5 text-xs font-medium hover:bg-fill"
              >
                Download Tailwind @theme
              </button>
            </div>
          </div>

          {tab === "preview" && (
            <Preview
              report={state.result.report}
              meta={state.result.meta}
              refinements={state.result.refinements}
              sourceImages={state.sourceImages}
            />
          )}

          {tab === "tokens" && (
            <pre className="overflow-x-auto rounded-lg border border-line bg-surface-sunken p-4 text-xs leading-relaxed">
              <code>{state.result.markdown}</code>
            </pre>
          )}

          {tab === "structure" && state.result.structureReport && (
            <pre className="overflow-x-auto rounded-lg border border-line bg-surface-sunken p-4 text-xs leading-relaxed">
              <code>{state.result.structureReport.markdown}</code>
            </pre>
          )}
        </section>
      )}
    </main>
  );
}

const AI_LANE_LABELS: Record<AiOutcome, string> = {
  applied: "applied",
  "no-key": "skipped (no key)",
  failed: "failed",
  "not-requested": "skipped (not requested)",
};

function Preview({
  report,
  meta,
  refinements,
  sourceImages,
}: {
  report: Report;
  meta: AnalyzeMeta;
  refinements: RefinementChange[];
  /** URL: the response's `viewportShots`. Images: the uploads held at submit time. */
  sourceImages: string[];
}) {
  return (
    <div className="space-y-10">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
        <Meta label="Source" value={report.source.ref} />
        <Meta label="Report Kind" value={report.reportKind} />
        <Meta label="Render time" value={`${meta.elapsedMs} ms`} />
        <Meta
          label="AI lane"
          value={AI_LANE_LABELS[meta.aiOutcome]}
        />
      </dl>

      {meta.aiOutcome === "no-key" && (
        <p className="rounded-md border border-line bg-surface-sunken px-3.5 py-2 text-xs text-ink-muted">
          💡 <strong>Setup Hint:</strong> Set <code className="font-mono text-ink-code">OPENROUTER_API_KEY</code> in <code className="font-mono text-ink-code">.env.local</code> to enable optional AI vision enrichment (§7). Get an OpenRouter key at{" "}
          <a
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-ink"
          >
            openrouter.ai/keys
          </a>.
        </p>
      )}

      <section>
        <SectionTitle provenance={report.palette.provenance}>Palette</SectionTitle>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {report.palette.colors.map((c) => (
            <div
              key={c.role}
              className="overflow-hidden rounded-lg border border-line"
            >
              <div className="h-16 w-full" style={{ backgroundColor: c.hex }} />
              <div className="px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{c.role}</span>
                  {c.imageSourced && (
                    <span className="text-[10px] text-ink-faint">img</span>
                  )}
                </div>
                <div className="font-mono text-xs text-ink-subtle">{c.hex}</div>
                <div className="text-[11px] text-ink-faint">
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
                className="rounded-full border border-line px-2.5 py-1 text-xs"
              >
                {p.pair[0]}/{p.pair[1]}: {p.ratio}:1{" "}
                <strong
                  className={
                    p.wcag === "fail"
                      ? "text-fail-ink"
                      : "text-pass-ink"
                  }
                >
                  {p.wcag}
                </strong>
              </span>
            ))}
          </div>
        )}
        {refinements.length > 0 && (
          <p className="mt-3 text-xs text-ink-subtle">
            AI relabelled{" "}
            {refinements
              .map((r) => `${r.hex} ${r.from ? `${r.from}→` : "→"}${r.to}`)
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
                className="rounded-md bg-fill px-2.5 py-1"
              >
                <strong>{f.name}</strong> · {f.role} · {f.classification}
              </span>
            ))}
          </div>
          <div className="space-y-1.5">
            {report.typography.scale.map((s) => (
              <div key={s.token} className="flex items-baseline gap-4">
                <span className="w-16 shrink-0 font-mono text-xs text-ink-faint">
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
          <p className="mb-2 text-xs text-ink-subtle">
            Base unit: <strong className="font-mono">{report.spacing.baseUnitPx}px</strong>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {report.spacing.scale.map((px) => (
              <div
                key={px}
                className="flex items-center gap-2 rounded-md border border-line px-3 py-1.5 text-xs"
              >
                <div
                  className="bg-mark"
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
                className="flex h-12 w-12 items-center justify-center border-2 border-mark bg-fill text-[10px] font-mono"
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
                className="rounded-lg bg-surface p-4 text-xs font-mono text-ink-muted"
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
          <p className="mt-1 text-sm text-ink-muted">
            {report.identity.description}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {report.identity.adjectives.map((a) => (
              <span
                key={a}
                className="rounded-full bg-fill px-2.5 py-1 text-xs"
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

      {sourceImages.length > 1 ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {sourceImages.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={src}
              alt={`Source image ${i + 1} of ${meta.finalUrl}`}
              className="w-full rounded-lg border border-line shadow-sm"
            />
          ))}
        </div>
      ) : sourceImages.length === 1 ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={sourceImages[0]}
          alt={`Screenshot of ${meta.finalUrl}`}
          className="w-full rounded-lg border border-line shadow-sm"
        />
      ) : null}
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
      <span className="rounded bg-fill-strong px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-muted">
        {provenance}
      </span>
    </h2>
  );
}

function MoodList({ label, queries }: { label: string; queries: string[] }) {
  return (
    <div>
      <div className="mb-2 text-xs uppercase tracking-wide text-ink-subtle">
        {label}
      </div>
      <ul className="space-y-1.5">
        {queries.map((q) => (
          <li
            key={q}
            className="rounded-md border border-line px-2.5 py-1.5 text-sm"
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
      <dt className="text-xs uppercase tracking-wide text-ink-subtle">
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
        "whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition " +
        (active
          ? "bg-action text-on-action"
          : "text-ink-muted hover:bg-fill")
      }
    >
      {children}
    </button>
  );
}
