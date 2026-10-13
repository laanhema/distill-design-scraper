# Schema (`lib/schema.ts` + `lib/extract/structureSchema.ts`)

Zod schemas are the single source of truth for both reports' shapes, re-exported together from `lib/schema.ts`. Every measured-lane addition follows the same shape: an optional top-level field on `reportSchema`/`StructureReport`, its own `provenance`, and a corresponding `render*` function in `lib/emit.ts` that's only called `if (report.<field>)` — so an unmeasured lane is omitted from the body, never emitted empty or faked. `motion` (entries + referenced `keyframes`) and the structure report's `sections`/`sectionsText` are the most recent lanes added under this contract.

The structure report's `sectionsText` is the *same* formatted artifact as the body's `## Page sections` block — `structureEmit.ts` formats the digest once and uses it for both, the same one-source rule as design-report frontmatter vs. body.

Two **derived views** hang off the design report, both adding zero schema surface — every value must trace to a field that already exists, so extend them only by rendering existing fields:

- `renderCssVariables` (`lib/emit.ts`) — the `:root { … }` fence that ends the markdown body, plus a `prefers-color-scheme: dark` override block when `paletteDark` exists.
- `emitTailwindTheme` (`lib/emitTailwind.ts` — its own module so the client bundle doesn't pull in `js-yaml`/`reportSchema`; keep it free of those imports) — a standalone Tailwind v4 `@theme { … }` stylesheet (colors, `--font-*`, `--text-*` with line-height/weight/letter-spacing, `--spacing`, `--radius-*`, `--shadow-*`, plus a `prefers-color-scheme: dark` override block when `paletteDark` exists). It is *not* part of the markdown; the frontend calls it directly for the "Download Tailwind theme" action.
