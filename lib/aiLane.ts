/**
 * Shared primitives for every AI-backed lane (interpretation, DOM-based
 * structure labelling, vision-based structure inference) — one model id, one
 * availability check, one request primitive, one JSON parser, and one retry
 * policy, so the three lanes can't drift out of sync with each other. This is
 * also the only file in the codebase that talks to a model provider: a lane
 * that needs a model round-trip calls `callModel`, never `fetch`. The one
 * provider is OpenRouter, reached over plain `fetch`, so there is no model
 * SDK in the dependencies.
 */

import type { ImageMediaType } from "@/lib/extract/imageMediaType";

/** True when a live AI lane call is possible (an OpenRouter API key is configured). */
export function aiLaneAvailable(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY);
}

/** One model round-trip: optional images + optional system prompt + user text. */
export interface ModelCall {
  /** Base64 payloads + sniffed media type; omit for text-only lanes. */
  images?: { data: string; mediaType: ImageMediaType }[];
  system?: string;
  user: string;
  /** When set, the request carries it as a non-strict `response_format: json_schema`. */
  jsonSchema?: object;
  /**
   * Sent as `max_tokens`. No thinking cap is sent with it, and a model that
   * thinks before it answers spends this budget on both, so size it for the
   * thinking prelude plus the answer.
   */
  maxOutputTokens: number;
}

/**
 * The single model round-trip for every AI lane: one `POST` to OpenRouter's
 * `/chat/completions`, which routes to `OPENROUTER_MODEL` (a Gemini model by
 * default). Returns `null` only for the "call succeeded but produced no usable
 * text" case — network/auth errors and non-2xx responses deliberately
 * propagate, because `retryOnce`'s `onError` is the only place an AI failure
 * becomes visible, and a swallowed 401/429 would be indistinguishable from a
 * quality regression.
 *
 * Support for `response_format: json_schema` varies by the routed model — a
 * custom `OPENROUTER_MODEL` override that doesn't support it will surface as
 * a call failure through the existing `retryOnce`/`warnAiFailure` path, not a
 * silent quality regression, which is the accepted trade-off named in issue
 * #104's technical-notes comment.
 */
export async function callModel(opts: ModelCall): Promise<string | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    // Thrown rather than sending a keyless request, so a caller that skipped
    // `aiLaneAvailable()` surfaces through `retryOnce`'s `onError`.
    throw new Error("OPENROUTER_API_KEY is not set — AI lane called without an available key.");
  }

  const model = process.env.OPENROUTER_MODEL || "google/gemini-3.5-flash";

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

  const reply: unknown = await response.json();
  return firstChoiceText(reply);
}

/**
 * The text of `choices[0].message.content` in a chat-completions reply, or
 * `null` when that path is missing or holds no text. The reply is untyped
 * provider output, so each step is narrowed before it is read.
 *
 * Two shapes throw rather than read as "no text", so that they reach
 * `retryOnce`'s `onError` like any other failed call: a `null` body, and a
 * `content` that is set but is no string.
 */
function firstChoiceText(reply: unknown): string | null {
  if (reply === null) throw new Error("OpenRouter reply is null, not a JSON object.");
  if (typeof reply !== "object" || !("choices" in reply)) return null;

  const choices = reply.choices;
  if (typeof choices !== "object" || choices === null || !("0" in choices)) return null;

  const first = choices[0];
  if (typeof first !== "object" || first === null || !("message" in first)) return null;

  const message = first.message;
  if (typeof message !== "object" || message === null || !("content" in message)) return null;

  const content = message.content;
  if (typeof content === "string") return content.trim() ? content : null;
  if (content) throw new Error("OpenRouter reply's message content is not a string.");
  return null;
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
