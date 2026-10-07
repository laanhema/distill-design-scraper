# Button

The workbench's only button: a solid `action` fill for the main action, an outline for the secondary one.

- `variant="primary"` (default): `action` fill, `on-action` text, `action-hover` on hover. One per view — the form's **Analyze** / **Analyze Images**.
- `variant="secondary"`: transparent with a `line-strong` border, `fill` wash on hover. Sits beside a primary, never alone in a toolbar.
- `size="md"` (default) is the form submit: `ui` text, `space-2.5`×`space-5` padding, `radius-lg`. `size="sm"` is the result-toolbar download action: `caption-strong`, `space-1.5`×`space-3`, `radius-md`.
- While working, relabel ("Analyzing…") and set `disabled` — it drops to `opacity-disabled` with a not-allowed cursor.

Consumer supplies: the label (Title Case, says what happens to what), `onClick` or `type="submit"`, and any native button props.

Hand-written from `app/page.tsx`.
