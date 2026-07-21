"use client";

import { useState } from "react";
import type { Report } from "@/lib/schema";

interface Meta {
  finalUrl: string;
  title: string;
  elapsedMs: number;
  bannerDismissed: boolean;
  capturedAt: string;
  viewportShot: string;
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
  meta?: Meta;
  refinements?: Refinement[];
  error?: string;
}

type Status = "idle" | "loading" | "done" | "error";

export default function Home() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [markdown, setMarkdown] = useState<string>("");
  const [meta, setMeta] = useState<Meta | null>(null);
  const [refinements, setRefinements] = useState<Refinement[]>([]);
  const [tab, setTab] = useState<"preview" | "markdown">("preview");
  const [copied, setCopied] = useState(false);

  async function analyze(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;

    setStatus("loading");
    setError(null);
    setReport(null);
    setMarkdown("");
    setMeta(null);
    setRefinements([]);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json()) as AnalyzeResponse;
      if (!res.ok || !data.ok || !data.report) {
        throw new Error(data.error ?? `Request failed (${res.status}).`);
      }
      setReport(data.report);
      setMarkdown(data.markdown ?? "");
      setMeta(data.meta ?? null);
      setRefinements(data.refinements ?? []);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setStatus("error");
    }
  }

  async function copyMarkdown() {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function downloadMarkdown() {
    const blob = new Blob([markdown], { type: "text/markdown" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    let host = "report";
    try {
      host = new URL(meta?.finalUrl ?? url).hostname.replace(/^www\./, "");
    } catch {
      /* keep default */
    }
    a.href = href;
    a.download = `distill-${host}.md`;
    a.click();
    URL.revokeObjectURL(href);
  }

  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <header className="mb-10">
        <h1 className="text-4xl font-semibold tracking-tight">Distill</h1>
        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
          Point it at a URL → a Markdown design system.{" "}
          <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-xs font-medium dark:bg-neutral-800">
            Phase 2 · measured tokens + AI identity
          </span>
        </p>
      </header>

      <form onSubmit={analyze} className="flex gap-3">
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
      </form>

      {status === "loading" && (
        <p className="mt-6 animate-pulse text-sm text-neutral-500">
          Rendering, reading computed styles, measuring palette &amp; type…
        </p>
      )}

      {status === "error" && error && (
        <div className="mt-6 rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          <strong className="font-medium">Couldn&apos;t analyze this page.</strong>{" "}
          {error}
        </div>
      )}

      {status === "done" && report && meta && (
        <section className="mt-10 space-y-8">
          <div className="flex items-center gap-2 border-b border-neutral-200 pb-2 dark:border-neutral-800">
            <Tab active={tab === "preview"} onClick={() => setTab("preview")}>
              Preview
            </Tab>
            <Tab active={tab === "markdown"} onClick={() => setTab("markdown")}>
              Markdown
            </Tab>
            <div className="ml-auto flex gap-2">
              <button
                onClick={copyMarkdown}
                className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
              >
                {copied ? "Copied ✓" : "Copy .md"}
              </button>
              <button
                onClick={downloadMarkdown}
                className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
              >
                Download .md
              </button>
            </div>
          </div>

          {tab === "preview" ? (
            <Preview report={report} meta={meta} refinements={refinements} />
          ) : (
            <pre className="overflow-x-auto rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-xs leading-relaxed dark:border-neutral-800 dark:bg-neutral-900">
              <code>{markdown}</code>
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
        <Meta label="Title" value={report.source.ref} />
        <Meta label="Final URL" value={meta.finalUrl} />
        <Meta label="Render time" value={`${meta.elapsedMs} ms`} />
        <Meta
          label="AI lane"
          value={meta.aiApplied ? "applied" : "skipped (no key)"}
        />
      </dl>

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

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={meta.viewportShot}
        alt={`Screenshot of ${meta.finalUrl}`}
        className="w-full rounded-lg border border-neutral-200 shadow-sm dark:border-neutral-800"
      />
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
