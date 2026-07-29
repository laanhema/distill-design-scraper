# Plan: DIST-059 — Remove the stale `Anthropic` reference in the structure pipeline

## Summary

`lib/extract/structure/index.ts` line 23 contains a docstring comment referencing `Anthropic` client construction (`without ever constructing the Anthropic client`). Anthropic SDK was removed in DIST-038 (#72). This plan updates the comment to use provider-neutral phrasing (`without ever constructing a model client`), preserving the full explanation of offline deterministic eval execution.

## User Story

As a maintainer
I want in-code comments to name provider concepts neutrally
So that reader context remains accurate across provider updates without stale SDK references

## Metadata

| Field | Value |
|-------|-------|
| Type | REFACTOR / CLEANUP |
| Complexity | LOW |
| Systems Affected | `lib/extract/structure/index.ts` |
| GitHub Issue | #107 (DIST-059) |

---

## Patterns to Follow

### Structure pipeline options interface docstring
```ts
// SOURCE: lib/extract/structure/index.ts:22-26
  /** Force the Stage 7 AI labeller to its heuristic fallback without ever
   *  constructing a model client — used by the eval harness to keep
   *  `npm run eval` offline and deterministic even when an API key is set
   *  (DIST-013). Default false → AI path runs when a key is present. */
```

---

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `lib/extract/structure/index.ts` | UPDATE | Replace stale `Anthropic` reference in `forceHeuristicNaming` comment with provider-neutral phrasing |

---

## Tasks

### Task 1: Update doc comment in `lib/extract/structure/index.ts`

- **File**: `lib/extract/structure/index.ts`
- **Action**: UPDATE
- **Implement**: Replace `constructing the \`Anthropic\` client` with `constructing a model client`.
- **Mirror**: `lib/extract/structure/index.ts:22-26`
- **Validate**: `npm run typecheck && npm run lint`

---

## Validation

```bash
# Type check
npm run typecheck

# Lint
npm run lint

# Eval suite
npm run eval
```

---

## End-to-End Verification

Search codebase for `Anthropic` across `lib/`, `app/`, `eval/`, `README.md` to confirm zero occurrences:
```bash
grep -rn "Anthropic" lib/ app/ eval/ README.md
```

---

## Risks

| Risk | Mitigation |
|------|------------|
| Comment rewrite loses explanation context | Mitigation: Retain exact phrasing explaining offline deterministic eval motivation, changing only the provider-specific name. |

---

## Acceptance Criteria

- [ ] Zero occurrences of `Anthropic` in `lib/`, `app/`, `eval/`, and `README.md`.
- [ ] Comment in `lib/extract/structure/index.ts` remains clear and provider-neutral.
- [ ] `npm run typecheck` and `npm run lint` pass.
