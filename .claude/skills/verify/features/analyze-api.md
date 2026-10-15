# Analyze API

`POST /api/analyze` is the endpoint behind the UI, and integrators can call it directly. It accepts `url`, or `images: {data, name?}[]` (images past the sixth are dropped silently), plus `mode` (`tokens` | `structure` | `both`, default `both`) and `forceRefresh`. It returns `{ok, report, markdown, structureReport, structureUnavailableReason?, refinements, meta}`. Responses are cached for 10 minutes. Cache misses are rate-limited per client.

## Sub-features

- `api-modes`: `mode: "tokens"` returns `structureReport: null`. `structure` and `both` include it for URLs. A `structure`-only URL request has `meta.aiOutcome: "not-requested"`.
- `api-cache`: an identical request returns a byte-identical body almost instantly. `forceRefresh: true` bypasses the cache read and still writes the fresh result.
- `api-rate-limit`: after `RATE_LIMIT_MAX_REQUESTS` cache misses in the window (default 20 per 60s), the endpoint returns `429` with a `Retry-After` header. Cache hits are answered before the limiter, so they stay `200` even when the bucket is empty.
- `api-validation`: every failure body is `{"ok":false,"error":"…"}`. An empty body returns `400` (`Missing 'url' or 'images'…`). A non-JSON body returns `400` (`Request body must be JSON.`). A field of the wrong type or an unknown `mode` fails `analyzeBodySchema` and returns `400` naming the path (`Invalid mode: Invalid input`, `Invalid images.0.data: Invalid input`). A body over 48 MiB returns `413` (`Request body exceeds the 50331648-byte limit.`).

## How to get to it (user POV)

- Call it with `curl` or any HTTP client. The UI calls it on every Analyze.

## Driving it with verify.sh

Preconditions:

- Baseline from the README. `source .verify/current.env`, then `E=$RUN_DIR/evidence/api-$(date +%H%M%S); mkdir -p $E`.

- **Tokens mode and cache.** Run `for i in 1 2; do curl -s -o $E/url-$i.json -w "%{http_code} %{time_total}s\n" -X POST -H 'content-type: application/json' -d "{\"url\":\"$FIXTURE_URL/dark-mode.html\",\"mode\":\"tokens\"}" $APP_URL/api/analyze; done`. Expect `200` twice, the second in milliseconds. `cmp $E/url-1.json $E/url-2.json` reports no difference. `jq '.structureReport' $E/url-1.json` is `null`.
- **Validation.** Run `curl -s -w ' %{http_code}\n' -X POST -H 'content-type: application/json' -d 'nope' $APP_URL/api/analyze`. Expect `{"ok":false,"error":"Request body must be JSON."} 400`. Sending `-d '{}'` returns the missing-input `400`, and `-d '{"url":"x","mode":"bogus"}'` returns `{"ok":false,"error":"Invalid mode: Invalid input"} 400`. `head -c 50331649 /dev/zero | curl -s -w ' %{http_code}\n' -X POST -H 'content-type: application/json' --data-binary @- $APP_URL/api/analyze` returns the size-limit message and `413`.
- **Rate limit.** Run `$V down`, then `RATE_LIMIT_MAX_REQUESTS=2 $V up`, then `source .verify/current.env`. Send three requests with `-H 'x-forwarded-for: 203.0.113.9'` and `"forceRefresh":true`: `for i in 1 2 3; do curl -s -o /dev/null -D - -X POST -H 'content-type: application/json' -H 'x-forwarded-for: 203.0.113.9' -d "{\"url\":\"$FIXTURE_URL/clean-light.html\",\"mode\":\"tokens\",\"forceRefresh\":true}" $APP_URL/api/analyze | grep -iE '^(HTTP|retry-after)'; done`. Expect `200`, `200`, then `429 Too Many Requests` with `retry-after: <seconds>`. The same body without `forceRefresh` and with the same header then answers `200` in milliseconds, because the cache hit never reaches the limiter. Restart without the override afterwards.

## Gotchas

- Without `x-forwarded-for` or `x-real-ip`, every local request shares the `unknown` bucket. That includes the UI's own requests, so tests can starve one another.
- Without `forceRefresh`, repeated identical requests are cache hits and never reach the limiter.
- A URL response embeds base64 screenshots of several hundred KB. Save the body to a file rather than printing it. An image response has none.
- A URL response with `structureUnavailableReason` is never cached, and an image response with it is cached only when no key is set. Don't treat a changed second response as a cache bug in those cases.
- The cache key is the URL or the image `data`, plus `mode`. The image `name` is not part of it, so the same bytes sent under a new name within 10 minutes return the first request's `report.source.ref`.
