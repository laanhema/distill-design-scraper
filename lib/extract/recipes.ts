import { hex, parseColor } from "@/lib/color";
import type { NodeStyle, StyleDump, ColorChannel } from "@/lib/extract/styleDump";
import { RECIPE_ELEMENTS } from "@/lib/schema";
import type { Palette, RecipeElement, RecipeEntry, Recipes, Typography } from "@/lib/schema";
import { nearestPaletteRole } from "./roleMatch";

/**
 * Stage — Component recipes (§P8-1)
 * The design report says what colors and sizes exist but never what a real
 * component *is*: padding, radius, border, color roles, type. This groups
 * style-dump nodes into a handful of element classes, partitions each class
 * into variant clusters by resolved background palette role (a filled primary
 * button and a ghost button are different recipes, not one averaged chimera),
 * and takes the modal (most common) observed value per property within each
 * cluster, so one outlier instance can't skew the recipe.
 */

/** Max px gap between a class's modal font size and a type-scale step to call it "that token". */
const TYPE_TOKEN_MATCH_TOLERANCE_PX = 2;

/** A variant cluster with at least this many instances always survives. */
const MIN_CLUSTER_INSTANCES = 3;
/** Smaller clusters survive only with at least this share of the class's instances. */
const MIN_CLUSTER_SHARE = 0.15;
/** Cap on recipe entries emitted per element class. */
const MAX_VARIANTS_PER_ELEMENT = 3;

/** Cluster key for the transparent / no-background variant — surfaced as the
 *  `transparent` variant label when the class kept multiple clusters. */
const NO_BACKGROUND_KEY = "none";
/** Human-facing variant label for the no-background cluster. */
const NO_BACKGROUND_VARIANT_LABEL = "transparent";

export function classify(node: NodeStyle): RecipeElement | null {
  // <input type="submit"|"button"> renders and behaves like a Button (styleDump.ts
  // only marks `interactive` true for those two input types, never plain text fields).
  const isButtonLike = node.tag === "button" || (node.tag === "input" && node.interactive);
  // A dropdown-trigger <button> inside primary nav is a NavItem, not a Button —
  // check before the generic Button branch below, or unstyled nav triggers
  // (padding 0, transparent bg) would skew the sitewide Button recipe's modes.
  if (isButtonLike && node.inNav === true) return "NavItem";
  if (isButtonLike) return "Button";
  // A link inside primary nav gets its own recipe — check before the generic
  // <a> fallthrough below, or every nav link would be swallowed as a TextLink.
  if (node.tag === "a" && node.inNav === true) return "NavItem";
  if (node.tag === "a") return "TextLink";
  if (["input", "select", "textarea"].includes(node.tag)) return "Input";
  if (isCardLike(node)) return "Card";
  // Badge only ever matches span/div, and Card requires hasText === false
  // while Badge requires hasText === true — the two are mutually exclusive
  // by tag and by text, so this can run before or after isCardLike with no
  // effect on either branch's matches.
  if (isBadgeLike(node)) return "Badge";
  return null;
}

/** A card is a padded, radius/shadow-bearing surface — never a text leaf itself
 *  (its content lives on a descendant), which is what distinguishes it from an
 *  incidentally-rounded text container. */
function isCardLike(node: NodeStyle): boolean {
  if (!["div", "article", "li"].includes(node.tag)) return false;
  if (node.hasText) return false;
  const layout = node.layout;
  if (!layout) return false;
  const hasSurfaceLook = layout.borderRadius !== "" || layout.boxShadow !== "";
  const hasPadding = layout.paddingsPx.some((p) => p > 0);
  return hasSurfaceLook && hasPadding;
}

/** A badge is a small, pill-shaped label — unlike a Card, its text lives
 *  directly on the node itself (a status tag or count chip reads its own
 *  label), and unlike a Button/NavItem it isn't interactive. "Pill-shaped" is
 *  read straight off the measured radius: a `%` radius, an explicit "999"-style
 *  value (the common CSS trick for "always fully rounded regardless of size"),
 *  or a flat px radius large enough (>= 8px) that it's clearly not just a
 *  slightly-softened rectangle. A small bounding-box height caps it to
 *  label-sized elements rather than large rounded surfaces (which `isCardLike`
 *  already covers via padding/shadow instead of radius alone). */
function isBadgeLike(node: NodeStyle): boolean {
  if (!["span", "div"].includes(node.tag)) return false;
  if (!node.hasText) return false;
  if (node.interactive) return false;
  const layout = node.layout;
  if (!layout || !layout.borderRadius) return false;
  const radius = layout.borderRadius;
  const isPillShaped =
    radius.includes("%") || radius.includes("999") || parseFloat(radius) >= 8;
  if (!isPillShaped) return false;
  if (!node.colors.some((c) => c.channel === "background")) return false;
  return node.rect.h > 0 && node.rect.h <= 40;
}

/** Most frequent value in `values`, keyed by `keyOf`; ties keep the first seen. */
function modal<T>(values: T[], keyOf: (v: T) => string): T | null {
  const counts = new Map<string, { count: number; value: T }>();
  for (const v of values) {
    const key = keyOf(v);
    const entry = counts.get(key);
    if (entry) entry.count++;
    else counts.set(key, { count: 1, value: v });
  }
  let best: T | null = null;
  let bestCount = 0;
  for (const { count, value } of counts.values()) {
    if (count > bestCount) {
      bestCount = count;
      best = value;
    }
  }
  return best;
}

function modalPadding(nodes: NodeStyle[]): string {
  // Zero is a real measured value, not "missing data" — excluding it would
  // let a single padded outlier win the mode whenever most instances of a
  // class (e.g. plain text links) genuinely have no padding.
  const rounded = nodes
    .map((n) => n.layout?.paddingsPx.map((p) => Math.round(p)))
    .filter((p): p is number[] => !!p);
  const best = modal(rounded, (p) => p.join(","));
  if (!best) return "0px";
  const [top, right, bottom, left] = best;
  if (top === bottom && right === left) {
    return top === right ? `${top}px` : `${top}px ${right}px`;
  }
  return `${top}px ${right}px ${bottom}px ${left}px`;
}

function modalRadius(nodes: NodeStyle[]): string | undefined {
  const values = nodes.map((n) => n.layout?.borderRadius).filter((r): r is string => !!r);
  return modal(values, (r) => r) ?? undefined;
}

function modalColorValue(nodes: NodeStyle[], channel: ColorChannel): string | undefined {
  const values = nodes
    .map((n) => n.colors.find((c) => c.channel === channel)?.value)
    .filter((v): v is string => !!v);
  return modal(values, (v) => v) ?? undefined;
}

/** Prefer a palette-role name (nearest ΔE); fall back to the raw hex rather
 *  than fabricating a role that doesn't match anything measured. */
function resolveColorLabel(value: string, palette: Palette): string {
  const role = nearestPaletteRole(value, palette);
  if (role) return role;
  const parsed = parseColor(value);
  return parsed ? hex(parsed) : value;
}

/** Variant-cluster key for a node: its resolved background palette role, the
 *  normalized hex when no role is within ΔE (two distinct unmatched bgs are
 *  two distinct variants, not one), or the no-background sentinel — a
 *  transparent/ghost variant is its own cluster. */
function variantKey(node: NodeStyle, palette: Palette): string {
  const bg = node.colors.find((c) => c.channel === "background")?.value;
  if (!bg) return NO_BACKGROUND_KEY;
  return resolveColorLabel(bg, palette);
}

function modalType(
  nodes: NodeStyle[],
  typography: Typography | undefined,
): Pick<RecipeEntry, "typeToken" | "typeWeight"> {
  const withType = nodes.filter((n): n is NodeStyle & { type: NonNullable<NodeStyle["type"]> } =>
    Boolean(n.type),
  );
  if (withType.length === 0 || !typography) return {};

  const best = modal(withType, (n) => `${Math.round(n.type.fontSizePx)}:${n.type.fontWeight}`);
  if (!best) return {};

  let token: RecipeEntry["typeToken"];
  let bestDiff = Infinity;
  for (const step of typography.scale) {
    const diff = Math.abs(step.sizePx - best.type.fontSizePx);
    if (diff < bestDiff) {
      bestDiff = diff;
      token = step.token;
    }
  }
  if (!token || bestDiff > TYPE_TOKEN_MATCH_TOLERANCE_PX) return {};
  return { typeToken: token, typeWeight: best.type.fontWeight };
}

/** Only present in `both`-lane runs — recipes are derived from the same
 *  measured palette/typography the rest of the design report uses. */
export function buildRecipes(
  dump: StyleDump,
  context: { palette: Palette; typography?: Typography },
): Recipes | undefined {
  const byElement = new Map<RecipeElement, NodeStyle[]>();
  for (const node of dump.nodes) {
    const cls = classify(node);
    if (!cls) continue;
    const list = byElement.get(cls);
    if (list) list.push(node);
    else byElement.set(cls, [node]);
  }

  const entries: RecipeEntry[] = [];
  for (const element of RECIPE_ELEMENTS) {
    const nodes = byElement.get(element);
    if (!nodes || nodes.length === 0) continue;

    // Partition the class into variant clusters by resolved background role
    // before any modal runs — modals taken across visually distinct variants
    // (filled primary vs. ghost) describe no real element.
    const clusters = new Map<string, NodeStyle[]>();
    for (const node of nodes) {
      const key = variantKey(node, context.palette);
      const cluster = clusters.get(key);
      if (cluster) cluster.push(node);
      else clusters.set(key, [node]);
    }

    const kept = [...clusters.entries()]
      .filter(
        ([, c]) =>
          c.length >= MIN_CLUSTER_INSTANCES || c.length / nodes.length >= MIN_CLUSTER_SHARE,
      )
      // Stable sort: ties keep first-seen (document-order) clusters first.
      .sort(([, a], [, b]) => b.length - a.length)
      .slice(0, MAX_VARIANTS_PER_ELEMENT);

    for (const [key, cluster] of kept) {
      const entry: RecipeEntry = { element, padding: modalPadding(cluster) };

      // The label is the measured cluster key itself — a palette role, a raw
      // hex, or the no-background sentinel surfaced as `transparent`. Only
      // stamped when this class actually kept multiple variants; a lone
      // cluster has nothing to distinguish, so the field stays omitted and
      // the entry renders byte-identical to a pre-variant report.
      if (kept.length > 1) {
        entry.variant = key === NO_BACKGROUND_KEY ? NO_BACKGROUND_VARIANT_LABEL : key;
      }

      const radius = modalRadius(cluster);
      if (radius) entry.radius = radius;

      const bg = modalColorValue(cluster, "background");
      if (bg) entry.bg = resolveColorLabel(bg, context.palette);

      const text = modalColorValue(cluster, "text");
      if (text) entry.text = resolveColorLabel(text, context.palette);

      const border = modalColorValue(cluster, "border");
      if (border) entry.border = resolveColorLabel(border, context.palette);

      Object.assign(entry, modalType(cluster, context.typography));

      entries.push(entry);
    }
  }

  if (entries.length === 0) return undefined;
  return { provenance: "measured", entries };
}
