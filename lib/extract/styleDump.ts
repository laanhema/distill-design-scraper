import { errors, type Page } from "playwright";

/**
 * The style dump: one record per visible node, with every color it paints
 * *and the channel it came from*. The channel is a strong prior for role
 * assignment (a `color` on text is a `text` candidate, not a `background`
 * one), so the walk keeps channels separate rather than pooling them.
 *
 * The collection function runs inside the page (via `page.evaluate`), so it is
 * deliberately self-contained: no imports, only DOM APIs, plain JSON out.
 */

export type ColorChannel =
  | "background"
  | "text"
  | "border"
  | "fill"
  | "stroke";

export interface KeyframeStep {
  offset: string;
  properties: string[];
}

export interface KeyframeDef {
  name: string;
  steps: KeyframeStep[];
}

export interface TransitionInfo {
  property: string;
  durationMs: number;
  timingFunction: string;
  delayMs?: number;
}

export interface AnimationInfo {
  name: string;
  durationMs: number;
  timingFunction: string;
  delayMs?: number;
  iterationCount?: string;
}

export interface NodeStyle {
  tag: string;
  /** CSS-pixel bounding box in the viewport (rough presence signal only —
   *  authoritative area comes from the screenshot pixel pass). */
  rect: { x: number; y: number; w: number; h: number };
  colors: { channel: ColorChannel; value: string }[];
  /** True when the node has a direct, non-whitespace text child. */
  hasText: boolean;
  /** True for links, buttons and other CTA-ish affordances (Stage C). */
  interactive: boolean;
  /** Typography, present only when `hasText` — a measured type sample. */
  type?: {
    fontFamily: string;
    fontSizePx: number;
    fontWeight: number;
    lineHeightPx: number;
    letterSpacing: string;
  };
  layout?: {
    marginsPx: number[];
    paddingsPx: number[];
    gapsPx: number[];
    borderRadius: string;
    boxShadow: string;
  };
  motion?: {
    transitions?: TransitionInfo[];
    animations?: AnimationInfo[];
  };
  /** ARIA evidence for semantic (success/warning/danger) color roles
   *  ("alert"/"status" live regions, or an `aria-invalid` field) — never
   *  inferred from color alone. */
  semanticContext?: "alert" | "invalid";
  /** True when the node has an ancestor matching `nav` or `[role="navigation"]`
   *  — lets recipe classification tell a primary-nav link apart from a generic
   *  body text link without re-walking the DOM. */
  inNav?: boolean;
  /** Declared `:hover`/`:focus-visible` deltas read from the CSSOM for this
   *  node, when it's interactive and a matching rule exists. */
  states?: {
    state: "hover" | "focus";
    changes: { property: string; from: string; to: string }[];
  }[];
}

export interface StyleDump {
  nodes: NodeStyle[];
  /** How many nodes matched before the cap; lets us flag truncation. */
  totalVisible: number;
  truncated: boolean;
  keyframes?: KeyframeDef[];
}

/** Hard cap on collected nodes, to bound the payload handed back to Node. */
const NODE_CAP = 5000;

/** Ceiling on one cross-origin stylesheet refetch. The browser loaded the
 *  same sheet moments earlier, so a host that needs longer than this is
 *  stalled, and Playwright's own default (30 s per request) would let it
 *  spend the analysis route's whole budget. */
const CROSS_ORIGIN_SHEET_TIMEOUT_MS = 5_000;

/**
 * Cross-origin stylesheet text of one analysis, keyed by `href`, shared by
 * every `collectStyleDump` call of a capture so the dark-scheme dump never
 * downloads a sheet again. A failed, timed-out or empty sheet is cached as
 * `null` too, so a stalled host costs one timeout (and one warning) per
 * analysis.
 */
export type CrossOriginSheetCache = Map<string, Promise<string | null>>;

/** Never rejects: any failure resolves to `null`. Only a timeout logs a
 *  warning (once per analysis, from inside the cached promise). */
function fetchCrossOriginSheet(
  page: Page,
  href: string,
  cache: CrossOriginSheetCache,
): Promise<string | null> {
  let pending = cache.get(href);
  if (!pending) {
    pending = page
      .context()
      .request.get(href, { timeout: CROSS_ORIGIN_SHEET_TIMEOUT_MS })
      .then(async (res) => {
        if (!res.ok()) return null;
        const cssText = await res.text();
        return cssText.trim() ? cssText : null;
      })
      .catch((err: unknown) => {
        if (err instanceof errors.TimeoutError) {
          console.warn(
            `Cross-origin stylesheet refetch timed out after ${CROSS_ORIGIN_SHEET_TIMEOUT_MS} ms; skipping its hover/focus states and keyframes: ${href}`,
          );
        }
        return null;
      });
    cache.set(href, pending);
  }
  return pending;
}

/**
 * The one `:hover`/`:focus-visible` CSSOM scanner shared by the same-origin
 * walk and the cross-origin re-fetch pass, so the two can't drift. The passes
 * are separate `page.evaluate` executions, so this is defined once here,
 * serialized with `.toString()` and rebuilt in the page with `new Function`.
 * It must stay self-contained — no closures over anything outside its own
 * body, no imports — since only its text crosses the page boundary. Each call
 * site locates "the record for this element" through `getRecord`.
 * `STATE_PROPS` values must be kebab-case: `getPropertyValue()` silently never
 * matches a camelCase name.
 */
function createStateScanner() {
  const STATE_PROPS: Record<string, string> = {
    "background-color": "background-color",
    "color": "color",
    "border-color": "border-top-color",
    "box-shadow": "box-shadow",
  };

  /**
   * Resolves `var(--name[, fallback])` in a rule-text value against custom
   * properties read off the element itself (they cascade, so that is the
   * measured value, not a guess). Bounded passes, innermost refs first, since
   * a fallback can nest another `var()`; an unresolvable ref without a
   * fallback stays literal `var(...)` text.
   */
  function resolveVarRefs(value: string, cs: CSSStyleDeclaration): string {
    let result = value;
    for (let pass = 0; pass < 3 && result.includes("var("); pass++) {
      const next = result.replace(
        /var\(\s*(--[a-zA-Z0-9_-]+)\s*(?:,\s*([^()]*))?\)/g,
        (match, name: string, fallback?: string) => {
          const resolved = cs.getPropertyValue(name).trim();
          if (resolved) return resolved;
          if (fallback !== undefined) return fallback.trim();
          return match;
        },
      );
      if (next === result) break;
      result = next;
    }
    return result;
  }

  type StateRecord = {
    interactive?: boolean;
    states?: {
      state: "hover" | "focus";
      changes: { property: string; from: string; to: string }[];
    }[];
  };

  function applyRule(
    rule: CSSStyleRule,
    getRecord: (el: Element) => StateRecord | undefined,
  ) {
    const selectorText = rule.selectorText;
    if (!selectorText) return;
    for (const rawSelector of selectorText.split(",")) {
      const selector = rawSelector.trim();
      const state = selector.includes(":hover")
        ? "hover"
        : selector.includes(":focus-visible")
          ? "focus"
          : null;
      if (!state) continue;
      const baseSelector = selector
        .replace(/:hover/g, "")
        .replace(/:focus-visible/g, "")
        .trim();
      if (!baseSelector) continue;

      let matched: NodeListOf<Element>;
      try {
        matched = document.querySelectorAll(baseSelector);
      } catch {
        continue;
      }

      for (const el of matched) {
        const record = getRecord(el);
        if (!record || !record.interactive) continue;

        const cs = getComputedStyle(el);
        const changes: { property: string; from: string; to: string }[] = [];
        for (const [prop, computedProp] of Object.entries(STATE_PROPS)) {
          const to = resolveVarRefs(rule.style.getPropertyValue(prop), cs);
          if (!to) continue;
          const from = cs.getPropertyValue(computedProp);
          if (!from || from === to) continue;
          changes.push({ property: prop, from, to });
        }
        if (changes.length === 0) continue;

        const states = record.states ?? [];
        const existing = states.find((s) => s.state === state);
        if (existing) {
          for (const ch of changes) {
            if (!existing.changes.some((e) => e.property === ch.property)) {
              existing.changes.push(ch);
            }
          }
        } else {
          states.push({ state, changes });
        }
        record.states = states;
      }
    }
  }

  function scanRules(
    rules: CSSRuleList,
    getRecord: (el: Element) => StateRecord | undefined,
    onKeyframe: (kf: KeyframeDef) => void,
  ) {
    for (const rule of rules) {
      if (rule instanceof CSSMediaRule) {
        scanRules(rule.cssRules, getRecord, onKeyframe);
        continue;
      }
      if (rule instanceof CSSStyleRule) applyRule(rule, getRecord);
      if (typeof CSSKeyframesRule !== "undefined" && rule instanceof CSSKeyframesRule) {
        const steps: { offset: string; properties: string[] }[] = [];
        for (let i = 0; i < rule.cssRules.length; i++) {
          const step = rule.cssRules[i];
          if (typeof CSSKeyframeRule !== "undefined" && step instanceof CSSKeyframeRule) {
            const props: string[] = [];
            for (let j = 0; j < step.style.length; j++) {
              props.push(step.style[j]);
            }
            steps.push({ offset: step.keyText, properties: props });
          }
        }
        if (steps.length > 0) {
          onKeyframe({ name: rule.name, steps });
        }
      }
    }
  }

  return { scanRules };
}

/**
 * Runs on the settled page, so it reflects the *rendered state only*: unused
 * theme variants sitting in stylesheets never appear here.
 */
export async function collectStyleDump(
  page: Page,
  sheetCache: CrossOriginSheetCache,
): Promise<StyleDump> {
  // Bundlers that compile this module (tsx/esbuild with keepNames) inject a
  // `__name(fn, "…")` helper around the named functions inside the serialized
  // browser callback below. That helper doesn't exist in the page, so define a
  // harmless passthrough first. This arrow has no named functions of its own,
  // so it is never itself rewritten. No-op under bundlers that don't inject it.
  await page.evaluate(() => {
    const g = globalThis as unknown as { __name?: (fn: unknown) => unknown };
    g.__name ??= (fn) => fn;
  });

  const dump = await page.evaluate(
    ({ cap, scannerSrc }: { cap: number; scannerSrc: string }) => {
    function opaqueColor(value: string): string | null {
      if (!value) return null;
      const v = value.trim();
      if (v === "transparent" || v === "none") return null;
      // Covers `rgb(r, g, b)`, `rgba(r, g, b, a)` and `rgb(r g b / a)`.
      const nums = v.match(/[\d.]+/g);
      if (!nums) return null;
      if (nums.length >= 4 && parseFloat(nums[3]) === 0) return null;
      return v;
    }

    /**
     * The widest *visible* side's color, not always `border-top-color`: a
     * zero-width side's default (`currentColor`, often pure black) would
     * otherwise claim the border channel on a `border-bottom`-only hairline.
     */
    function visibleBorderColor(cs: CSSStyleDeclaration): string | null {
      const sides = [
        ["border-top-width", "border-top-style", "border-top-color"],
        ["border-right-width", "border-right-style", "border-right-color"],
        ["border-bottom-width", "border-bottom-style", "border-bottom-color"],
        ["border-left-width", "border-left-style", "border-left-color"],
      ] as const;
      let best: string | null = null;
      let bestWidth = 0;
      for (const [w, s, c] of sides) {
        const width = parseFloat(cs.getPropertyValue(w));
        const style = cs.getPropertyValue(s);
        if (width <= 0 || style === "none" || style === "hidden") continue;
        if (width <= bestWidth) continue;
        const color = opaqueColor(cs.getPropertyValue(c));
        if (!color) continue;
        best = color;
        bestWidth = width;
      }
      return best;
    }

    function hasDirectText(el: Element): boolean {
      for (const node of el.childNodes) {
        if (
          node.nodeType === Node.TEXT_NODE &&
          (node.textContent ?? "").trim().length > 0
        ) {
          return true;
        }
      }
      return false;
    }

    const INTERACTIVE = new Set(["A", "BUTTON", "SUMMARY"]);
    function isInteractive(el: Element): boolean {
      if (INTERACTIVE.has(el.tagName)) return true;
      const role = el.getAttribute("role");
      if (role === "button" || role === "link") return true;
      // `in`, not `instanceof HTMLInputElement`: an element that a script
      // created in another frame's document and moved here is no instance of
      // this window's classes, but it does carry `type`.
      if (el.tagName === "INPUT" && "type" in el) {
        return el.type === "submit" || el.type === "button";
      }
      return false;
    }

    const SVG_SHAPES = new Set([
      "PATH", "CIRCLE", "RECT", "POLYGON", "ELLIPSE", "LINE", "SVG",
    ]);

    function semanticContext(el: Element): "alert" | "invalid" | undefined {
      const role = el.getAttribute("role");
      if (role === "alert" || role === "status") return "alert";
      if (el.getAttribute("aria-invalid") === "true") return "invalid";
      return undefined;
    }

    const all = document.querySelectorAll("*");
    const nodes: NodeStyle[] = [];
    // Only elements that end up with a record are eligible hover/focus scan
    // targets.
    const elementRecords = new Map<Element, NodeStyle>();
    let totalVisible = 0;
    let truncated = false;

    for (const el of all) {
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      if (parseFloat(cs.opacity) === 0) continue;

      const r = el.getBoundingClientRect();
      // Skip zero-area and off-screen-left/above nodes; keep below-the-fold
      // ones (full-page screenshot covers them).
      if (r.width <= 0 || r.height <= 0) continue;
      if (r.bottom < 0 || r.right < 0) continue;

      totalVisible++;
      if (nodes.length >= cap) {
        truncated = true;
        continue;
      }

      const hasText = hasDirectText(el);
      const colors: NodeStyle["colors"] = [];

      const bg = opaqueColor(cs.backgroundColor);
      if (bg) colors.push({ channel: "background", value: bg });

      if (hasText) {
        const fg = opaqueColor(cs.color);
        if (fg) colors.push({ channel: "text", value: fg });
      }

      const bc = visibleBorderColor(cs);
      if (bc) colors.push({ channel: "border", value: bc });

      if (SVG_SHAPES.has(el.tagName)) {
        const fill = opaqueColor(cs.fill);
        if (fill) colors.push({ channel: "fill", value: fill });
        const stroke = opaqueColor(cs.stroke);
        if (stroke) colors.push({ channel: "stroke", value: stroke });
      }

      const marginsPx = [
        parseFloat(cs.marginTop) || 0,
        parseFloat(cs.marginRight) || 0,
        parseFloat(cs.marginBottom) || 0,
        parseFloat(cs.marginLeft) || 0,
      ];
      const paddingsPx = [
        parseFloat(cs.paddingTop) || 0,
        parseFloat(cs.paddingRight) || 0,
        parseFloat(cs.paddingBottom) || 0,
        parseFloat(cs.paddingLeft) || 0,
      ];
      const rowGap = parseFloat(cs.rowGap) || 0;
      const colGap = parseFloat(cs.columnGap) || 0;
      const gapsPx = [rowGap, colGap].filter((g) => g > 0);
      const borderRadius =
        cs.borderRadius && cs.borderRadius !== "0px" ? cs.borderRadius : "";
      const boxShadow =
        cs.boxShadow && cs.boxShadow !== "none" ? cs.boxShadow : "";

      function splitCommaOutsideParens(str: string): string[] {
        const parts: string[] = [];
        let depth = 0;
        let current = "";
        for (let i = 0; i < str.length; i++) {
          const char = str[i];
          if (char === "(") depth++;
          else if (char === ")") depth--;
          if (char === "," && depth === 0) {
            parts.push(current.trim());
            current = "";
          } else {
            current += char;
          }
        }
        if (current.trim()) parts.push(current.trim());
        return parts;
      }

      function parseTimeMs(val: string): number {
        if (!val) return 0;
        const v = val.trim().toLowerCase();
        if (v.endsWith("ms")) return parseFloat(v) || 0;
        if (v.endsWith("s")) return (parseFloat(v) || 0) * 1000;
        return parseFloat(v) || 0;
      }

      const hasLayout =
        borderRadius !== "" ||
        boxShadow !== "" ||
        gapsPx.length > 0 ||
        paddingsPx.some((p) => p > 0) ||
        marginsPx.some((m) => m > 0);

      const transitions: TransitionInfo[] = [];
      if (cs.transitionDuration) {
        const durStrs = splitCommaOutsideParens(cs.transitionDuration);
        const propStrs = splitCommaOutsideParens(cs.transitionProperty || "all");
        const tfStrs = splitCommaOutsideParens(cs.transitionTimingFunction || "ease");
        const delayStrs = splitCommaOutsideParens(cs.transitionDelay || "0s");

        durStrs.forEach((durStr, i) => {
          const durationMs = parseTimeMs(durStr);
          if (durationMs > 0) {
            const property = propStrs[i] || propStrs[0] || "all";
            const timingFunction = tfStrs[i] || tfStrs[0] || "ease";
            const delayMs = parseTimeMs(delayStrs[i] || delayStrs[0] || "0s");
            transitions.push({
              property,
              durationMs,
              timingFunction,
              ...(delayMs > 0 ? { delayMs } : {}),
            });
          }
        });
      }

      const animations: AnimationInfo[] = [];
      if (cs.animationName && cs.animationName !== "none") {
        const animNames = splitCommaOutsideParens(cs.animationName);
        const durStrs = splitCommaOutsideParens(cs.animationDuration || "0s");
        const tfStrs = splitCommaOutsideParens(cs.animationTimingFunction || "ease");
        const delayStrs = splitCommaOutsideParens(cs.animationDelay || "0s");
        const iterStrs = splitCommaOutsideParens(cs.animationIterationCount || "1");

        animNames.forEach((name, i) => {
          if (name && name !== "none") {
            const durationMs = parseTimeMs(durStrs[i] || durStrs[0] || "0s");
            if (durationMs > 0) {
              const timingFunction = tfStrs[i] || tfStrs[0] || "ease";
              const delayMs = parseTimeMs(delayStrs[i] || delayStrs[0] || "0s");
              const iterationCount = iterStrs[i] || iterStrs[0];
              animations.push({
                name,
                durationMs,
                timingFunction,
                ...(delayMs > 0 ? { delayMs } : {}),
                ...(iterationCount && iterationCount !== "1" ? { iterationCount } : {}),
              });
            }
          }
        });
      }

      const hasMotion = transitions.length > 0 || animations.length > 0;

      if (colors.length === 0 && !hasText && !hasLayout && !hasMotion) continue;

      const record: NodeStyle = {
        tag: el.tagName.toLowerCase(),
        rect: { x: r.x, y: r.y, w: r.width, h: r.height },
        colors,
        hasText,
        interactive: isInteractive(el),
        layout: {
          marginsPx,
          paddingsPx,
          gapsPx,
          borderRadius,
          boxShadow,
        },
      };

      if (hasMotion) {
        record.motion = {
          ...(transitions.length > 0 ? { transitions } : {}),
          ...(animations.length > 0 ? { animations } : {}),
        };
      }

      if (hasText) {
        const fontSizePx = parseFloat(cs.fontSize);
        const lh = cs.lineHeight;
        const lineHeightPx =
          lh === "normal" ? fontSizePx * 1.2 : parseFloat(lh);
        record.type = {
          fontFamily: cs.fontFamily,
          fontSizePx,
          fontWeight: parseInt(cs.fontWeight, 10) || 400,
          lineHeightPx: Number.isFinite(lineHeightPx)
            ? lineHeightPx
            : fontSizePx * 1.2,
          letterSpacing: cs.letterSpacing === "normal" ? "0" : cs.letterSpacing,
        };
      }

      const ctx = semanticContext(el);
      if (ctx) record.semanticContext = ctx;

      if (el.closest('nav, [role="navigation"]')) record.inNav = true;

      nodes.push(record);
      el.setAttribute("data-distill-id", String(nodes.length - 1));
      elementRecords.set(el, record);
    }

    // Interactive states: declared `:hover`/`:focus-visible` deltas, read
    // straight from the CSSOM — never simulated by toggling the pseudo class,
    // so a rule guarded by JS (`.is-hovering`) is an honest miss, not a wrong
    // answer. A cross-origin sheet throws on `.cssRules`; its href goes to the
    // re-fetch pass below.
    const { scanRules }: ReturnType<typeof createStateScanner> = new Function("return (" + scannerSrc + ")")()();
    const keyframes: KeyframeDef[] = [];
    const crossOriginHrefs: string[] = [];

    for (const sheet of document.styleSheets) {
      let rules: CSSRuleList | null;
      try {
        rules = sheet.cssRules;
      } catch {
        if (sheet.href) crossOriginHrefs.push(sheet.href);
        continue;
      }
      if (rules) {
        scanRules(
          rules,
          (el) => elementRecords.get(el),
          (kf) => {
            if (!keyframes.some((k) => k.name === kf.name)) keyframes.push(kf);
          },
        );
      }
    }

    return {
      nodes,
      totalVisible,
      truncated,
      ...(keyframes.length > 0 ? { keyframes } : {}),
      ...(crossOriginHrefs.length > 0 ? { crossOriginHrefs } : {}),
    };
  }, { cap: NODE_CAP, scannerSrc: createStateScanner.toString() });

  if (dump.crossOriginHrefs && dump.crossOriginHrefs.length > 0) {
    // The cross-origin pass is a separate `page.evaluate` with no
    // `elementRecords` Map, so it looks interactivity up by node id.
    const interactiveIds = new Set(
      dump.nodes.flatMap((n, i) => (n.interactive ? [i] : [])),
    );
    // Every sheet is requested at once, each under its own timeout; the
    // texts come back in stylesheet order whatever order the responses
    // arrive in, and are applied one at a time below, so the first sheet
    // that declares a change still wins the merge.
    const cssTexts = await Promise.all(
      dump.crossOriginHrefs.map((href) =>
        fetchCrossOriginSheet(page, href, sheetCache),
      ),
    );
    for (const cssText of cssTexts) {
      if (cssText === null) continue;
      try {
        const extra = await page.evaluate(
          ({
            text,
            scannerSrc,
            interactiveIds,
          }: {
            text: string;
            scannerSrc: string;
            interactiveIds: number[];
          }) => {
            const { scanRules }: ReturnType<typeof createStateScanner> =
              new Function("return (" + scannerSrc + ")")()();
            const interactiveIdSet = new Set(interactiveIds);
            const recordsById = new Map<
              number,
              {
                interactive: boolean;
                states: {
                  state: "hover" | "focus";
                  changes: { property: string; from: string; to: string }[];
                }[];
              }
            >();
            function getRecord(el: Element) {
              const idStr = el.getAttribute("data-distill-id");
              if (!idStr) return undefined;
              const id = parseInt(idStr, 10);
              let rec = recordsById.get(id);
              if (!rec) {
                rec = { interactive: interactiveIdSet.has(id), states: [] };
                recordsById.set(id, rec);
              }
              return rec;
            }

            const keyframes: KeyframeDef[] = [];
            const doc = document.implementation.createHTMLDocument("");
            const style = doc.createElement("style");
            style.textContent = text;
            doc.head.appendChild(style);
            const sheet = style.sheet;
            if (!sheet || !sheet.cssRules) return null;

            scanRules(
              sheet.cssRules,
              getRecord,
              (kf) => {
                if (!keyframes.some((k) => k.name === kf.name)) keyframes.push(kf);
              },
            );

            const updates = Array.from(recordsById.entries())
              .filter(([, rec]) => rec.states.length > 0)
              .map(([id, rec]) => ({ id, states: rec.states }));

            return { updates, keyframes };
          },
          {
            text: cssText,
            scannerSrc: createStateScanner.toString(),
            interactiveIds: [...interactiveIds],
          },
        );

        if (extra) {
          for (const { id, states } of extra.updates) {
            const node = dump.nodes[id];
            if (node) {
              const existingStates = node.states ?? [];
              for (const st of states) {
                const existing = existingStates.find(
                  (s) => s.state === st.state,
                );
                if (existing) {
                  for (const ch of st.changes) {
                    if (
                      !existing.changes.some(
                        (e) => e.property === ch.property,
                      )
                    ) {
                      existing.changes.push(ch);
                    }
                  }
                } else {
                  existingStates.push(st);
                }
              }
              node.states = existingStates;
            }
          }
          if (extra.keyframes && extra.keyframes.length > 0) {
            dump.keyframes = dump.keyframes ?? [];
            for (const k of extra.keyframes) {
              if (
                !dump.keyframes.some(
                  (existing) => existing.name === k.name,
                )
              ) {
                dump.keyframes.push(k);
              }
            }
          }
        }
      } catch {}
    }
  }

  await page.evaluate(() => {
    document.querySelectorAll("[data-distill-id]").forEach((el) => el.removeAttribute("data-distill-id"));
  }).catch(() => {});

  delete dump.crossOriginHrefs;
  return dump;
}
