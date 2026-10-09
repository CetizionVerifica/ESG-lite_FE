# F1 · Design tokens and the client theme engine

> Blueprint spec. Read this before touching any colour, font, spacing or dark-mode code.
> Every page spec in `../../pages/` assumes the tokens and rules here exist.

## Why this module exists
Today colour and dark mode are switched by hand: **553 `isDark ? … : …` ternaries** across `src/`
(`src/context/ThemeContext.tsx` only toggles a `dark` class and exposes `isDark`). Brand colours
(`Brand` entity) are used only inside report PDFs. The redesign needs one place where a client's
two brand colours become a full, accessible theme for the whole app.

## Outcome
- All UI colour comes from CSS custom properties (`--t-*`). No hex values or `isDark` in page code.
- One `ThemeProvider` resolves: **client theme pack** (from `Brand`) × **look** (Classic | Light | Night)
  × **user appearance** (light | dark | system).
- PlanetPulse is the default pack, used when a company has no brand row and for Superadmin.

## Theme pack inputs (per company)
| Input | Source today | Notes |
|---|---|---|
| `name` | `Brand.name` | Shown in the top bar and on reports |
| `primary` | `Brand.primary` (default `#1f2a44`) | Drives the brand ramp |
| `accent` | `Brand.accent` (default `#3b82f6`) | Drives the accent ramp |
| `coverFrom`, `coverTo` | `Brand.coverFrom/coverTo` | Sign-in cover and PDF cover gradient |
| `logoUrl` | `Brand.logoUrl` (R2) | Logo for light surfaces |
| `logoOnDarkUrl` | **new, proposed** | White/mono logo for Classic top bar and Night |
| `defaultLook` | **new, proposed** `classic \| light \| night` | Client's default |
| `scope3Colour` | **new, optional** | Defaults to a neutral derived from the logo |

Backend changes are proposals only; see `../../00-entity-map.md#brand`.

## Token set (names are the contract)
Surface: `--t-page`, `--t-panel`, `--t-ink`, `--t-muted`, `--t-line`, `--t-tint`
Brand: `--t-brand`, `--t-on-brand`, `--t-brand-text`, `--t-accent`, `--t-on-accent`, `--t-brand-50 … --t-brand-900`, `--t-accent-50 … --t-accent-900`
Chrome (top bar): `--t-chrome`, `--t-chrome-fg`, `--t-chrome-muted`, `--t-chrome-line`, `--t-chrome-active`
Data: `--t-s1`, `--t-s2`, `--t-s3` (Scope 1/2/3, always this order), `--t-series-1 … --t-series-8` (categorical, for sites/categories)
Status (**fixed, never brand-coloured**): `--t-good`, `--t-good-soft`, `--t-warn`, `--t-warn-soft`, `--t-bad`, `--t-bad-soft`, `--t-info`, `--t-info-soft`
Cover: `--t-cover-from`, `--t-cover-to`
Type: `--f-ui: "IBM Plex Sans"`, `--f-num: "IBM Plex Mono"` (all figures, tabular), `--f-brand: "Plus Jakarta Sans"` (PlanetPulse marketing surfaces only)
Space: 4px base scale `--s-1 … --s-8`; radius `--r-sm 4px`, `--r-md 8px`, `--r-lg 14px`
Density: `--row-h` 36px default, 30px compact (tables only)

Fixed status values (light / dark):
good `#16794c` / `#4ccf8f`, warn `#9a6300` / `#f0b955`, bad `#b4321f` / `#f38b7a`.

## Generation rules
1. Ramp: 10 steps from one colour by mixing toward white (50–400) and black (600–900); 500 = input.
2. Light look: `--t-brand` = primary, `--t-brand-text` = brand-600 (or darker until AA on white).
3. Night look: brand and accent are lifted to step 300/400 so they pass AA on `--t-panel` dark.
4. Classic look: `--t-chrome` = primary (or logo colour), chrome text white. Light look: white chrome.
5. Contrast gate: every text/background pair is checked (WCAG AA 4.5:1 text, 3:1 large/UI).
   A failing colour is darkened (light) or lightened (dark) step by step. A colour that can't pass
   as text (e.g. Chieron amber) is restricted to fills.
6. If the brand hue is close to a status hue (green brand vs approved, red brand vs rejected),
   status pills always carry an icon + label, never colour alone.

## Implementation shape (for the developer, not code yet)
- `src/theme/tokens.css` – static tokens + PlanetPulse defaults on `:root`.
- `src/theme/buildTheme.ts` – pure function `(brand, look, appearance) → Record<token, value>`; unit-tested.
- `src/theme/ThemeProvider.tsx` – replaces `context/ThemeContext.tsx`; fetches `getBrand(companyId)`
  after login, applies vars on `<html>`, keeps `useTheme()` returning `{ appearance, setAppearance, look, pack }`.
  Keep `isDark` as a deprecated alias during migration only.
- Tailwind v4: map tokens with `@theme` so classes read `bg-panel text-ink border-line`, not `bg-slate-800`.
- ECharts: one `useChartTheme()` hook that returns an ECharts theme object built from the same tokens.
- `@react-pdf` reports: `pdfTheme(brand)` returns print colours (always light look).

## Acceptance
- `grep -rn "isDark ?" src` returns 0 outside `src/theme/`.
- Switching between PlanetPulse, Midal Classic, Midal Light and Midal Night changes every screen without reload.
- Automated contrast test passes for all 4 stored brands (companies 1, 2, 3, 6).
- Status colours identical across all packs.

## Out of scope
Per-user custom colours; fonts per client; layout changes per client.
