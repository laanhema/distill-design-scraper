# Plan: TODO-7: Share one typed response contract between the route and the page

## Summary

`POST /api/analyze` and the workbench client in `app/page.tsx` currently share no typed contract: the page re-declares `Meta`, `Refinement` and an optional-field bag `AnalyzeResponse`, casting `res.json()` directly into it, while `app/api/analyze/route.ts` constructs untyped object literals for success responses and omits `ok: false` from four of its eight error responses (`:97`, `:107`, `:118`, `:133`). Additionally, `Refinement.from` drifted to non-optional `string` on the client while being `from?: ColorRole` on the server (`lib/interpret.ts:211`), causing unassigned swatches to render as `"undefined→…"`, and non-JSON responses (such as proxy/gateway HTML error pages) crash `res.json()` with cryptic syntax error messages. Per GitHub issue #171 (Finding M1 in `.agents/reviews/codebase-analysis-review.md:21` and TODO-7 in `.agents/issues/todo-issues.md:285`), this plan creates a type-only contract module `lib/api.ts` exporting a discriminated union `AnalyzeResponse = AnalyzeSuccess | AnalyzeFailure`, `AnalyzeMeta`, and `MAX_IMAGES = 6`. Both success payloads in `route.ts` are checked with `satisfies AnalyzeSuccess`, all error responses carry `ok: false` checked with `satisfies AnalyzeFailure`, and `page.tsx` consumes the shared types without local re-declarations or `as` casts, cleanly handling non-JSON failures and formatting role refinements.

## User Story

As a developer and workbench user
I want the API route and the frontend workbench page to share a strictly typed, single-sourced response contract
So that response payloads are typechecked at build time, runtime failures produce clean user-facing errors without JSON parser crashes, and color role transitions render without undefined artefacts.

## Metadata

| Field | Value |
|-------|-------|
| Type | REFACTOR |
| Complexity | MEDIUM |
| Systems Affected | `lib/api.ts`, `app/api/analyze/route.ts`, `app/page.tsx` |
| GitHub Issue | #171 (Finding M1 in `.agents/reviews/codebase-analysis-review.md:21`, TODO-7 in `.agents/issues/todo-issues.md:285`) |
| PRD Phase | N/A |
| Prototype Patch | N/A |

---

## Environment Findings

Baseline verified on `main` at `ecdb0e4` before planning:

| Probe | Result |
|-------|--------|
| `npm run typecheck` | Clean (0 errors from `tsc --noEmit`) |
| `npm run lint` | Clean (0 warnings or errors from `eslint .`) |
| `npm run eval` | Aggregate combined: 100%, all gates passed (`clean-light`, `dark-mode`, `adversarial-shell`) |
| `npm run build` | Next.js 15.5.20 compiled successfully in 3.8s, 4/4 static pages generated (route `/` 5.39 kB, First Load JS 108 kB) |
| Test framework | None configured (per `AGENTS.md`). `npm run eval` is the offline correctness gate; `/verify` provides E2E verification |
| Working tree state | Clean (`## main...origin/main`) |

Start green, stay green: all validation checks and verification scenarios must remain clean upon completion.

---

## Patterns to Follow

### Isolated Client-Safe Module Pattern (Zero Bundle Bleed)

```typescript
// SOURCE: lib/emitTailwind.ts:1-15
import type { Report } from "@/lib/schema";

/**
 * Placed in its own module (DIST-071) so client callers (`app/page.tsx`) do not
 * pull `js-yaml` or `reportSchema` into the browser bundle.
 */
```

### Server-Side Refinement Types

```typescript
// SOURCE: lib/interpret.ts:211-215
export interface RefinementChange {
  hex: string;
  from?: ColorRole;
  to: ColorRole;
}
```

### Route Error Response Pattern

```typescript
// SOURCE: app/api/analyze/route.ts:154-158, 259-261
  } catch (err) {
    if (err instanceof RateLimitExceededError) {
      return NextResponse.json(
        { ok: false, error: err.message },
        { status: 429, headers: { "Retry-After": String(err.retryAfterSeconds) } },
      );
    }
    throw err;
  }
```

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/api.ts` | CREATE | Single-source contract module exporting `AnalyzeResponse` (`AnalyzeSuccess` \| `AnalyzeFailure`), `AnalyzeMeta`, `RefinementChange` alias, `MAX_IMAGES = 6`, and `isAnalyzeResponse` type guard. Imports types only to prevent leaking `zod`/`js-yaml` into client bundles. |
| `app/api/analyze/route.ts` | UPDATE | Import `MAX_IMAGES`, `AnalyzeSuccess`, and `AnalyzeFailure` from `@/lib/api`. Enforce `satisfies AnalyzeSuccess` on both success responses (`:177`, `:234`) and ensure all 8 error responses return `{ ok: false, error: ... } satisfies AnalyzeFailure`. |
| `app/page.tsx` | UPDATE | Import `MAX_IMAGES`, `AnalyzeResponse`, `AnalyzeMeta`, `RefinementChange`, and `isAnalyzeResponse` from `@/lib/api`. Remove duplicate interfaces (`Meta`, `Refinement`, `AnalyzeResponse`) and duplicate `MAX_IMAGES` constant. Guard non-JSON responses with human-readable error, narrow on `ok` without `as` cast, and render refinements with optional `from` role cleanly (`r.from ? `${r.from}→` : "→"`). |

---

## Tasks

Execute in order. Each task is atomic and verifiable.

### Task 1: Create `lib/api.ts` with discriminated union contract and constants

- **File**: `lib/api.ts`
- **Action**: CREATE
- **Implement**:
  - Import `type { Report, StructureReport }` from `@/lib/schema`.
  - Import `type { RefinementChange }` from `@/lib/interpret`.
  - Export `const MAX_IMAGES = 6;`.
  - Export `interface AnalyzeMeta`:
    ```typescript
    export interface AnalyzeMeta {
      finalUrl: string;
      title: string;
      elapsedMs: number;
      bannerDismissed: boolean;
      capturedAt: string;
      viewportShot: string;
      viewportShots?: string[];
      aiApplied: boolean;
    }
    ```
  - Export `type Meta = AnalyzeMeta;` and `export type { RefinementChange };` and `export type Refinement = RefinementChange;`.
  - Export `interface AnalyzeSuccess`:
    ```typescript
    export interface AnalyzeSuccess {
      ok: true;
      report: Report;
      markdown: string;
      structureReport: StructureReport | null;
      structureUnavailableReason?: string;
      refinements: RefinementChange[];
      meta: AnalyzeMeta;
    }
    ```
  - Export `interface AnalyzeFailure`:
    ```typescript
    export interface AnalyzeFailure {
      ok: false;
      error: string;
    }
    ```
  - Export `type AnalyzeResponse = AnalyzeSuccess | AnalyzeFailure;`.
  - Export type guard `isAnalyzeResponse(data: unknown): data is AnalyzeResponse`:
    ```typescript
    export function isAnalyzeResponse(data: unknown): data is AnalyzeResponse {
      return (
        typeof data === "object" &&
        data !== null &&
        "ok" in data &&
        typeof (data as { ok: unknown }).ok === "boolean"
      );
    }
    ```
- **Mirror**: `lib/emitTailwind.ts:1-15` (type-only imports to preserve client bundle isolation).
- **Validate**: `npm run typecheck`

### Task 2: Update `app/api/analyze/route.ts` to use shared contract and enforce `satisfies`

- **File**: `app/api/analyze/route.ts`
- **Action**: UPDATE
- **Implement**:
  - Remove local `const MAX_IMAGES = 6;` at line 28.
  - Import `MAX_IMAGES`, `type AnalyzeSuccess`, and `type AnalyzeFailure` from `@/lib/api`.
  - Update all 8 error responses to include `ok: false` and `satisfies AnalyzeFailure`:
    - Line 97 (413 body size limit): `{ ok: false, error: ... } satisfies AnalyzeFailure`
    - Line 107 (400 JSON parse failure): `{ ok: false, error: "Request body must be JSON." } satisfies AnalyzeFailure`
    - Line 118 (400 schema validation failure): `{ ok: false, error } satisfies AnalyzeFailure`
    - Line 133 (400 missing url/images): `{ ok: false, error: "Missing 'url' or 'images' in request body." } satisfies AnalyzeFailure`
    - Line 155 (429 rate limit): `{ ok: false, error: err.message } satisfies AnalyzeFailure`
    - Line 260 (400 unsafe URL): `{ ok: false, error: err.message } satisfies AnalyzeFailure`
    - Line 265 (422 degenerate image): `{ ok: false, error: err.message } satisfies AnalyzeFailure`
    - Line 275 (502 internal pipeline error): `{ ok: false, error: "Analysis failed due to an internal error. Please try again." } satisfies AnalyzeFailure`
  - Update both `responsePayload` definitions to check `satisfies AnalyzeSuccess`:
    - Line 177 (`analyzeImages` branch): `const responsePayload = { ... } satisfies AnalyzeSuccess;`
    - Line 234 (`analyzeUrl` branch): `const responsePayload = { ... } satisfies AnalyzeSuccess;`
- **Mirror**: `app/api/analyze/route.ts:155-158` (error payload convention).
- **Validate**: `npm run typecheck && npm run lint`

### Task 3: Update `app/page.tsx` to consume shared contract, eliminate casts, and fix refinement formatting

- **File**: `app/page.tsx`
- **Action**: UPDATE
- **Implement**:
  - Import `MAX_IMAGES`, `type AnalyzeResponse`, `type AnalyzeMeta`, `type RefinementChange`, and `isAnalyzeResponse` from `@/lib/api`.
  - Remove local interface declarations for `Meta` (lines 7-17), `Refinement` (lines 19-23), `AnalyzeResponse` (lines 25-36), and local constant `const MAX_IMAGES = 6;` (line 49).
  - Update state definitions:
    - `const [meta, setMeta] = useState<AnalyzeMeta | null>(null);`
    - `const [refinements, setRefinements] = useState<RefinementChange[]>([]);`
  - In `analyze(e)`:
    - Replace the bare `(await res.json()) as AnalyzeResponse` and compound error guard with safe parsing:
      ```typescript
      let raw: unknown;
      try {
        raw = await res.json();
      } catch {
        throw new Error(
          `Analysis failed (${res.status}): server returned an unexpected non-JSON response.`,
        );
      }

      if (!isAnalyzeResponse(raw)) {
        throw new Error(`Analysis failed (${res.status}): unexpected response structure.`);
      }

      const data = raw;
      if (!res.ok || !data.ok) {
        throw new Error(!data.ok ? data.error : `Request failed (${res.status}).`);
      }
      ```
    - Once narrowed to `AnalyzeSuccess`, assign data directly without unnecessary optional chaining or fallbacks:
      ```typescript
      setReport(data.report);
      setMarkdown(data.markdown);
      setStructureReport(data.structureReport);
      if (!data.structureReport) {
        setTab((t) => (t === "structure" ? "preview" : t));
      }
      setStructureUnavailableReason(data.structureUnavailableReason ?? null);
      setMeta(data.meta);
      setRefinements(data.refinements);
      setStatus("done");
      ```
  - In refinement rendering (line 489-491), update the mapping to guard against undefined `r.from`:
    ```tsx
    {refinements
      .map((r) => `${r.hex} ${r.from ? `${r.from}→` : "→"}${r.to}`)
      .join(", ")}
    ```
- **Mirror**: `.agents/reviews/codebase-analysis-review.md:21` (Finding M1 prescription).
- **Validate**: `npm run typecheck && npm run lint`

### Task 4: Complete verification and regression gate

- **File**: `N/A`
- **Action**: VALIDATE
- **Implement**:
  - Run full project verification: `npm run check` (typecheck → lint → build → eval).
  - Verify First Load JS bundle size on `/` does not bloat (confirms `zod`/`js-yaml` remain unbundled on client).
  - Run `/verify` skill workflow across key scenarios:
    - `.claude/skills/verify/scripts/verify.sh up`
    - `.claude/skills/verify/scripts/verify.sh doctor`
    - `.claude/skills/verify/scripts/verify.sh drive error`
    - `.claude/skills/verify/scripts/verify.sh drive analyze-url`
    - `.claude/skills/verify/scripts/verify.sh drive analyze-images`
    - `.claude/skills/verify/scripts/verify.sh down`
- **Mirror**: `AGENTS.md: Rules & Enforcements`
- **Validate**: `npm run check`

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Eval harness
npm run eval

# Build
npm run build

# Complete check (CI gate)
npm run check
```

---

## End-to-End Verification

1. Start verification instance:
   ```bash
   .claude/skills/verify/scripts/verify.sh up
   .claude/skills/verify/scripts/verify.sh doctor
   ```
   *Expected outcome*: `doctor` passes all checks; app responds at free port with SSRF allowlist configured.

2. Run error scenario:
   ```bash
   .claude/skills/verify/scripts/verify.sh drive error
   ```
   *Expected outcome*: Blocked URL receives HTTP 400 with `{ ok: false, error: ... }`; client parses JSON and displays the error banner "Couldn't analyze this input." containing the exact error string.

3. Run URL analysis scenario:
   ```bash
   .claude/skills/verify/scripts/verify.sh drive analyze-url
   ```
   *Expected outcome*: Analysis succeeds with HTTP 200, `{ ok: true, report: ..., meta: ... } satisfies AnalyzeSuccess`; Preview renders Palette and report sections cleanly.

4. Run Image analysis scenario:
   ```bash
   .claude/skills/verify/scripts/verify.sh drive analyze-images
   ```
   *Expected outcome*: Image upload and multi-swatch palette analysis returns `{ ok: true, ... }`; thumbnail strip and structure unavailable reason (offline mode without key) render accurately.

5. Test non-JSON error handling via local scratch probe:
   - Probe simulates an upstream HTML error / 504 gateway timeout: `fetch` to a stub returning HTML text.
   - Client throws `Analysis failed (504): server returned an unexpected non-JSON response.` instead of `SyntaxError: Unexpected token <`.

6. Stop verification instance:
   ```bash
   .claude/skills/verify/scripts/verify.sh down
   ```
   *Expected outcome*: Process groups cleanly terminated, `.verify/current.env` removed.

---

## Risks

| Risk | Mitigation | Scope |
|------|------------|-------|
| Importing types from `lib/schema.ts` into `lib/api.ts` might pull `zod` and `js-yaml` into the client JS bundle if imported as value rather than type. | Strictly use `import type { ... }` in `lib/api.ts` and verify build output with `npm run build` to confirm First Load JS bundle size on `/` remains at baseline (~108 kB). | In-scope |
| Changes to error response shapes (adding `ok: false` where it was previously omitted) could break clients expecting `{ error }` without `ok`. | `ok: false` is strictly additive to `{ error: string }`, directly conforming to `AnalyzeFailure`, and matches existing error responses in `route.ts:155` and `:260`. The `/verify drive error` scenario passes as it checks `a.status === 400` and `a.body.error`. | In-scope |
| `MAX_IMAGES` exported as value from `lib/api.ts` could create circular dependency if imported by modules that `lib/api.ts` imports. | `lib/api.ts` imports nothing at runtime and only type imports from `schema` and `interpret`. It has zero dependencies, making circular references impossible. | In-scope |

---

## Open Questions

- **Refinement arrow format when prior role is absent**:
  - *Context*: When `r.from` is missing, prior code rendered `#123456 undefined→primary`.
  - *Proposed default*: Render `${r.hex} ${r.from ? `${r.from}→` : "→"}${r.to}` (e.g. `#123456 →primary`). The arrow indicates an assignment into the target role while eliminating the undefined artifact.
- **Type naming compatibility**:
  - *Context*: `app/page.tsx` declares an internal component `function Meta(...)` at line 693. Exporting `interface Meta` could cause local shadowing.
  - *Proposed default*: Name the interface `AnalyzeMeta` in `lib/api.ts` and alias `export type Meta = AnalyzeMeta;`. In `page.tsx`, import `AnalyzeMeta` to avoid shadowing `function Meta`.

---

## Acceptance Criteria

- [ ] One type-only module declares `AnalyzeResponse` as a union discriminated on `ok`; `app/page.tsx` and `app/api/analyze/route.ts` both import it, and `page.tsx` no longer declares `Meta`, `Refinement` or `AnalyzeResponse`.
- [ ] Both success payloads in `route.ts` are checked with `satisfies`, and every error reply carries `ok: false`.
- [ ] `MAX_IMAGES` is declared once and imported by both files.
- [ ] A reply that is not JSON shows a readable error, and the client narrows on `ok` with no cast on `res.json()`.
- [ ] A refinement with no previous role does not render as "undefined→…".
- [ ] `npm run check` and `/verify` (`error`, `analyze-url`, `analyze-images`) pass.
