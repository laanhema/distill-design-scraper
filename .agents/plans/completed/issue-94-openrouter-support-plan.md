# Plan: Add OpenRouter API support in lib/aiLane.ts

## Summary

Add support for OpenRouter API (`OPENROUTER_API_KEY`) to `lib/aiLane.ts` as an alternative vision AI model provider alongside `GEMINI_API_KEY`. When `OPENROUTER_API_KEY` is present, `aiLaneAvailable()` returns `true` and `callModel` dispatches HTTP POST requests to OpenRouter's OpenAI-compatible Chat Completions endpoint (`https://openrouter.ai/api/v1/chat/completions`).

## User Story

As a developer or user
I want `lib/aiLane.ts` to support `OPENROUTER_API_KEY`
So that vision AI tasks can run via OpenRouter models without being blocked by Google AI Studio rate limits.

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT |
| Complexity | LOW |
| Systems Affected | `lib/aiLane.ts` |
| GitHub Issue | #94 |

---

## Patterns to Follow

### Availability & Key Checking
```typescript
// SOURCE: lib/aiLane.ts:24-26
export function aiLaneAvailable(): boolean {
  return Boolean(process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY);
}
```

### Model Dispatch & Fallback
```typescript
// SOURCE: lib/aiLane.ts:75-100
export async function callModel(opts: ModelCall): Promise<string | null> {
  if (process.env.OPENROUTER_API_KEY) {
    return callOpenRouterModel(opts);
  }
  // Fall back to Gemini SDK if GEMINI_API_KEY is available
  return callGeminiModel(opts);
}
```

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/aiLane.ts` | UPDATE | Add OpenRouter API provider, `aiLaneAvailable()` check for `OPENROUTER_API_KEY`, and `callOpenRouterModel` helper. |

---

## Tasks

### Task 1: Update `aiLaneAvailable()` and add OpenRouter Chat Completions integration in `lib/aiLane.ts`

- **File**: `lib/aiLane.ts`
- **Action**: UPDATE
- **Implement**:
  1. Update `aiLaneAvailable()` to return `Boolean(process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY)`.
  2. Implement `callOpenRouterModel(opts: ModelCall): Promise<string | null>`:
     - Determine model ID: `process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash"`.
     - Construct OpenAI-compatible Chat Completions request payload:
       - `messages`: include `system` prompt (if present) as `{ role: "system", content: opts.system }`.
       - `user` content array containing `{ type: "image_url", image_url: { url: "data:" + img.mediaType + ";base64," + img.data } }` for each image, plus `{ type: "text", text: opts.user }`.
       - `max_tokens`: `opts.maxOutputTokens`.
       - `response_format`: `opts.jsonSchema ? { type: "json_object" } : undefined`.
     - Send `POST` to `https://openrouter.ai/api/v1/chat/completions` with headers `Authorization: Bearer ${process.env.OPENROUTER_API_KEY}` and `Content-Type: application/json`.
     - Handle response: if `!response.ok`, throw Error with HTTP status text/body (so `warnAiFailure` catches rate limits / bad requests).
     - Extract text from `json.choices?.[0]?.message?.content`. Return `null` if empty.
  3. Route `callModel` to `callOpenRouterModel` if `process.env.OPENROUTER_API_KEY` is set, otherwise use Gemini SDK. If neither key is set, throw an explicit error for `callModel` or return `null` gracefully when unkeyed calls occur.
- **Validate**: `npm run typecheck && npm run lint`

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint
```

## End-to-End Verification

1. Run `npm run typecheck` to verify TypeScript types compile without error.
2. Run `npm run lint` to verify ESLint passes cleanly.
3. Test keyless and `OPENROUTER_API_KEY` execution in a small node script or unit test to verify payload formatting and graceful degradation.

---

## Risks

| Risk | Mitigation |
|------|------------|
| Neither `GEMINI_API_KEY` nor `OPENROUTER_API_KEY` is present | `aiLaneAvailable()` returns `false`, preventing callers from attempting AI model calls. |
| OpenRouter HTTP request error (e.g. 429 or 400) | Throw an `Error` containing status code and response body so `warnAiFailure` and `retryOnce` handle retries / logging correctly. |

---

## Acceptance Criteria

- [ ] Given `OPENROUTER_API_KEY` is set in environment variables, when `aiLaneAvailable()` is called, then it returns `true`.
- [ ] Given `callModel(opts)` is invoked with `OPENROUTER_API_KEY` set, when making the API call, then it sends an OpenAI-compatible Chat Completions request to `https://openrouter.ai/api/v1/chat/completions` with base64 data-URL image parts, system instructions, and JSON response format options.
- [ ] Given `process.env.OPENROUTER_MODEL` is set, when `callModel` runs via OpenRouter, then it uses the specified model ID (defaulting to `google/gemini-2.5-flash`).
- [ ] Given neither `OPENROUTER_API_KEY` nor `GEMINI_API_KEY` is set, when `aiLaneAvailable()` is called, then it returns `false`.
- [ ] Given `npm run typecheck` and `npm run lint`, when run, then both pass with zero errors.
