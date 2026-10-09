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
| `color.ts` | Hex parsing, mixing, WCAG contrast, hue helpers |
| `packs.ts` | `ThemePack` type, PlanetPulse pack, `packFromBrand()`, the four stored brands (companies 1, 2, 3, 6) |
| `buildTheme.ts` | `buildTheme(pack, look, appearance)` → every colour token; contrast gate, status-hue rule |
| `preview/ThemePreviewPage.tsx` | Dev-only `/dev/theme`: every token in PlanetPulse, Midal Classic, Midal Light, Midal Night |

## Engine rules in short

- Ramps: 10 steps per colour (50–400 toward white, 500 = input, 600–900 toward black).
- Light: brand = primary; brand text = brand-600, darkened until AA on page, panel and tint.
- Classic: top bar = primary (darkened until white text passes AA); Light: white top bar.
- Night (or any dark appearance): brand and accent lifted from the 400 step until they pass 3:1 on the dark panel.
  A primary that lifts to grey (saturation < 0.3, e.g. Midal navy) borrows the accent ramp.
- Every fill gets white or near-black text, whichever passes 4.5:1; if neither does, the fill moves step by step.
- `contrastReport(tokens)` lists every checked pair; `buildTheme.test.ts` requires all to pass for the stored brands.
- `statusClashes(pack)` names statuses whose hue is near the brand's; status pills always show icon + label anyway.
