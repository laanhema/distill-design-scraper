# Analyze API

`POST /api/analyze` is the endpoint behind the UI, and integrators can call it directly. It accepts `url`, or `images: {data, name?}[]` (up to 6), plus `mode` (`tokens` | `structure` | `both`, default `both`) and `forceRefresh`. It returns `{ok, report, markdown, structureReport, structureUnavailableReason?, refinements, meta}`. Responses are cached for 10 minutes. Cache misses are rate-limited per client.

## Sub-features

- `api-modes`: `mode: "tokens"` returns `structureReport: null`. `structure` and `both` include it for URLs.
- `api-cache`: an identical request returns a byte-identical body almost instantly. `forceRefresh: true` bypasses the cache.
- `api-rate-limit`: after `RATE_LIMIT_MAX_REQUESTS` cache misses in the window (default 20 per 60s), the endpoint returns `429` with a `Retry-After` header. Cache hits are free.
- `api-validation`: an empty body returns `400` (`Missing 'url' or 'images'…`). A non-JSON body returns `400` (`Request body must be JSON.`). A body over 48 MiB returns `413`.

## How to get to it (user POV)

- Call it with `curl` or any HTTP client. The UI calls it on every Analyze.

## Driving it with verify.sh

Preconditions:

- Baseline from the README. `source .verify/current.env`, then `E=$RUN_DIR/evidence/api-$(date +%H%M%S); mkdir -p $E`.

- **Tokens mode and cache.** Run `for i in 1 2; do curl -s -o $E/url-$i.json -w "%{http_code} %{time_total}s\n" -X POST -H 'content-type: application/json' -d "{\"url\":\"$FIXTURE_URL/dark-mode.html\",\"mode\":\"tokens\"}" $APP_URL/api/analyze; done`. Expect `200` twice, the second in milliseconds. `cmp $E/url-1.json $E/url-2.json` reports no difference. `jq '.structureReport' $E/url-1.json` is `null`.
- **Validation.** Run `curl -s -w ' %{http_code}\n' -X POST -H 'content-type: application/json' -d 'nope' $APP_URL/api/analyze`. Expect `{"error":"Request body must be JSON."} 400`. Sending `-d '{}'` returns the missing-input `400`.
- **Rate limit.** Run `$V down`, then `RATE_LIMIT_MAX_REQUESTS=2 $V up`, then `source .verify/current.env`. Send three requests with `-H 'x-forwarded-for: 203.0.113.9'` and `"forceRefresh":true`: `for i in 1 2 3; do curl -s -o /dev/null -D - -X POST -H 'content-type: application/json' -H 'x-forwarded-for: 203.0.113.9' -d "{\"url\":\"$FIXTURE_URL/clean-light.html\",\"mode\":\"tokens\",\"forceRefresh\":true}" $APP_URL/api/analyze | grep -iE '^(HTTP|retry-after)'; done`. Expect `200`, `200`, then `429 Too Many Requests` with `retry-after: <seconds>`. Restart without the override afterwards.

## Gotchas

- Without `x-forwarded-for` or `x-real-ip`, every local request shares the `unknown` bucket. That includes the UI's own requests, so tests can starve one another.
- Without `forceRefresh`, repeated identical requests are cache hits and never reach the limiter.
- The response embeds base64 screenshots of several hundred KB. Save the body to a file rather than printing it.
- `structureUnavailableReason` responses are deliberately not cached when a key is set. Don't treat a changed second response as a cache bug in that case.
