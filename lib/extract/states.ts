import { hex, parseColor } from "@/lib/color";
import type { NodeStyle, StyleDump } from "@/lib/extract/styleDump";
import type { Palette, StateEntry, StateKind, States } from "@/lib/schema";
import { nearestPaletteRole } from "./roleMatch";

/** Colors display as `#rrggbb` for consistency with the rest of the report;
 *  `box-shadow` has no single parseable color, so it's kept as raw CSS. */
const COLOR_PROPERTIES = new Set(["background-color", "color", "border-color"]);

function display(property: string, value: string): string {
  if (!COLOR_PROPERTIES.has(property)) return value;
  const parsed = parseColor(value);
  return parsed ? hex(parsed) : value;
}

/**
 * Interactive states: per-node CSSOM deltas, attributed to the palette role of
 * the node's *own* base color and aggregated per role, taking the modal
 * from/to per property so one outlier can't skew the reported delta.
 */

function baseColorValue(node: NodeStyle): string | undefined {
  return (
    node.colors.find((c) => c.channel === "background")?.value ??
    node.colors.find((c) => c.channel === "text")?.value ??
    node.colors.find((c) => c.channel === "border")?.value
  );
}

interface ChangeCount {
  from: string;
  to: string;
  count: number;
}

interface StateBucket {
  target: StateEntry["target"];
  state: StateKind;
  byProp: Map<string, Map<string, ChangeCount>>;
}

export function buildStates(dump: StyleDump, palette: Palette): States | undefined {
  // Keyed by `${role}::${state}`. The bucket holds the pair itself, so the
  // entries below never have to parse it back out of the key.
  const buckets = new Map<string, StateBucket>();

  for (const node of dump.nodes) {
    if (!node.states || node.states.length === 0) continue;

    const base = baseColorValue(node);
    if (!base) continue;
    const role = nearestPaletteRole(base, palette);
    if (!role) continue; // never attribute a state to a role that isn't in the palette

    for (const s of node.states) {
      const key = `${role}::${s.state}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { target: role, state: s.state, byProp: new Map() };
        buckets.set(key, bucket);
      }
      for (const ch of s.changes) {
        let byFromTo = bucket.byProp.get(ch.property);
        if (!byFromTo) {
          byFromTo = new Map();
          bucket.byProp.set(ch.property, byFromTo);
        }
        const ftKey = `${ch.from}=>${ch.to}`;
        const existing = byFromTo.get(ftKey);
        if (existing) existing.count++;
        else byFromTo.set(ftKey, { from: ch.from, to: ch.to, count: 1 });
      }
    }
  }

  const entries: StateEntry[] = [];
  for (const { target, state, byProp } of buckets.values()) {
    const changes: StateEntry["changes"] = [];
    for (const [property, byFromTo] of byProp) {
      let best: ChangeCount | null = null;
      for (const candidate of byFromTo.values()) {
        if (!best || candidate.count > best.count) best = candidate;
      }
      if (best) {
        changes.push({
          property,
          from: display(property, best.from),
          to: display(property, best.to),
        });
      }
    }
    if (changes.length > 0) entries.push({ target, state, changes });
  }

  if (entries.length === 0) return undefined;
  return { provenance: "measured", entries };
}
