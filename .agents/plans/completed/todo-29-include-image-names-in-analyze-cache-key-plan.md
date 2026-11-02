# Plan: Include image names in the `/api/analyze` cache key

## Summary

`POST /api/analyze` keys image requests on the bytes and `mode` only (`app/api/analyze/route.ts:147-148`), so the same bytes posted under another name within the 10-minute TTL get the cached response that names the first file. The fix builds the analyzed image list once, as `{ data: stripDataUrlPrefix(img.data), name: img.name || \`uploaded-image-${i + 1}\` }` (the exact inputs `analyzeImages` receives at `route.ts:174-180`), passes it to `analyzeImages`, and keys an image request on `JSON.stringify({ images: <that list>, mode })`. A JSON array of objects cannot join two different `{data, name}` lists into the same string, and a missing name keys the same as an explicit `uploaded-image-N`, because both produce the same report. A URL-only request keeps its key string byte-for-byte: `` `${url}::${mode}` ``, which is what the old template produced with an empty image part.

**Decision: an image key leaves out `url`.** When a body carries both, the route takes the image path and never reads `url` (`route.ts:172-180`), so the response does not depend on it. A JSON key starts with `{` and ends with `}`, and a URL key ends with `::<mode>`, so the two kinds of key cannot share a string.

**Decision: key on the stripped data.** The `data:image/...;base64,` prefix is removed before analysis, so a prefixed and an unprefixed upload of the same bytes and name give the same report and now share an entry. This is not observable beyond one more cache hit.

## Metadata

| Field | Value |
|-------|-------|
| Type | BUG_FIX |
| Complexity | LOW (one function in one route, plus three doc lines) |
| Systems Affected | `app/api/analyze/route.ts` cache key; `docs/architecture/api-route.md`; verify skill `features/analyze-api.md`, `features/analyze-images.md` |
| GitHub Issue | #222 (TODO-29, `TODO.md:12`) |
| PRD Phase | N/A |
| Prototype Patch | N/A |

## Environment Findings

| Probe | Result |
|-------|--------|
| Reproduction on HEAD `3bada90` (verify harness, AI lane off, `mode: tokens`) | `/tmp/issue-222/repro.sh` (script below): `a1.json 200 2.54s`, `b.json 200 0.017s`, `a2.json 200 0.015s`; `FAIL renamed upload: report.source.ref is first.png`, `ok repeat of first.png is byte-identical`, exit 1. `b.json` also has `meta.finalUrl: "first.png"`. Matches the issue's note |
| Does `npm run eval` exercise the change? | No. Eval replays captures through the extractors and never calls the route. Only the harness run proves the fix |
| Forward references to #222 / TODO-29 | `TODO.md:12` and `.agents/issues/todo-issues.md` (off-limits). No code placeholder |
| Other docs naming the key | `docs/architecture/api-route.md:3` ("The cache key hashes all image payloads."), `.claude/skills/verify/features/analyze-api.md:32`, `.claude/skills/verify/features/analyze-images.md:36` |

## Files to Change

| File | Action | Purpose |
|------|--------|---------|
| `app/api/analyze/route.ts` | UPDATE | Build the named, stripped image list once; key image requests on its JSON with `mode`; keep the URL key string |
| `docs/architecture/api-route.md` | UPDATE | Line 3: the key covers each image's data and name |
| `.claude/skills/verify/features/analyze-api.md` | UPDATE | Gotcha at line 32: names are part of the key |
| `.claude/skills/verify/features/analyze-images.md` | UPDATE | Gotcha at line 36: a new name is a miss |

## Tasks

### Task 1: Key image requests on their data and names

- **File**: `app/api/analyze/route.ts`
- **Action**: UPDATE
- **Implement**:
  1. After the missing-input check (line 145), build `const imageInputs = images.map((img, i) => ({ data: stripDataUrlPrefix(img.data), name: img.name || \`uploaded-image-${i + 1}\` }));`.
  2. Replace lines 147-148 with a key that is `JSON.stringify({ images: imageInputs, mode })` when `imageInputs.length > 0` and `` `${url || ""}::${mode}` `` otherwise, hashed by `createCacheKey`. One short comment says why: the names are in the report, and JSON keeps different `{data, name}` lists apart; the URL form is the one used before.
  3. Pass `imageInputs` to `analyzeImages` (lines 174-180) instead of mapping again.
- **Mirror**: `app/api/analyze/route.ts:129-134` (build a normalized list once, comment on the why)
- **Validate**: `npm run typecheck && npm run lint`

### Task 2: Update the docs and verify gotchas

- **File**: `docs/architecture/api-route.md`, `.claude/skills/verify/features/analyze-api.md`, `.claude/skills/verify/features/analyze-images.md`
- **Action**: UPDATE
- **Implement**:
  1. `api-route.md:3`: "The cache key hashes all image payloads." → the key of an image request is the JSON of each image's data and name (missing names take the `uploaded-image-N` fallback) plus `mode`; a URL request is keyed on the URL and `mode`.
  2. `analyze-api.md:32`: the key is the URL plus `mode`, or each image's `data` and `name` plus `mode`. The same bytes under a new name are a cache miss whose `report.source.ref` names the new file; a missing name keys the same as `uploaded-image-N`.
  3. `analyze-images.md:36`: the key covers the image bytes, the file names and `mode`, so a re-upload under another name is analyzed afresh and names the new file; the same bytes and name within 10 minutes return the earlier response.
- **Mirror**: the surrounding gotcha bullets (one plain sentence each)
- **Validate**: `grep -n "not part of it\|not the file name\|hashes all image payloads" docs/architecture/api-route.md .claude/skills/verify/features/analyze-*.md` prints nothing

## Validation

```bash
# Type check / Lint
npm run typecheck
npm run lint

# Full gate (run `.claude/skills/verify/scripts/verify.sh down` first)
npm run check

# Reproduction: red on HEAD (exit 1, FAIL renamed upload), green after the fix (exit 0, two ok lines).
# Needs a running verify instance; run from the repo root.
/tmp/issue-222/repro.sh /tmp/issue-222/clean-light.png "$RUN_DIR/evidence/api-repro"
```

The reproduction script, verbatim (save to `/tmp/issue-222/repro.sh`, `chmod +x`; the PNG is any `inputs/clean-light.png` from an earlier `analyze-images` run under `.verify/runs/`, or one from `$V drive analyze-images`):

```bash
#!/usr/bin/env bash
# Usage: repro.sh <png> <evidence-dir>; needs APP_URL (from .verify/current.env).
# Exit 0 only when: same bytes under a new name -> miss naming the new file,
# and a repeat of the first request -> hit with a byte-identical body.
set -u
[ -n "${APP_URL:-}" ] || source .verify/current.env  # run from the repo root
PNG=$1; E=$2; mkdir -p "$E"
B64=$(base64 -w0 "$PNG")
post() { # name, out, forceRefresh
  printf '{"images":[{"data":"%s","name":"%s"}],"mode":"tokens","forceRefresh":%s}' "$B64" "$1" "$3" \
    | curl -s -o "$E/$2" -w "$2 %{http_code} %{time_total}s\n" -X POST -H 'content-type: application/json' --data-binary @- "$APP_URL/api/analyze"
}
post first.png a1.json true
post renamed.png b.json false
post first.png a2.json false
fail=0
ref=$(jq -r '.report.source.ref' "$E/b.json")
if [ "$ref" = "renamed.png" ]; then echo "ok   renamed upload names renamed.png"; else echo "FAIL renamed upload: report.source.ref is $ref"; fail=1; fi
if cmp -s "$E/a1.json" "$E/a2.json"; then echo "ok   repeat of first.png is byte-identical"; else echo "FAIL repeat of first.png differs"; fail=1; fi
exit $fail
```

## End-to-End Verification

1. `.claude/skills/verify/scripts/verify.sh up > /tmp/issue-222/up.log 2>&1`, then `source .verify/current.env` and `verify.sh doctor` (cite `GIT_HEAD`). AI lane off.
2. Run the reproduction script. Expect `b.json 200` taking seconds (a miss, not ~0.02 s), `ok renamed upload names renamed.png`, `a2.json` in milliseconds, `ok repeat of first.png is byte-identical`, exit 0. Also `jq -r '.meta.finalUrl' b.json` is `renamed.png`.
3. Missing name: post the same bytes with no `name`, then with `"name":"uploaded-image-1"`. The second answers in milliseconds and `cmp` reports the bodies identical.
4. URL cache unchanged: the `analyze-api.md` "Tokens mode and cache" recipe (`dark-mode.html`, `mode: tokens`, twice). Expect `200` twice, the second in milliseconds, and `cmp` identical.
5. `verify.sh down`, then `npm run check`.

## Risks

| Risk | Mitigation |
|------|------------|
| A URL request's key changes and URL caching behaves differently | In scope: the URL key string stays `` `${url}::${mode}` ``, the exact old string; E2E step 4 checks hit and identity |
| Name fallback in the key drifts from the one in `analyzeImages` (`lib/analyze.ts:221`) | In scope: the route builds one list and both the key and `analyzeImages` read it; `lib/analyze.ts` keeps its own fallback for other callers (unchanged, out of scope) |
| Hashing a JSON string of up to 6 × 8 MiB costs more than the old join | Out of scope: the same bytes were hashed before; `JSON.stringify` of base64 adds no escaping, only one extra copy |
| A verify instance left running blocks `npm run check` | In scope: `verify.sh down` before the build, and confirm no instance at the end |

## Acceptance Criteria

- [ ] Posting the same image bytes under a different name is a cache miss, and `report.source.ref` names the new file (E2E 2)
- [ ] An identical image request is still a cache hit with a byte-identical body (E2E 2, 3)
- [ ] The key is the JSON of `{data, name}` objects, so different lists cannot join into one string (Task 1)
- [ ] URL requests cache exactly as before (E2E 4)
- [ ] The verify skill's `features/analyze-api.md` and `features/analyze-images.md` gotchas describe the new key (Task 2)
- [ ] `npm run typecheck`, `npm run lint`, `npm run check` pass
