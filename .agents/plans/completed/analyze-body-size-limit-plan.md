# Plan: Enforce a request body size limit on /api/analyze (DIST-012)

## Summary

`POST /api/analyze` currently calls `request.json()` with no size check, so an attacker-sized body is fully buffered and its base64 image payloads flow into `sharp` / the palette pipeline before any bound applies. Add an explicit body-size gate at the very top of the handler: reject on a declared oversized `Content-Length` immediately, and otherwise read the body stream incrementally, cancelling and returning **413** the moment the running byte count exceeds a named limit — before `JSON.parse`, before base64 decode, before `sharp` or Playwright. The limit is a named constant derived from `MAX_IMAGES` × a per-image payload ceiling, with a comment stating the rationale (issue acceptance criterion). Next.js App Router route handlers do not apply the legacy `bodyParser` size config, so this must be enforced by hand (per issue technical notes).

## User Story

As an operator
I want oversized request bodies rejected before any processing
So that attacker-controlled buffers never reach `sharp` or the palette pipeline unchecked

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT (security hardening) |
| Complexity | LOW |
| Systems Affected | `app/api/analyze/route.ts` only |
| GitHub Issue | #18 (DIST-012) |

---

## Patterns to Follow

### Named caps with rationale comments (route-local constant)

```ts
// SOURCE: app/api/analyze/route.ts:17-19
// Bound the measured-lane palette merge; the AI lane applies its own, tighter
// cap (MAX_INTERPRET_IMAGES in lib/interpret.ts) on top of whatever's accepted here.
const MAX_IMAGES = 6;
```

### Pre-parse error responses (plain `{ error }`, no `ok` field)

```ts
// SOURCE: app/api/analyze/route.ts:44-49
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON." },
      { status: 400 },
    );
  }
```

(Post-validation errors later in the handler use `{ ok: false, error }`; the pre-parse gate follows the pre-parse shape above, matching the existing 400s.)

### Tests

No unit test framework exists. `npm run eval` is the correctness gate for extraction logic and does not exercise the API route; it must simply keep passing unchanged. Manual verification of the route is done with a scratch `tsx` script that constructs `Request` objects and calls the exported `POST` directly (run from the project root, deleted afterwards) — see Validation.

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `app/api/analyze/route.ts` | UPDATE | Add body-size constants + streaming limit check before JSON parse; return 413 when exceeded |

---

## Tasks

### Task 1: Add the size-limit constants

- **File**: `app/api/analyze/route.ts`
- **Action**: UPDATE
- **Implement**: Below the existing `MAX_IMAGES` constant add:

  ```ts
  // Request-body ceiling, sized from what a legitimate request can carry:
  // MAX_IMAGES uploads, each base64-encoded (≈4/3 inflation), at a generous
  // per-image wire ceiling. 8 MiB of encoded payload per image ≈ 6 MiB of raw
  // image — far above any real design screenshot — and absorbs the JSON
  // envelope (url/mode/names) riding along. Anything larger gets a 413 before
  // JSON.parse / base64 decode, so attacker-sized buffers never reach sharp,
  // the palette pipeline, or Playwright. App Router route handlers don't apply
  // the legacy `bodyParser` size config, so this is enforced explicitly.
  const MAX_IMAGE_PAYLOAD_BYTES = 8 * 1024 * 1024;
  const MAX_REQUEST_BODY_BYTES = MAX_IMAGES * MAX_IMAGE_PAYLOAD_BYTES;
  ```

- **Mirror**: `app/api/analyze/route.ts:17-19` — named cap + rationale-comment style
- **Validate**: `npm run typecheck`

### Task 2: Add a bounded body reader and wire it into `POST`

- **File**: `app/api/analyze/route.ts`
- **Action**: UPDATE
- **Implement**: Add a module-level helper:

  ```ts
  /** Reads the request body, enforcing MAX_REQUEST_BODY_BYTES. Returns null
   *  when the limit is exceeded (declared via Content-Length, or observed
   *  while streaming — chunked bodies carry no Content-Length, so the header
   *  alone can't be trusted to exist or be honest). */
  async function readBodyWithinLimit(request: Request): Promise<string | null>
  ```

  Behavior:
  1. If `Content-Length` parses to a finite number > `MAX_REQUEST_BODY_BYTES`, return `null` without touching the stream.
  2. If `request.body` is null, return `""`.
  3. Otherwise `getReader()` and accumulate `Uint8Array` chunks, tracking total `byteLength`; the moment the total exceeds the limit, `await reader.cancel()` and return `null` (stop consuming — never buffer the rest).
  4. On normal completion, decode with `Buffer.concat(chunks).toString("utf8")` and return the string.

  In `POST`, replace the `await request.json()` block with:

  ```ts
  const rawBody = await readBodyWithinLimit(request);
  if (rawBody === null) {
    return NextResponse.json(
      { error: `Request body exceeds the ${MAX_REQUEST_BODY_BYTES}-byte limit.` },
      { status: 413 },
    );
  }
  let body: AnalyzeBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON." },
      { status: 400 },
    );
  }
  ```

  Everything downstream (alias merge, cache, rate limit, analyze calls) is untouched — the gate sits strictly before any decode/processing.
- **Mirror**: `app/api/analyze/route.ts:40-49` — existing parse/error shape
- **Validate**: `npm run typecheck`

### Task 3: Manual verification (scratch script, then delete)

- **File**: `/tmp/claude-.../scratchpad` NOT usable for tsx module resolution — create `scripts-scratch-body-limit.ts` in the project root instead, run with `npx tsx` from the project root, then delete it (per CLAUDE.md scratch-script policy).
- **Implement**: Import `{ POST }` from `@/app/api/analyze/route` (importing does not launch Chromium/sharp work) and assert:
  1. Body of `MAX_REQUEST_BODY_BYTES + 1` bytes (e.g. one big string, chunked stream or plain) → response status **413**.
  2. Oversized declared `Content-Length` header with a tiny actual body → **413** (header fast-path).
  3. Small invalid-JSON body → **400** "must be JSON" (unchanged behavior).
  4. Small valid body with neither `url` nor `images` → **400** "Missing 'url' or 'images'" (proves parsing path intact; no network/sharp touched).
- **Validate**: script output shows all four expectations met; script deleted afterwards.

---

## Validation

```bash
npm run typecheck        # must pass
npm run lint             # known to fail non-interactively (no ESLint config) — pre-existing condition
npm run eval             # regression gate; must pass unchanged (route not exercised, but it is the project gate)
```

---

## Risks

| Risk | Mitigation |
|------|------------|
| `request.json()` semantics change (e.g. content-type quirks) | We only swap the read+parse mechanics; `JSON.parse` on the raw text matches `request.json()` behavior for all bodies the route previously accepted |
| Chunked bodies without `Content-Length` bypass a header-only check | Streaming accumulation is the primary enforcement; the header check is just a fast-path |
| Limit too small for legitimate 6-image uploads | 8 MiB encoded per image ≈ 6 MiB raw per image; the frontend sends FileReader data-URLs of screenshots, comfortably below this |
| `reader.cancel()` rejection on abort | `await` inside the helper; any throw propagates to the route's existing outer behavior (pre-try section — wrap cancel in the helper so a cancel failure still returns null) |

---

## Acceptance Criteria

- [ ] Oversized body → 413 without invoking `sharp` or Playwright
- [ ] Legitimate 6-image upload within the limit → behavior unchanged
- [ ] Limit is a named constant sized from `MAX_IMAGES` × per-image ceiling, with rationale comment
- [ ] `npm run typecheck` passes; `npm run eval` passes unchanged
