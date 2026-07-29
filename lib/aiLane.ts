/**
 * Shared primitives for every AI-backed lane (interpretation, DOM-based
 * structure labelling, vision-based structure inference) — one model id, one
 * availability check, one request primitive, one JSON parser, and one retry
 * policy, so the three lanes can't drift out of sync with each other. This is
 * also the only file in the codebase that imports a model-provider SDK: a lane
 * that needs a model round-trip calls `callModel`, never `generateContent`.
 */

import { GoogleGenAI, ThinkingLevel } from "@google/genai";

import type { ImageMediaType } from "@/lib/extract/imageMediaType";

/**
 * Re-exported so no call site has to import the SDK just to name a thinking
 * level (`ThinkingLevel` is an enum — a runtime value, not a type alias).
 */
export { ThinkingLevel };

/** Vision-capable; pinned everywhere an AI lane calls the model. */
export const AI_MODEL = "gemini-3.5-flash";

/** True when a live AI lane call is possible (an API key is configured). */
export function aiLaneAvailable(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY);
}

/**
 * One client for the whole process, constructed on first use — not one per
 * call and certainly not one per retry. Only assigned after a successful
 * construction so a missing-key throw can't poison a later call.
 */
let client: GoogleGenAI | null = null;

/**
 * One-time (not per-call) process-lifetime flag: `thinkingLevel` is a
 * Gemini-only knob (see `callOpenRouterModel` below), and a hot path (e.g.
 * repeated structure-AI calls) shouldn't spam the log every time a lane sends
 * one over OpenRouter.
 */
let warnedThinkingLevelIgnored = false;

function getClient(): GoogleGenAI {
  if (client) return client;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // Thrown rather than silently constructing a keyless client, so a caller
    // that skipped `aiLaneAvailable()` surfaces through `retryOnce`'s
    // `onError` instead of failing opaquely inside the SDK.
    throw new Error("GEMINI_API_KEY is not set — AI lane called without an available key.");
  }
  // Passed explicitly even though the SDK auto-reads the env var, so the
  // availability gate and the client can never disagree about which key.
  const constructed = new GoogleGenAI({ apiKey });
  client = constructed;
  return constructed;
}

/** One model round-trip: optional images + optional system prompt + user text. */
export interface ModelCall {
  /** Base64 payloads + sniffed media type; omit for text-only lanes. */
  images?: { data: string; mediaType: ImageMediaType }[];
  system?: string;
  user: string;
  /** When set, turns on native JSON mode — kills the brace-match regex. */
  jsonSchema?: object;
  maxOutputTokens: number;
  /**
   * Gemini 3.x thinks by default and thinking tokens count against
   * `maxOutputTokens`, so a lane that leaves this unset can burn a short
   * budget before any answer exists. Lanes with tight budgets should pin it.
   */
  thinkingLevel?: ThinkingLevel;
}

/**
 * Support for `response_format: json_schema` varies by the routed model — a
 * custom `OPENROUTER_MODEL` override that doesn't support it will surface as
 * a call failure through the existing `retryOnce`/`warnAiFailure` path, not a
 * silent quality regression, which is the accepted trade-off named in issue
 * #104's technical-notes comment.
 */
async function callOpenRouterModel(opts: ModelCall): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set — AI lane called without an available key.");
  }

  const model = process.env.OPENROUTER_MODEL || "google/gemini-3.5-flash";

  if (opts.thinkingLevel && !warnedThinkingLevelIgnored) {
    warnedThinkingLevelIgnored = true;
    console.warn(
      "aiLane: thinkingLevel is a Gemini-only knob and has no effect over OpenRouter — " +
        "token budgets sized for a capped thinking prelude may behave differently on this path.",
    );
  }

  const userContent: Array<
    | { type: "image_url"; image_url: { url: string } }
    | { type: "text"; text: string }
  > = (opts.images ?? []).map((img) => ({
    type: "image_url",
    image_url: {
      url: `data:${img.mediaType};base64,${img.data}`,
    },
  }));

  userContent.push({
    type: "text",
    text: opts.user,
  });

  const messages: Array<{
    role: "system" | "user";
    content: string | typeof userContent;
  }> = [];

  if (opts.system) {
    messages.push({
      role: "system",
      content: opts.system,
    });
  }

  messages.push({
    role: "user",
    content: userContent,
  });

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/laanhema/distill-design-scraper",
      "X-Title": "Distill Design Scraper",
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: opts.maxOutputTokens,
      ...(opts.jsonSchema
        ? {
            response_format: {
              type: "json_schema",
              // Not `strict: true`: structureAI's STRUCTURE_SCHEMA types open-ended
              // dictionaries via `additionalProperties: { type: "string" }`
              // (componentDefinitions/sectionDescriptions keyed by node id) — a
              // shape strict JSON-schema mode can't express (every property must
              // be enumerated, additionalProperties must be exactly false).
              // Non-strict still upgrades the request from a shapeless
              // json_object to schema-guided output on providers that honor it,
              // and Zod remains the real gate either way (parseJsonLoose never
              // validates shape — see its doc comment below).
              json_schema: { name: "distill_ai_response", schema: opts.jsonSchema },
            },
          }
        : {}),
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter API error (${response.status} ${response.statusText}): ${errorText}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };

  const text = data.choices?.[0]?.message?.content;
  return text && text.trim() ? text : null;
}

async function callGeminiModel(opts: ModelCall): Promise<string | null> {
  const imageParts = (opts.images ?? []).map((img) => ({
    // Raw base64 — no data-URL prefix.
    inlineData: { mimeType: img.mediaType, data: img.data },
  }));

  const response = await getClient().models.generateContent({
    // Restores the Phase-5-specced override that was never built; AI_MODEL stays the default.
    model: process.env.GEMINI_MODEL || AI_MODEL,
    contents: [{ role: "user", parts: [...imageParts, { text: opts.user }] }],
    config: {
      maxOutputTokens: opts.maxOutputTokens,
      ...(opts.system ? { systemInstruction: opts.system } : {}),
      ...(opts.thinkingLevel ? { thinkingConfig: { thinkingLevel: opts.thinkingLevel } } : {}),
      // Native JSON mode is all-or-nothing: the mime type and the schema go
      // together, and `responseSchema` (the legacy field) is never set —
      // supplying both is an error. Call sites never build `config`, so they
      // can't get this pairing wrong.
      ...(opts.jsonSchema
        ? { responseMimeType: "application/json", responseJsonSchema: opts.jsonSchema }
        : {}),
    },
  });

  const text = response.text;
  return text && text.trim() ? text : null;
}

/**
 * The single model round-trip for every AI lane. Returns `null` only for the
 * "call succeeded but produced no usable text" case — SDK/network/auth errors
 * deliberately propagate, because `retryOnce`'s `onError` is the only place an
 * AI failure becomes visible, and a swallowed 401/429 would be
 * indistinguishable from a quality regression.
 */
export async function callModel(opts: ModelCall): Promise<string | null> {
  if (process.env.OPENROUTER_API_KEY) {
    return callOpenRouterModel(opts);
  }
  return callGeminiModel(opts);
}

/**
 * JSON mode should return clean JSON; a fence or a chatty preamble is still
 * possible, so fall back to the outermost brace match before giving up. The
 * one shared JSON extractor for every AI lane — the ΔE-matcher precedent from
 * `roleMatch.ts` / `styleMatch.ts`, applied to model output.
 *
 * This only gets *some* object out of the text; it never validates shape. Zod
 * remains the real gate at every call site.
 */
export function parseJsonLoose(text: string | null): unknown | null {
  if (!text || !text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    // Fall through to the brace match below.
  }
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (!braceMatch) return null;
  try {
    return JSON.parse(braceMatch[0]);
  } catch {
    return null;
  }
}

/**
 * One repair retry, then graceful `null` — the shared fallback policy across
 * every AI lane. `onError` lets a caller log the failure without changing the
 * retry shape itself.
 */
export async function retryOnce<T>(
  fn: () => Promise<T | null>,
  onError?: (err: unknown, attempt: 1 | 2) => void,
): Promise<T | null> {
  let result = await fn().catch((err) => {
    onError?.(err, 1);
    return null;
  });
  if (!result) {
    result = await fn().catch((err) => {
      onError?.(err, 2);
      return null;
    });
  }
  return result;
}

/**
 * Log a structured warning for AI-lane failures, distinguishing 429 rate limits
 * from 400 bad requests or other errors.
 */
export function warnAiFailure(laneName: string, attempt: 1 | 2, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  let detail = "error";
  if (
    msg.includes("429") ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.includes("Quota") ||
    msg.includes("rate limit")
  ) {
    detail = "429 Rate Limit / Quota Exceeded";
  } else if (
    msg.includes("400") ||
    msg.includes("INVALID_ARGUMENT") ||
    msg.includes("BadRequest")
  ) {
    detail = "400 Bad Request";
  }
  console.warn(`${laneName} failed (${detail}, attempt ${attempt}):`, err);
}
