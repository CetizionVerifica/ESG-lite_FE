# src/theme

Design tokens and the theme engine (PlanetPulse default, client brand themes: Classic / Light / Night).
Spec: `CLAUDE.md` in this folder (copied from `docs/redesign/foundation/01-theme-tokens/CLAUDE.md`).

The only place in new code where raw colour values may appear. Everything else reads tokens from here.

## Using tokens

- CSS: `var(--t-panel)`, `var(--t-ink)`, `var(--f-num)`, `var(--r-md)`, `var(--row-h)`.
- Tailwind: every `--t-<name>` colour is a Tailwind colour `<name>`: `bg-panel text-ink border-line`,
  `bg-brand text-on-brand`, `text-brand-text`, `bg-good-soft text-good`, `fill-s1`, `bg-series-3`.
  Fonts: `font-ui`, `font-num` (add `tabular-nums` for figures), `font-brand`.
  Radius: `rounded-chip` (4px), `rounded-control` (8px), `rounded-card` (14px).
  Table rows: `h-row` (36px, 30px under `data-density="compact"`). Spacing already uses a 4px base (`p-1` = 4px).
- `--t-accent` is a fill colour. Text in brand colour uses `--t-brand-text`, which always passes AA.
- Status colours (`good`, `warn`, `bad`, `info` and their `-soft` backgrounds) are fixed; never brand-coloured.

## Files

| File | What |
|---|---|
| `tokens.css` | Static tokens + PlanetPulse defaults on `:root`, Tailwind `@theme` mapping |
| `tokens.ts` | Token names (the contract) |
