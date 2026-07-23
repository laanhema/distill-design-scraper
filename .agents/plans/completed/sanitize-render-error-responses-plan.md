# Plan: Sanitize render-path error responses and annotate injection surfaces

## Summary

Stop leaking raw internal error messages (`err.message`) from the analyze route's catch-all 502 branch: log the full error server-side and return a fixed, generic message to the client. Separately, add code comments documenting the two known prompt-injection surfaces — page-controlled text flowing into the Stage-7 structure labelling prompt, and page/upload pixels flowing into the two vision-call sites — noting in each that Zod schema validation bounds the impact to mislabeled report content. This is hardening + documentation, not a live-vulnerability fix (the review found no XSS path).

## User Story

As an operator
I want raw internal error messages kept out of client responses and known prompt-injection surfaces documented in code
So that internal details don't leak and future maintainers don't unknowingly widen the injection blast radius.

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT (hardening + documentation) |
| Complexity | LOW |
| Systems Affected | API route error handling; AI-lane call sites (comments only) |
| GitHub Issue | #27 |

---

## Patterns to Follow

### Error handling — intentional error types keep their messages; only the catch-all changes

```ts
// SOURCE: app/api/analyze/route.ts:229-242
} catch (err) {
    if (err instanceof UnsafeUrlError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
    }
    // Degenerate image upload (fully transparent / unreadable): the input is
    // at fault, not the pipeline — answer with an actionable 422, not a 502.
    if (err instanceof DegenerateImageError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: 422 });
    }
    // §9: surface a clear error, never fabricate results.
    const message =
      err instanceof Error ? err.message : "Unknown rendering error.";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
}
```

`UnsafeUrlError` / `DegenerateImageError` / `RateLimitExceededError` messages are deliberately client-facing and actionable — they stay. Only the final generic branch currently reflects raw `err.message` to the client and must be sanitized.

### Server-side logging convention

```ts
// SOURCE: app/api/analyze/route.ts:200
console.warn("Structure extraction error:", err);
```

The codebase logs `console.warn(<label>, err)` with the raw error object. For the terminal 502 (an actual failure, not a degraded-mode fallback), use `console.error` with the same shape.

### Comment style at AI call sites — explains what data flows into the model and what bounds the blast radius

```ts
// SOURCE: lib/interpret.ts:187-188
// Structured outputs / a refusal / truncation can still leave us without a
// clean JSON text block — Zod is the gate, not the model's word.
```

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `app/api/analyze/route.ts` | UPDATE | Generic 502 message to client; raw error to server logs |
| `lib/extract/structure/structureAI.ts` | UPDATE | Comment: page-controlled text enters the labelling prompt; Zod bounds impact |
| `lib/interpret.ts` | UPDATE | Comment: page/upload pixels (may contain adversarial rendered text) enter the vision call; Zod bounds impact |
| `lib/extract/structureFromImage.ts` | UPDATE | Same pixel-injection note at its vision call site |

---

## Tasks

### Task 1: Sanitize the catch-all 502 response

- **File**: `app/api/analyze/route.ts`
- **Action**: UPDATE (lines ~238-241, inside the final `catch`)
- **Implement**: Replace the `const message = err instanceof Error ? err.message : "Unknown rendering error.";` + response with:
  1. `console.error("Analyze pipeline error:", err);` — full raw error (message + stack) to server logs only.
  2. Return a fixed generic string to the client, e.g. `"Analysis failed due to an internal error. Please try again."`, still `{ ok: false, error: <generic> }` with status 502.
  Keep the `UnsafeUrlError`, `DegenerateImageError`, and rate-limit branches untouched — those messages are intentional, client-actionable, and contain no internals. Update/keep the `§9` comment to note the raw message is logged, not returned, so internals don't leak (issue #27 / review S6).
- **Mirror**: `app/api/analyze/route.ts:199-201` for the `console.<level>("<label>:", err)` logging shape.
- **Validate**: `npm run typecheck && npm run lint`

### Task 2: Annotate the text-injection surface in the structure labelling prompt

- **File**: `lib/extract/structure/structureAI.ts`
- **Action**: UPDATE (comment only — no behavior change)
- **Implement**: Immediately above the `const prompt = ...` template (line ~51), add a comment stating: the compact tree embeds page-controlled strings (`textSnippet`, tag names, landmarks, provisional names harvested from the rendered page), so a hostile page can attempt prompt injection through its own content; the blast radius is bounded because the response must parse as JSON and pass `aiStructureResponseSchema` (ontology types constrained to the `ONTOLOGY_TYPES` enum), so the worst case is mislabeled component names/types in the report — never code execution or data exfiltration; any parse/validation failure falls back to heuristic naming. Reference issue #27 / review S6 so future maintainers know why the note exists.
- **Mirror**: comment tone of `lib/interpret.ts:187-188`.
- **Validate**: `npm run typecheck && npm run lint`

### Task 3: Annotate the pixel-injection surface at both vision call sites

- **Files**: `lib/interpret.ts` (above the `imageBlocks` construction, ~line 153, in `requestOnce`) and `lib/extract/structureFromImage.ts` (above its `imageBlocks` construction, ~line 176)
- **Action**: UPDATE (comments only — no behavior change)
- **Implement**: At each site, add the equivalent note: the screenshot/upload pixels are page-/user-controlled and can carry adversarial rendered text ("ignore previous instructions…") straight into the vision model; impact is bounded by Zod validation of the response (`aiResponseSchema` / the structure-node schema) plus the graceful-null fallback, so injection can at worst skew inferred labels/mood — flag that widening what these responses can drive would widen the injection blast radius. Reference issue #27 / review S6.
- **Mirror**: Task 2's comment.
- **Validate**: `npm run typecheck && npm run lint`

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Extraction regression gate (should be untouched — no extractor logic changed)
npm run eval
```

---

## End-to-End Verification

Exercise the sanitized 502 path against a real render failure that gets past the SSRF guard:

1. Start the dev server: `npm run dev`.
2. Trigger a genuine render failure on an allowlisted host with nothing listening:
   ```bash
   SSRF_ALLOWLIST_HOSTS=localhost npm run dev   # (restart dev with allowlist)
   curl -s -X POST http://localhost:3000/api/analyze \
     -H 'content-type: application/json' \
     -d '{"url":"http://localhost:9","mode":"tokens"}'
   ```
3. **Expected**: HTTP 502 with the fixed generic message — no `net::ERR_CONNECTION_REFUSED` / Playwright internals in the response body — while the dev-server terminal shows the full raw error via `console.error`.
4. Also confirm intentional errors still pass through: POST `{"url":"http://127.0.0.1"}` without the allowlist → 400 with the `UnsafeUrlError` message intact.

(If running a dev server is impractical in the environment, an equivalent scratch script may POST against `next start`, or the two catch branches can be verified by direct inspection plus typecheck — but prefer the live check.)

---

## Acceptance Criteria

- [ ] Render-path failure returns a generic client message; raw `err.message`/stack goes to server logs only (`app/api/analyze/route.ts` catch-all)
- [ ] `lib/extract/structure/structureAI.ts` carries a comment stating page-controlled text flows into the labelling prompt and Zod/schema constraints bound impact to mislabeled report content
- [ ] Equivalent notes exist where page pixels enter vision calls (`lib/interpret.ts`, `lib/extract/structureFromImage.ts`)
- [ ] `npm run typecheck`, `npm run lint`, `npm run eval` all pass
- [ ] Intentional error types (`UnsafeUrlError`, `DegenerateImageError`, rate-limit 429) still return their own messages
