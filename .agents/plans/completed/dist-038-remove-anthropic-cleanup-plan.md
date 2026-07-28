# Plan: DIST-038 — Remove @anthropic-ai/sdk and sweep provider references out of docs and eval

## Summary

Remove `@anthropic-ai/sdk` dependency, sweep remaining Anthropic/ANTHROPIC_API_KEY references from docs (`README.md`, `CLAUDE.md`), `eval/run.ts`, `eval/stability.ts`, and `lib/extract/imageMediaType.ts`. Remove stale scratch file `.agents/temp/AI-LANE-NOTES.md`.

## Metadata

| Field | Value |
|-------|-------|
| Type | CLEANUP / DOCUMENTATION |
| Complexity | SMALL |
| Systems Affected | `package.json`, `README.md`, `CLAUDE.md`, `eval/`, `lib/extract/imageMediaType.ts` |
| GitHub Issue | #72 |

---

## Tasks

### Task 1: Package and docs cleanup
- **File**: `package.json`, `README.md`, `CLAUDE.md`, `eval/run.ts`, `eval/stability.ts`, `lib/extract/imageMediaType.ts`
- **Action**: UPDATE / DELETE
- **Implement**: Remove `@anthropic-ai/sdk`, update environment variable references to `GEMINI_API_KEY`, update docstrings.
- **Validate**: `npm run lint && npm run typecheck && npm run eval`

---

## Validation

- Type check: `npm run typecheck`
- Lint: `npm run lint`
- Eval harness: `npm run eval`
