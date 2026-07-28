import { dump as yamlDump } from "js-yaml";
import {
  reportSchema,
  type Elevation,
  type Identity,
  type ImageMood,
  type Motion,
  type Palette,
  type Radius,
  type Recipes,
  type Report,
  type Spacing,
  type States,
  type TypeToken,
  type Typography,
} from "@/lib/schema";

/**
 * Emit (§3, §4 module 4): merge the measured lanes into the report schema,
 * validate with Zod, then serialize a single `.md` file — YAML frontmatter (the
 * machine-parseable contract) followed by a human-readable body *derived from
 * the same object*, so the two can never drift.
 */

export interface BuildReportInput {
  source: { type: "url" | "image"; ref: string; refs?: string[]; capturedAt: string };
  reportKind: Report["reportKind"];
  palette: Palette;
  paletteDark?: Palette;
  typography?: Typography;
  spacing?: Spacing;
  radius?: Radius;
  elevation?: Elevation;
  recipes?: Recipes;
  states?: States;
  motion?: Motion;
  identity?: Identity;
  imageMood?: ImageMood;
}

/** Assemble and validate the report object. Throws on schema violation. */
export function buildReport(input: BuildReportInput): Report {
  const candidate: Report = {
    reportKind: input.reportKind,
    source: input.source,
    palette: input.palette,
    ...(input.paletteDark ? { paletteDark: input.paletteDark } : {}),
    ...(input.typography ? { typography: input.typography } : {}),
    ...(input.spacing ? { spacing: input.spacing } : {}),
    ...(input.radius ? { radius: input.radius } : {}),
    ...(input.elevation ? { elevation: input.elevation } : {}),
    ...(input.recipes ? { recipes: input.recipes } : {}),
    ...(input.states ? { states: input.states } : {}),
    ...(input.motion ? { motion: input.motion } : {}),
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
  if (report.paletteDark) parts.push(renderPalette(report.paletteDark, "Palette (dark scheme)"));
  if (report.states) parts.push(renderStates(report.states));
  if (report.motion) parts.push(renderMotion(report.motion));
  if (report.typography) parts.push(renderTypography(report.typography));
  if (report.spacing) parts.push(renderSpacing(report.spacing));
  if (report.radius) parts.push(renderRadius(report.radius));
  if (report.elevation) {
    const elevationSection = renderElevation(report.elevation);
    if (elevationSection) parts.push(elevationSection);
  }
  if (report.recipes) parts.push(renderRecipes(report.recipes));
  if (report.identity) parts.push(renderIdentity(report.identity));
  if (report.imageMood) parts.push(renderImageMood(report.imageMood));
  parts.push(renderCssVariables(report));

  return parts.join("\n\n");
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/** Heading suffix for a lane's provenance, omitted when it's "measured". */
function provenanceSuffix(provenance: string): string {
  return provenance === "measured" ? "" : ` _(${provenance})_`;
}

function renderPalette(palette: Palette, heading = "Palette"): string {
  const lines: string[] = [`## ${heading}${provenanceSuffix(palette.provenance)}`, ""];
  for (const c of palette.colors) {
    const flags = [
      c.imageSourced ? "image-sourced" : "",
      c.provenance === "inferred" ? "inferred" : "",
    ]
      .filter(Boolean)
      .join(" · ");
    const flagsSuffix = flags ? ` · ${flags}` : "";
    lines.push(
      `- **${c.role}** \`${c.hex}\` — ${c.usage} · area ${pct(c.areaWeight)}${flagsSuffix}`,
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

/**
 * Static reference ranges for conventional type-scale sizing, purely for
 * at-a-glance comparison in the rendered report — not derived from any
 * capture, and never used to alter a measured `sizePx`.
 */
const RECOMMENDED_TYPE_RANGES: Record<TypeToken, string> = {
  display: "64–96px",
  h1: "48–64px",
  h2: "32–40px",
  h3: "24–28px",
  body: "16–18px",
  small: "14px",
};

/**
 * Curated, best-effort lookup of proprietary/custom font names — the kind
 * that show up in Framer/Webflow exports or brand type systems and are NOT
 * freely available/licensable — mapped to a suggested open (Google Fonts)
 * alternative with a broadly similar character. Deliberately small and
 * conservative: an unrecognized name (including legitimate open fonts like
 * "Inter" or "Roboto") gets no suggestion rather than a guessed one. Never
 * used to alter the measured family name itself — purely a rendering-time
 * suggestion, same spirit as `provenanceSuffix`.
 */
const FONT_FALLBACK_SUGGESTIONS: Record<string, string> = {
  recifetext: "Plus Jakarta Sans",
  recife: "Plus Jakarta Sans",
  sohne: "Inter",
  gtwalsheim: "Outfit",
  neuemontreal: "Space Grotesk",
  canela: "Fraunces",
  foundersgrotesk: "Archivo",
  circular: "Poppins",
};

/**
 * Strip diacritics, common weight/style/variable-font suffixes, digits, and
 * punctuation before matching — font names in the wild carry variants like
 * "RecifeText-SemiBold", "Söhne Buch", "GT Walsheim VF", "Circular Std Bold".
 */
function normalizeFontName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(
      /[_\s-]*(thin|hairline|extralight|ultralight|light|regular|book|std|buch|normal|medium|semibold|demibold|bold|extrabold|ultrabold|black|heavy|italic|oblique|vf|variable)\b/gi,
      "",
    )
    .replace(/\d+/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

/** Nearest known-proprietary-font match, or null if this name isn't in the curated table. */
function suggestedFontAlternative(name: string): string | null {
  const normalized = normalizeFontName(name);
  if (!normalized) return null;
  if (FONT_FALLBACK_SUGGESTIONS[normalized]) return FONT_FALLBACK_SUGGESTIONS[normalized];
  for (const key of Object.keys(FONT_FALLBACK_SUGGESTIONS)) {
    if (normalized.startsWith(key)) return FONT_FALLBACK_SUGGESTIONS[key];
  }
  return null;
}

function renderTypography(typography: Typography): string {
  const lines: string[] = [`## Typography${provenanceSuffix(typography.provenance)}`, ""];

  lines.push("**Families**", "");
  for (const f of typography.families) {
    const weights = f.weightsObserved.join(", ");
    const fallbacks = f.stack.filter((name) => name !== f.name);
    const fallbackSuffix =
      fallbacks.length > 0 ? ` · fallback: ${fallbacks.join(", ")}` : "";
    const suggestion = suggestedFontAlternative(f.name);
    const suggestionSuffix = suggestion
      ? ` — _suggested open alternative: ${suggestion} (Google Fonts)_`
      : "";
    lines.push(
      `- **${f.name}** — ${f.role}, ${f.classification} · weights ${weights}${fallbackSuffix}${suggestionSuffix}`,
    );
  }

  lines.push("", "**Type scale**", "");
  lines.push("| Token | Size | Recommended | Weight | Line height | Letter spacing |");
  lines.push("|---|---|---|---|---|---|");
  for (const s of typography.scale) {
    const sizeCell = s.sizePxMobile ? `${s.sizePx}px (mobile ${s.sizePxMobile}px)` : `${s.sizePx}px`;
    const recommendedCell = RECOMMENDED_TYPE_RANGES[s.token];
    lines.push(
      `| ${s.token} | ${sizeCell} | ${recommendedCell} | ${s.weight} | ${s.lineHeight} | ${s.letterSpacing} |`,
    );
  }
  return lines.join("\n");
}

function renderSpacing(spacing: Spacing): string {
  const lines: string[] = [`## Spacing${provenanceSuffix(spacing.provenance)}`, ""];
  lines.push(`Base unit: \`${spacing.baseUnitPx}px\``, "");
  lines.push(`Scale (px): \`[${spacing.scale.join(", ")}]\``);
  return lines.join("\n");
}

function renderRadius(radius: Radius): string {
  const lines: string[] = [`## Radius${provenanceSuffix(radius.provenance)}`, ""];
  lines.push(`Scale: \`[${radius.scale.join(", ")}]\``);
  return lines.join("\n");
}

function renderElevation(elevation: Elevation): string | null {
  if (elevation.shadows.length === 0) return null;
  const lines: string[] = [`## Elevation${provenanceSuffix(elevation.provenance)}`, ""];
  lines.push("Shadows:", "");
  for (const s of elevation.shadows) {
    lines.push(`- **${s.name}** \`${s.value}\``);
  }
  return lines.join("\n");
}

const STATE_PROPERTY_LABEL: Record<string, string> = {
  "background-color": "background",
  color: "text",
  "border-color": "border",
  "box-shadow": "shadow",
};

function renderStates(states: States): string {
  const lines: string[] = [`## States${provenanceSuffix(states.provenance)}`, ""];
  for (const e of states.entries) {
    for (const ch of e.changes) {
      const label = STATE_PROPERTY_LABEL[ch.property] ?? ch.property;
      lines.push(`- **${e.target}** ${e.state}: \`${ch.to}\` (${label})`);
    }
  }
  return lines.join("\n");
}

function renderMotion(motion: Motion): string {
  const lines: string[] = [`## Motion${provenanceSuffix(motion.provenance)}`, ""];
  for (const e of motion.entries) {
    const delay = e.delayMs ? ` · delay ${e.delayMs}ms` : "";
    const iter = e.iterationCount ? ` · repeat ${e.iterationCount}` : "";
    lines.push(
      `- **${e.target}** \`${e.kind}\`: ${e.property} ${e.durationMs}ms ${e.timingFunction}${delay}${iter}`,
    );
  }
  if (motion.keyframes && motion.keyframes.length > 0) {
    lines.push("", "**Keyframes**", "");
    for (const k of motion.keyframes) {
      const stepsStr = k.steps
        .map((s) => `${s.offset} [${s.properties.join(", ")}]`)
        .join(" → ");
      lines.push(`- **@keyframes ${k.name}**: ${stepsStr}`);
    }
  }
  return lines.join("\n");
}

function renderRecipes(recipes: Recipes): string {
  const lines: string[] = [`## Component recipes${provenanceSuffix(recipes.provenance)}`, ""];
  for (const e of recipes.entries) {
    const parts: string[] = [];
    if (e.bg) parts.push(`bg \`${e.bg}\``);
    if (e.text) parts.push(`text \`${e.text}\``);
    if (e.border) parts.push(`border \`${e.border}\``);
    parts.push(`padding ${e.padding}`);
    if (e.radius) parts.push(`radius ${e.radius}`);
    if (e.typeToken) parts.push(`type \`${e.typeToken}\`${e.typeWeight ? `/${e.typeWeight}` : ""}`);
    const name = e.variant ? `${e.element} (${e.variant})` : e.element;
    lines.push(`- **${name}** — ${parts.join(" · ")}`);
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

/** Quote a font-family name only when it needs it (contains whitespace). */
function cssFontName(name: string): string {
  return /\s/.test(name) ? `"${name}"` : name;
}

/**
 * CSS variables (§P8-4): the last step from report to usable code — a
 * `:root` block derived from the same report object rendered everywhere
 * else, so there's nothing here that doesn't already trace to a
 * frontmatter field.
 */
function renderCssVariables(report: Report): string {
  const lines: string[] = ["## CSS variables", "", "```css", ":root {"];

  for (const c of report.palette.colors) {
    lines.push(`  --color-${c.role}: ${c.hex};`);
  }

  if (report.typography) {
    const primary = report.typography.families[0];
    if (primary) {
      const stack = primary.stack.length > 0 ? primary.stack : [primary.name];
      lines.push(`  --font-family: ${stack.map(cssFontName).join(", ")};`);
    }
    for (const s of report.typography.scale) {
      lines.push(`  --font-size-${s.token}: ${s.sizePx}px;`);
      if (s.sizePxMobile) lines.push(`  --font-size-${s.token}-mobile: ${s.sizePxMobile}px;`);
      lines.push(`  --font-weight-${s.token}: ${s.weight};`);
      lines.push(`  --line-height-${s.token}: ${s.lineHeight};`);
      lines.push(`  --letter-spacing-${s.token}: ${s.letterSpacing};`);
    }
  }

  if (report.spacing) {
    report.spacing.scale.forEach((px, i) => {
      lines.push(`  --space-${i + 1}: ${px}px;`);
    });
  }

  if (report.radius) {
    report.radius.scale.forEach((r, i) => {
      lines.push(`  --radius-${i + 1}: ${r};`);
    });
  }

  if (report.elevation) {
    for (const s of report.elevation.shadows) {
      lines.push(`  --shadow-${s.name}: ${s.value};`);
    }
  }

  lines.push("}", "```");
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
