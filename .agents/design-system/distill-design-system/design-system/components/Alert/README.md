# Alert

An inline message box in one of three tones; the only place the chrome uses hue.

- `tone="danger"`: a request failed. `danger-bg`, `danger-line`, `danger-ink`. Lead with a bold `title` verdict ("Couldn't analyze this input."), then the detail.
- `tone="warning"`: the result is partial ("structure unavailable"). `warning-bg`, `warning-line`, `warning-ink`. Plain sentence, no title.
- `tone="hint"`: setup advice in `caption` size on `surface-sunken`, `ink-muted` text, `ink-code` for inline `code`. The 💡 prefix is the one emoji in the product.
- Full width of the column, `radius-lg` (hint: `radius-md`), placed `space-6` below the form.

Consumer supplies: `tone`, optional `title`, the message as children.

Hand-written from `app/page.tsx`.
