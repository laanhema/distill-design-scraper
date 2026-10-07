# Error handling

When an input can't be analyzed, the user sees a red `Couldn't analyze this input.` banner followed by the reason, and no result tabs. Distill never shows a partial or fabricated report. Unsafe URLs, malformed URLs, and unreadable images each produce a specific actionable message. An internal pipeline failure produces a fixed generic message.

## Sub-features

- `err-ssrf`: a URL that resolves to a private or reserved address answers `400` with `Refusing to navigate to "<host>": resolves to <ip>, a blocked private/reserved address.`
- `err-scheme`: a non-http(s) URL answers `400` with `Invalid URL: must be an http(s) address, got "<url>".`
- `err-unresolvable`: an unresolvable host answers `400` with `Could not resolve hostname …`.
- `err-degenerate-image`: a transparent or unreadable image answers `422`.
- `err-internal`: a pipeline crash answers `502` with `Analysis failed due to an internal error. Please try again.`, with no internals leaked.

## How to get to it (user POV)

- Enter a blocked or unresolvable URL in `URL Input` and choose `Analyze`.
- Upload a fully transparent PNG in `Image Input` and choose `Analyze Image`.

## Driving it with verify.sh

Preconditions:

- Baseline from the README. The SSRF guard allowlists only `127.0.0.1`.

- **Blocked private address.** Run `$V drive error`, which submits `http://10.0.0.1/`. Expect `API answered 400`, `error banner is shown`, `banner carries the API message`, and `no result tabs rendered`. See `02-error.png`.
- **Other blocked URLs.** Run `$V drive error --url http://localhost:3000/` or `--url http://169.254.169.254/`. Expect the same four checks.
- **Unresolvable host.** Run `$V drive error --url http://does-not-exist.invalid/`. The banner carries `Could not resolve hostname`.
- **Non-http scheme.** The URL box is `type="url"`, and browser validation may block some schemes before submit. Use the API: `curl -s -w ' %{http_code}\n' -X POST -H 'content-type: application/json' -d '{"url":"ftp://x"}' $APP_URL/api/analyze` returns the `Invalid URL` message and `400`.
- **Negative control.** Run `$V drive error --url "$FIXTURE_URL/dark-mode.html"`. It must exit 1 with `API answered 400` failing. This shows the scenario can tell success from failure.

## Gotchas

- The submit button shows `Analyzing…` only briefly for SSRF rejections, because the guard runs before any browser launch.
- No scenario drives `err-degenerate-image` or `err-internal` yet. Report them as unverified rather than inferring them from code.
- An allowlisted host (`127.0.0.1` in this harness) skips the guard entirely. Don't use a `127.0.0.1` URL to prove the guard.
