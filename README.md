# Distill

Point it at a website URL or drop in an image, and it produces a Markdown design system — palette, typography, spacing/radius/elevation, plus AI-inferred identity and Unsplash `imageMood` keywords. The output is a single `.md` file: YAML frontmatter (machine-parseable) followed by a human-readable body.

- **URL input** → a full `design-system` report (measured tokens + AI interpretation).
- **Image input** → a lighter `palette-mood` report (measured palette + AI interpretation; type/spacing/radius/elevation are omitted rather than faked).

See [`design-system-scraper-plan.md`](./design-system-scraper-plan.md) for the full design rationale.

## Requirements

- **Node.js 18+** (developed on Node 22).
- **Chromium** for Playwright — installed automatically by the `postinstall` hook (see below).
- **An Anthropic API key** for the AI lane (`identity` / `imageMood` / role refinement). Optional: without it, the deterministic measured tokens still work; the AI-interpreted sections are skipped.

## Setup

```bash
npm install
```

`npm install` runs `playwright install chromium` automatically (via the `postinstall` script), downloading the headless browser the URL analyzer needs.

To enable the AI lane, add your Anthropic API key to a `.env.local` file in the project root:

```bash
# .env.local
ANTHROPIC_API_KEY=sk-ant-...
```

`.env.local` is git-ignored. The app uses the `claude-opus-4-8` vision model via `@anthropic-ai/sdk`.

## Running the app

Start the dev server:

```bash
npm run dev
```

Then open <http://localhost:3000>, paste a URL or drop in an image, and copy or download the generated `.md`.

Analysis runs server-side in the Node runtime (Playwright spawns a real Chromium binary), so it is not deployable as pure serverless — it ships in a container for production.

### Production build

```bash
npm run build
npm run start
```

## Other scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the Next.js dev server on port 3000. |
| `npm run build` | Production build. |
| `npm run start` | Serve the production build. |
| `npm run lint` | Run `next lint`. |
| `npm run typecheck` | Type-check with `tsc --noEmit`. |
| `npm run eval` | Run the extraction eval harness against the corpus and diff against `expected.yaml`. Set `UPDATE_BASELINE=1` to refresh baselines. |
| `npm run eval:ai` | Stability check for the AI lane (runs inputs multiple times, checks output consistency). |
| `npm run eval:capture` | Capture/refresh corpus screenshots and style dumps. |

The eval corpus uses committed fixture captures, so `npm run eval` runs offline for the checked-in fixtures.
