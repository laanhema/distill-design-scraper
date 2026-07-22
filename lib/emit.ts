import { dump as yamlDump } from "js-yaml";
import {
  reportSchema,
  type Elevation,
  type Identity,
  type ImageMood,
  type Palette,
  type Radius,
  type Report,
  type Spacing,
  type Typography,
} from "@/lib/schema";

/**
 * Emit (§3, §4 module 4): merge the measured lanes into the report schema,
 * validate with Zod, then serialize a single `.md` file — YAML frontmatter (the
 * machine-parseable contract) followed by a human-readable body *derived from
 * the same object*, so the two can never drift.
 */

export interface BuildReportInput {
  source: { type: "url" | "image"; ref: string; capturedAt: string };
  reportKind: Report["reportKind"];
  palette: Palette;
  typography?: Typography;
  spacing?: Spacing;
  radius?: Radius;
  elevation?: Elevation;
  identity?: Identity;
  imageMood?: ImageMood;
}

/** Assemble and validate the report object. Throws on schema violation. */
export function buildReport(input: BuildReportInput): Report {
  const candidate: Report = {
    reportKind: input.reportKind,
    source: input.source,
    palette: input.palette,
    ...(input.typography ? { typography: input.typography } : {}),
    ...(input.spacing ? { spacing: input.spacing } : {}),
    ...(input.radius ? { radius: input.radius } : {}),
    ...(input.elevation ? { elevation: input.elevation } : {}),
    ...(input.identity ? { identity: input.identity } : {}),
    ...(input.imageMood ? { imageMood: input.imageMood } : {}),
  };
  return reportSchema.parse(candidate);
}

/** Serialize a validated report to `.md` (frontmatter + body). */
export function renderMarkdown(report: Report): string {
  const frontmatter = yamlDump(report, {
    lineWidth: 100,
    noRefs: true,
    sortKeys: false,
  }).trimEnd();
  return `---\n${frontmatter}\n---\n\n${renderBody(report)}\n`;
}

function renderBody(report: Report): string {
  const parts: string[] = [];
  const title =
    report.reportKind === "design-system"
      ? "Design System"
      : "Palette & Mood";
  parts.push(`# ${title}`);

  parts.push(renderPalette(report.palette));
  if (report.typography) parts.push(renderTypography(report.typography));
  if (report.spacing) parts.push(renderSpacing(report.spacing));
  if (report.radius) parts.push(renderRadius(report.radius));
  if (report.elevation) parts.push(renderElevation(report.elevation));
  if (report.identity) parts.push(renderIdentity(report.identity));
  if (report.imageMood) parts.push(renderImageMood(report.imageMood));

  return parts.join("\n\n");
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/** Heading suffix for a lane's provenance, omitted when it's "measured". */
function provenanceSuffix(provenance: string): string {
  return provenance === "measured" ? "" : ` _(${provenance})_`;
}

function renderPalette(palette: Palette): string {
  const lines: string[] = [`## Palette${provenanceSuffix(palette.provenance)}`, ""];
  for (const c of palette.colors) {
    const flags = c.imageSourced ? " · image-sourced" : "";
    lines.push(
      `- **${c.role}** \`${c.hex}\` — ${c.usage} · area ${pct(c.areaWeight)}${flags}`,
    );
  }
  if (palette.contrast.length > 0) {
    lines.push("", "**Contrast**", "");
    for (const p of palette.contrast) {
      lines.push(`- ${p.pair[0]} on ${p.pair[1]}: ${p.ratio}:1 (${p.wcag})`);
    }
  }
  return lines.join("\n");
}

function renderTypography(typography: Typography): string {
  const lines: string[] = [`## Typography${provenanceSuffix(typography.provenance)}`, ""];

  lines.push("**Families**", "");
  for (const f of typography.families) {
    const weights = f.weightsObserved.join(", ");
    lines.push(`- **${f.name}** — ${f.role}, ${f.classification} · weights ${weights}`);
  }

  lines.push("", "**Type scale**", "");
  lines.push("| Token | Size | Weight | Line height | Letter spacing |");
  lines.push("|---|---|---|---|---|");
  for (const s of typography.scale) {
    lines.push(
      `| ${s.token} | ${s.sizePx}px | ${s.weight} | ${s.lineHeight} | ${s.letterSpacing} |`,
    );
  }
  return lines.join("\n");
}

function renderSpacing(spacing: Spacing): string {
  const lines: string[] = [`## Spacing${provenanceSuffix(spacing.provenance)}`, ""];
  lines.push(`Base unit: \`${spacing.baseUnitPx}px\``, "");
  lines.push(`Scale: \`[${spacing.scale.join(", ")}]\``);
  return lines.join("\n");
}

function renderRadius(radius: Radius): string {
  const lines: string[] = [`## Radius${provenanceSuffix(radius.provenance)}`, ""];
  lines.push(`Scale: \`[${radius.scale.join(", ")}]\``);
  return lines.join("\n");
}

function renderElevation(elevation: Elevation): string {
  const lines: string[] = [`## Elevation${provenanceSuffix(elevation.provenance)}`, ""];
  lines.push("Shadows:", "");
  for (const s of elevation.shadows) {
    lines.push(`- \`${s}\``);
  }
  return lines.join("\n");
}

function renderIdentity(identity: Identity): string {
  const lines: string[] = [`## Identity${provenanceSuffix(identity.provenance)}`, ""];
  lines.push(`**${identity.archetype}**`, "");
  lines.push(identity.description, "");
  lines.push(identity.adjectives.map((a) => `\`${a}\``).join(" · "));
  return lines.join("\n");
}

function renderImageMood(imageMood: ImageMood): string {
  const lines: string[] = [`## Image mood${provenanceSuffix(imageMood.provenance)}`, ""];
  lines.push("Unsplash search keywords.", "");
  lines.push("**Hero**", "");
  for (const q of imageMood.hero) lines.push(`- ${q}`);
  lines.push("", "**Texture**", "");
  for (const q of imageMood.texture) lines.push(`- ${q}`);
  return lines.join("\n");
}
