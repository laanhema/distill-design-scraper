# Distill — Design System & Structure Scraper

**Distill** turns any website URL or dropped-in image into a structured Markdown design system and page architecture specification. It combines headless browser extraction, deterministic CSS token mining, DOM layout analysis, and optional AI vision interpretation to produce machine-parseable YAML frontmatter paired with human-readable documentation.

---

## Capabilities & Feature Lanes

Distill operates via two parallel extraction tracks:

### 🎨 Track A: Token Lane (Design System)
- **Palette Harvesting**: Area-weighted pixel analysis (via Sharp & Culori), DOM color clustering, OKLCH perception, APCA contrast calculations, and automatic role assignment (*primary*, *surface*, *text*, *border*, *status*).
- **Typography Scale**: Extracted font families, size hierarchy, font weights, line heights, and letter spacing.
- **Spatial & Geometry Tokens**: Inferred spacing multiples/base units, corner radius scales, and normalized box-shadow elevation levels.
- **AI Visual Interpretation** *(Optional)*: Vision model analysis producing brand identity/personality, aesthetic style tags, target audience framing, and Unsplash `imageMood` keywords.

### 🏗️ Track B: Structure Lane (Layout Architecture)
- **8-Stage Extraction Pipeline**: `Render` → `Harvest` → `Prune` → `Wrapper Collapse` → `Repetition Detection` → `Ontological Mapping` → `AI Semantic Refinement` → `Structure Emitter`.
- **Layout Mechanics**: Detailing page layout modes (CSS Grid, Flexbox, Container Queries), max-width constraints, sticky headers, and responsive breakpoint rules.
- **Page Ontology & Regions**: Classifies structural regions (Header, Hero, Navigation, Sidebar, Main Content, Footer, Cards, Grids, Forms, Controls).
- **Modularity & Hierarchies**: Maps nested UI component trees and repeating patterns.

---

## Input Modes & Reports

- **URL Input**: Executes a headless Chromium browser instance via Playwright to capture computed styles, screenshot, and raw DOM node trees. Supports mode selection: `tokens`, `structure`, or `both`.
- **Image Input**: Generates a lighter `palette-mood` report based on image palette extraction and AI vision interpretation (bypassing synthetic or faked typography/spacing tokens). **Palette & Mood only** — an uploaded image has no DOM to harvest, so there is no layout-structure report for image input, regardless of mode. Accepts one or more images of the same site/design (up to 6); their pixel clusters are merged into a single deduplicated palette rather than producing one report per image.

---

## Interactive UI & API

Distill includes a modern Next.js web application featuring:
- **Interactive Workbench**: URL submission, mode toggles (`tokens`, `structure`, `both`) for URL input, and drag-and-drop multi-image upload (Palette & Mood only) with a thumbnail strip, plus forced cache refresh controls.
- **Visual Swatches & Previews**: Live viewport rendering alongside visual color swatches and OKLCH/APCA contrast indicators.
- **Tabbed Markdown Output**: Quick tabs for Preview, Design System Tokens, and Structural Architecture, with 1-click Markdown copying and file downloading.
- **REST Endpoint**: `POST /api/analyze` accepts JSON payloads containing `{ url, images, mode, forceRefresh }` (`images` is `{ data, name? }[]`; the legacy single-image `image`/`imageName` fields still work as a one-element alias) and returns fully formatted reports and metadata.

---

## Requirements

- **Node.js 18+** (Developed and tested on Node 20 / 22)
- **Chromium** (Installed automatically by Playwright during `npm install`)
- **Anthropic API Key** *(Optional)*: Required for the AI lane (`identity`, `imageMood`, and semantic structural refinement). Without a key, deterministic token extraction operates fully offline.

---

## Setup & Configuration

1. **Install dependencies**:
   ```bash
   npm install
   ```
   *Note: `npm install` automatically triggers `playwright install chromium` via a postinstall hook.*

2. **Configure Environment Variables** *(Optional)*:
   Create a `.env.local` file in the project root to enable the AI interpretation lane:
   ```env
   # .env.local
   ANTHROPIC_API_KEY=sk-ant-...
   ```

---

## Running the Application

### Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Production Build
```bash
npm run build
npm run start
```

### Docker Container
Distill includes a multi-stage Dockerfile pre-configured with Playwright browser dependencies:
```bash
docker build -t distill .
docker run -p 3000:3000 -e ANTHROPIC_API_KEY="sk-ant-..." distill
```

---

## Scripts & CLI Commands

| Command | Description |
|---|---|
| `npm run dev` | Starts Next.js development server at `http://localhost:3000`. |
| `npm run build` | Builds the Next.js production application. |
| `npm run start` | Runs the production Next.js server. |
| `npm run lint` | Runs `next lint` code checks. |
| `npm run typecheck` | Validates TypeScript types (`tsc --noEmit`). |
| `npm run eval` | Evaluates extraction heuristics against corpus fixtures (`eval/corpus`) offline without a live browser. |
| `npm run eval:ai` | Performs stability checks on AI interpretation outputs across multiple runs. |
| `npm run eval:capture` | Captures fresh corpus screenshots and DOM/style dumps for evaluation fixtures. |

