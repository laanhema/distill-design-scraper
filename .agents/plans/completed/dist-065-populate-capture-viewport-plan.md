# Plan: DIST-065: Populate `Capture.viewport` in `eval/capture.ts` and refresh the fixtures

## Summary

Ensure committed eval captures include the top-level `viewport` key so `extractStructureFromCapture` receives the capture's actual viewport dimensions during evaluation rather than relying on default fallbacks. Re-capture offline fixtures.

## Metadata

| Field | Value |
|-------|-------|
| Type | ENHANCEMENT |
| Complexity | LOW |
| Systems Affected | eval/capture.ts, eval/corpus/*/capture.json |
| GitHub Issue | #127 |

---

## Tasks

### Task 1: Populate Capture.viewport in capture script
- **File**: `eval/capture.ts`
- **Implement**: Verify `viewport: VIEWPORT` is populated in the returned `Capture` object.

### Task 2: Refresh offline corpus fixtures
- **Files**: `eval/corpus/clean-light/capture.json`, `eval/corpus/dark-mode/capture.json`, `eval/corpus/adversarial-shell/capture.json`
- **Implement**: Re-run `npm run eval:capture` to write top-level `viewport` to all committed fixtures.

---

## Validation

```bash
npm run typecheck
npm run lint
npm run eval
```
