import type { StyleDump } from "./styleDump";
import type { Motion, MotionEntry, KeyframeDef } from "@/lib/schema";
import { classify } from "./recipes";

/**
 * Stage — Motion/transition tokens (§P6)
 * Extracts declared CSS transitions and animations from style-dump nodes,
 * attributed to recipe element classes (Button, Card, TextLink, etc.).
 * Collects `@keyframes` definitions when referenced by animations.
 */
export function extractMotion(dump: StyleDump): Motion | undefined {
  const entryMap = new Map<string, MotionEntry>();

  for (const node of dump.nodes) {
    if (!node.motion) continue;

    const target = classify(node);
    if (!target) continue;

    if (node.motion.transitions) {
      for (const t of node.motion.transitions) {
        const key = `${target}:transition:${t.property}:${t.durationMs}:${t.timingFunction}:${t.delayMs ?? 0}`;
        if (!entryMap.has(key)) {
          entryMap.set(key, {
            target,
            kind: "transition",
            property: t.property,
            durationMs: t.durationMs,
            timingFunction: t.timingFunction,
            ...(t.delayMs ? { delayMs: t.delayMs } : {}),
          });
        }
      }
    }

    if (node.motion.animations) {
      for (const a of node.motion.animations) {
        const key = `${target}:animation:${a.name}:${a.durationMs}:${a.timingFunction}:${a.delayMs ?? 0}:${a.iterationCount ?? ""}`;
        if (!entryMap.has(key)) {
          entryMap.set(key, {
            target,
            kind: "animation",
            property: a.name,
            durationMs: a.durationMs,
            timingFunction: a.timingFunction,
            ...(a.delayMs ? { delayMs: a.delayMs } : {}),
            ...(a.iterationCount ? { iterationCount: a.iterationCount } : {}),
          });
        }
      }
    }
  }

  const entries = Array.from(entryMap.values());
  if (entries.length === 0) return undefined;

  // Filter keyframes to only those actually referenced by animation entries
  let referencedKeyframes: KeyframeDef[] | undefined;
  if (dump.keyframes && dump.keyframes.length > 0) {
    const animNames = new Set(
      entries.filter((e) => e.kind === "animation").map((e) => e.property),
    );
    const matched = dump.keyframes.filter((k) => animNames.has(k.name));
    if (matched.length > 0) {
      referencedKeyframes = matched;
    }
  }

  return {
    provenance: "measured",
    entries,
    ...(referencedKeyframes ? { keyframes: referencedKeyframes } : {}),
  };
}
