# Plan: TODO-6: Validate the `/api/analyze` request body

## Summary

`POST /api/analyze` currently assigns the unvalidated output of `JSON.parse` directly to `AnalyzeBody`, allowing malformed requests (`null`, `{"url":123}`, `{"images":[null]}`) to throw unhandled `TypeError` exceptions out of the handler resulting in framework 500 responses, `{"images":"abc"}` and `{"images":[{"data":5}]}` to fail deep in the pipeline returning 502, and unrecognized `mode` values to produce degraded 200 responses that get cached. Per GitHub issue #170 (finding H1 in `.agents/reviews/codebase-analysis-review.md`), this plan replaces the unvalidated assignment with a strict Zod `safeParse` pass on `rawJson: unknown` before any request field is accessed. Malformed requests are rejected with a 400 Bad Request response explicitly naming the invalid field path. Furthermore, the `mode` schema defaults to `"both"`, rejects unknown values with a 400 preventing unwanted cache poisoning, and exports the inferred `AnalyzeMode` type once to replace the duplicate literal union in `lib/analyze.ts:185` and `:335`.

## User Story

As an API consumer or web workbench user
I want `POST /api/analyze` to validate the request payload against a typed schema before execution
So that malformed requests receive clear, actionable 400 errors naming invalid fields, rather than crashing with 500s or returning generic 502s or degraded cached 200s.

## Metadata

| Field | Value |
|-------|-------|
| Type | BUG_FIX |
| Complexity | MEDIUM |
| Systems Affected | `app/api/analyze/route.ts`, `lib/analyze.ts` |
| GitHub Issue | #170 (Finding H1 in `.agents/reviews/codebase-analysis-review.md:18`, TODO-6 in `.agents/issues/todo-issues.md:245`) |
| PRD Phase | N/A |
| Prototype Patch | N/A |

---

## Environment Findings

Baseline was verified on `main` at `d52d89c` before planning:

| Probe | Result |
|-------|--------|
| `npm run typecheck` | Clean (no output from `tsc --noEmit`) |
| `npm run lint` | Clean (no output from `eslint .`) |
| `npm run eval` | Aggregate combined: 100%, all gates passed (`clean-light`, `dark-mode`, `adversarial-shell`) |
| `npm run build` | Next.js 15.5.20 compiled successfully in 3.4s, 4/4 static pages generated |
| Test framework | None (per `AGENTS.md`). `npm run eval` is the offline correctness gate; `/verify` provides E2E verification |
| Working tree state | Clean (`## main...origin/main`) |

Start green, stay green: all verification commands must pass unchanged after implementation.

---

## Evidence & Bug Reproduction

A headless probe invoking `POST` in `app/api/analyze/route.ts` directly on `HEAD` confirmed all reported failure modes:

| Test Payload | HEAD Response / Behavior | Observed Error / Symptom | Expected Response |
|--------------|--------------------------|---------------------------|-------------------|
| `null` | Uncaught `TypeError` (HTTP 500) | `Cannot read properties of null (reading 'url')` at `route.ts:104` | 400 naming `body` |
| `{"url": 123}` | Uncaught `TypeError` (HTTP 500) | `body.url?.trim is not a function` at `route.ts:104` | 400 naming `url` |
| `{"images": [null]}` | Uncaught `TypeError` (HTTP 500) | `Cannot read properties of null (reading 'data')` at `route.ts:120` | 400 naming `images.0` |
| `{"images": "abc"}` | HTTP 502 Internal Error | `TypeError: Cannot read properties of undefined (reading 'replace')` in `stripDataUrlPrefix` | 400 naming `images` |
| `{"images": [{"data": 5}]}` | HTTP 502 Internal Error | `TypeError: image.replace is not a function` in `stripDataUrlPrefix` | 400 naming `images.0.data` |
| `{"url": "...", "mode": "invalid"}` | HTTP 200 Degraded & Cached | Unknown mode bypasses structure & AI checks and caches degraded report | 400 naming `mode` |

Reproduction command (run from project root):
```bash
npx tsx -e 'import { POST } from "./app/api/analyze/route"; async function test() { const cases = ["null", JSON.stringify({url:123}), JSON.stringify({images:[null]}), JSON.stringify({images:"abc"}), JSON.stringify({images:[{data:5}]}), JSON.stringify({url:"https://example.com",mode:"invalid"})]; for (const c of cases) { const r = await POST(new Request("http://localhost/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: c })); if (r.status !== 400) throw new Error(`expected 400, got ${r.status}`); } console.log("All 6 malformed payloads returned 400"); } test();'
```
*Current state on HEAD*: Exits with code 1 (`TypeError: Cannot read properties of null (reading 'url')`).
*Target state after fix*: Exits with code 0 ("All 6 malformed payloads returned 400").

---

## Patterns to Follow

### Schema & Inferred Types Pattern

```typescript
// SOURCE: lib/schema.ts:14-16, 47-49
export const PROVENANCE = ["measured", "inferred", "ai"] as const;
export const provenanceSchema = z.enum(PROVENANCE);

export const COLOR_ROLES = [ ... ] as const;
export type ColorRole = (typeof COLOR_ROLES)[number];
export const colorRoleSchema = z.enum(COLOR_ROLES);
```

### Route 400 Error Pattern

```typescript
// SOURCE: app/api/analyze/route.ts:98-101, 113-118
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON." },
      { status: 400 },
    );
  }

  if (!url && images.length === 0) {
    return NextResponse.json(
      { error: "Missing 'url' or 'images' in request body." },
      { status: 400 },
    );
  }
```

### Route Request Validation Pattern to Apply

```typescript
// Pattern to implement in app/api/analyze/route.ts
  let rawJson: unknown;
  try {
    rawJson = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: "Request body must be JSON." },
      { status: 400 },
    );
  }

  const parsed = analyzeBodySchema.safeParse(rawJson);
  if (!parsed.success) {
    const error = parsed.error.issues
      .map((i) => `Invalid ${i.path.length > 0 ? i.path.join(".") : "body"}: ${i.message}`)
      .join("; ");
    return NextResponse.json({ error }, { status: 400 });
  }

  const body = parsed.data;
```

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/analyze.ts` | UPDATE | Export `modeSchema` and inferred `AnalyzeMode` type (or import from `route.ts`), and replace the repeated literal union `"tokens" \| "structure" \| "both"` at lines 185 and 335 |
| `app/api/analyze/route.ts` | UPDATE | Define `analyzeBodySchema` with Zod, parse `rawBody` as `unknown`, validate with `analyzeBodySchema.safeParse(rawJson)`, return 400 naming invalid field on failure, and use validated body |

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Unify and Export `AnalyzeMode` Type

- **File**: `lib/analyze.ts`
- **Action**: UPDATE
- **Implement**:
  1. Define and export `modeSchema = z.enum(["tokens", "structure", "both"])` and `export type AnalyzeMode = z.infer<typeof modeSchema>`.
  2. In `analyzeImages` (line 185), replace `mode: "tokens" | "structure" | "both" = "tokens"` with `mode: AnalyzeMode = "tokens"`.
  3. In `analyzeUrl` (line 335), replace `mode: "tokens" | "structure" | "both" = "both"` with `mode: AnalyzeMode = "both"`.
- **Mirror**: `lib/schema.ts:14-16` (enum and schema export) and `lib/schema.ts:47-49` (`ColorRole` export).
- **Validate**: `npm run typecheck`

### Task 2: Validate Request Body with Zod in `app/api/analyze/route.ts`

- **File**: `app/api/analyze/route.ts`
- **Action**: UPDATE
- **Implement**:
  1. Import `z` from `"zod"` and import `modeSchema` / `AnalyzeMode` from `@/lib/analyze`.
  2. Define `analyzeBodySchema`:
     ```typescript
     const imageEntrySchema = z.object({
       data: z.string(),
       name: z.string().optional(),
     });

     const analyzeBodySchema = z.object({
       url: z.string().optional(),
       image: z.string().optional(),
       imageName: z.string().optional(),
       images: z.array(imageEntrySchema).optional(),
       mode: modeSchema.default("both"),
       forceRefresh: z.boolean().optional(),
     });
     type AnalyzeBody = z.infer<typeof analyzeBodySchema>;
     ```
  3. Replace the bare `body = JSON.parse(rawBody)` assignment at lines 94-96 with parsing to `rawJson: unknown`.
  4. Perform `analyzeBodySchema.safeParse(rawJson)` before reading `body.url` or `body.images`.
  5. If validation fails (`!parsed.success`), return `NextResponse.json({ error }, { status: 400 })` where `error` formats all issues, prefixing with `Invalid <field>: <message>` (using `path.join(".")` or `"body"` when path is empty).
  6. Assign `const body = parsed.data;`. Continue through existing logic (lines 104-111) merging legacy `image`/`imageName` into `images`.
- **Mirror**: `app/api/analyze/route.ts:98-101` (400 JSON error shape) and `lib/extract/structure/structureAI.ts:1-14` (Zod schema definition style).
- **Validate**:
  ```bash
  npx tsx -e 'import { POST } from "./app/api/analyze/route"; async function test() { const cases = ["null", JSON.stringify({url:123}), JSON.stringify({images:[null]}), JSON.stringify({images:"abc"}), JSON.stringify({images:[{data:5}]}), JSON.stringify({url:"https://example.com",mode:"invalid"})]; for (const c of cases) { const r = await POST(new Request("http://localhost/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: c })); if (r.status !== 400) throw new Error(`expected 400, got ${r.status}`); } console.log("All 6 malformed payloads returned 400"); } test();'
  ```

### Task 3: Regression Gate and Build Verification

- **File**: N/A (Verification)
- **Action**: TEST
- **Implement**: Run all project regression gates to ensure zero regressions across offline eval, typechecking, linting, and Next.js production build.
- **Validate**: `npm run check` (runs `typecheck` → `lint` → `build` → `eval`)

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Offline Extraction Evaluation Gate
npm run eval

# Production Build
npm run build

# Full Combined Check (CI gate)
npm run check

# Reproduction (BUG_FIX: Red on unfixed HEAD, Green after Task 2)
npx tsx -e 'import { POST } from "./app/api/analyze/route"; async function test() { const cases = ["null", JSON.stringify({url:123}), JSON.stringify({images:[null]}), JSON.stringify({images:"abc"}), JSON.stringify({images:[{data:5}]}), JSON.stringify({url:"https://example.com",mode:"invalid"})]; for (const c of cases) { const r = await POST(new Request("http://localhost/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: c })); if (r.status !== 400) throw new Error(`expected 400, got ${r.status}`); } console.log("All 6 malformed payloads returned 400"); } test();'
```

---

## End-to-End Verification

1. **Verify stack setup**:
   ```bash
   # Ensure no existing dev server is running
   .claude/skills/verify/scripts/verify.sh down 2>/dev/null || true
   # Start the verify fixture and dev servers
   .claude/skills/verify/scripts/verify.sh up
   ```
2. **Execute verification scenarios**:
   - Error handling scenario:
     ```bash
     npx tsx .claude/skills/verify/scripts/drive.ts error
     ```
     *Expected*: Confirms error banner displays properly and API responds with status 400 without crashing.
   - Live URL analysis scenario:
     ```bash
     npx tsx .claude/skills/verify/scripts/drive.ts analyze-url
     ```
     *Expected*: Confirms standard URL analysis responds 200 OK and renders design system.
   - Image analysis scenario:
     ```bash
     npx tsx .claude/skills/verify/scripts/drive.ts analyze-images
     ```
     *Expected*: Confirms multi-image analysis responds 200 OK and renders palette.
3. **Teardown**:
   ```bash
   .claude/skills/verify/scripts/verify.sh down
   ```
4. **Final CI check**:
   ```bash
   npm run check
   ```

---

## Risks

| Risk | Mitigation | In-Scope / Out-of-Scope |
|------|------------|-------------------------|
| Root-level non-object payloads (`null`, primitives) have empty Zod issue path (`path: []`) | When `issue.path.length === 0`, fall back to `"body"` in error formatting (e.g., `Invalid body: Expected object, received null`) so the invalid input field is always named | In-scope |
| Circular dependency if `lib/analyze.ts` imports from `app/api/analyze/route.ts` | Define and export `modeSchema` and `AnalyzeMode` in `lib/analyze.ts` where analysis orchestration is owned, importing them into `route.ts`. The dependency hierarchy remains strictly `app/ -> lib/` | In-scope |
| Breaking legacy single-image payloads (`image` / `imageName`) | Explicitly declare `image: z.string().optional()` and `imageName: z.string().optional()` in `analyzeBodySchema`, and preserve existing merging into `images` array | In-scope |
| Running `npm run build` or `npm run check` while `verify.sh up` is active corrupts `.next/` cache | Ensure `verify.sh down` is executed immediately after `drive` scenarios before running `npm run build` or `npm run check` (per `AGENTS.md`) | In-scope |
| Standardizing all error responses to `{ ok: false, error: string }` across all endpoints | Out of scope for this issue. Finding M1 (Issue #171 / TODO-7) specifically tracks adding `ok: false` across all error responses and sharing response types. For this issue, emit `{ error: string }` matching lines 99 and 115 | Out-of-scope (tracked in #171) |

---

## Open Questions

- **Question 1: Export location of `AnalyzeMode`**: Should `modeSchema` and `AnalyzeMode` be defined in `lib/analyze.ts` and imported by `route.ts`, or defined in `route.ts` and imported by `lib/analyze.ts`?
  - *Proposed default*: Define in `lib/analyze.ts` and import in `route.ts`.
  - *Rationale*: In Next.js, `lib/` modules should avoid importing from `app/` routes to prevent module cycles and to allow CLI tools (`eval/run.ts`) to use `lib/analyze` without loading route handlers.

- **Question 2: Response body format for 400 validation errors**: Should validation errors return `{ error: string }` or `{ ok: false, error: string }`?
  - *Proposed default*: Return `{ error: string }`.
  - *Rationale*: Matches the existing pre-handler 400 responses at `route.ts:99` (JSON parse error) and `route.ts:115` (missing fields). Adding `ok: false` across all error responses is explicitly owned by TODO-7 (#171).

---

## Acceptance Criteria

- [ ] The request body is parsed as `unknown` and validated with a Zod schema before any field is read.
- [ ] `null`, `{"url":123}`, `{"images":[null]}`, `{"images":"abc"}` and `{"images":[{"data":5}]}` each get a 400 that names the invalid field; none throws out of the handler or returns 502.
- [ ] An unknown `mode` gets a 400 and is not cached; an absent `mode` still defaults to `"both"`.
- [ ] The mode type is exported once and replaces the repeated literal union in `lib/analyze.ts`.
- [ ] `npm run check` and `/verify` (`error`, `analyze-url`, `analyze-images`) pass.
