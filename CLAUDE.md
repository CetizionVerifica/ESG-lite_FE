# ESGLite frontend (ESG-lite_FE)

React 19 + Vite + TypeScript + Tailwind. Backend is ESG-lite (Node), AI/OCR endpoints come from python_AI_service.

## Branches

- All redesign and PCF work targets the long-lived staging branch `production` (formerly `redesign/integration`), not `main`. Branch from it and open PRs against it.
- `main` is the legacy UI; `production` is what staging deploys from. `redesign/integration` is retired (it was renamed to `production` on 2026-10-13).
- The same branch exists in ESG-lite and python_AI_service for the backend and AI parts.

## Where the specs live

- `docs/redesign/` UI redesign: `README.md`, `01-plan.md` (phases, workstreams, definition of done), `00-entity-map.md` (entities, endpoints, backend items B1–B8, old → new pages), `foundation/` (F1 theme tokens, F2 app shell, F3 components), `pages/P01…P27/CLAUDE.md`.
- `docs/pcf/` Product Carbon Footprint: `00-pcf-plan.md`, `foundation/E1-data-and-engine`, `foundation/E2-ai-assist`, `pages/C01…C06/CLAUDE.md`.
- When work on a module starts, copy its spec `CLAUDE.md` into `src/features/<module>/CLAUDE.md` and keep it there; that copy is the module's working spec.
- A session working on one module reads this file, `docs/redesign/01-plan.md`, `docs/redesign/00-entity-map.md`, the foundation specs F1–F3 and its own spec. Not other page specs.

## Shared conventions

- Folder per module: `src/features/<module>/` with `Page.tsx`, `components/`, `hooks/`, `api.ts` (wraps existing `src/services/*`).
- Shared UI in `src/ui/`, theme in `src/theme/`. Pages never import from another feature folder; shared pieces move to `src/ui/`.
- Server state through one data hook layer: TanStack Query (provider is in `src/main.tsx`, client defaults in `src/lib/queryClient.ts`). No new ad-hoc `useEffect` fetching or sequential loops.
- URL holds filters/context (`?site=&period=`) so links are shareable.
- Copy: product name "ESGLite"; "tCO₂e"; sentence case; status words Pending / Approved / Rejected / Missing.
- Token colours only in new code: no hex values, no `isDark`, no `slate-*` / `gray-*` Tailwind colours.

## Routes

- The redesigned app is the only UI on `production` (M3, 2026-10-11). The `VITE_NEW_UI` flag, the old `src/pages/` and `src/components/` and `ThemeContext` were removed in that PR.
- Register a page in its module's own `src/features/<module>/routes.tsx` (see `src/features/README.md`); don't edit `src/routes/newUiRoutes.tsx` or `src/routes/legacyPages.tsx` for it. A shell route no module claims shows a placeholder.
- Old paths redirect through `LEGACY_REDIRECTS` in `src/features/shell/routeMap.ts`.
- Dev-only pages (never in production builds) go in `src/routes/devRoutes.tsx`. `/dev/theme` previews every theme token in PlanetPulse, Midal Classic, Midal Light and Midal Night.

## Connect Claude — see docs/mcp-import/ (in ESG-lite)

- Consent and Connected apps screens follow the redesign rules (src/ui, tokens only). Consent copy must say what Claude can't do (approve, edit, delete).
- Upload batches show their `channel` (Claude, Bulk upload, API; no channel = Bulk upload).

## Scope 3 — see docs/scope3/ (in ESG-lite)
- New Scope 3 pages live in `src/features/scope3/` (Boundary, Suppliers, Screening); changes to existing modules follow the S3 module spec that names them.
- Category names, method labels, DQ labels and review check labels come from `src/lib/scope3/` only; never hard-code "Cat 1" strings in a page.
- The FE never saves a total: previews mirror the engine; method and DQ chips read server fields.
- Copy: "Category 1 · Purchased goods and services" (number then exact GHG Protocol name); plain method labels from contracts §1; status words Draft / Pending / Approved / Rejected / Missing / Locked.

## Simple data entry — see docs/simple-entry/
- Users (contributors) see their fields and the total tCO₂e only: no method choice, factor, FX, FERA/Category 3 or DQ text. Gate detail with `showCalcDetail` (SE-1).
- Method, unit, currency and field labels/defaults are set per form by the Superadmin in Capture setup and applied by the server; a User's entry sends field values only.

## KPI tracking — see docs/kpi/ (in ESG-lite)
- Pages live in `src/features/kpi/` (setup, my-kpis, review, dashboard, reports, library); shared logic in `src/lib/kpi/`. Labels, framework names and units come from `src/lib/kpi/` only.
- Nothing KPI is visible unless `kpiTrackingOn(user)` (`src/lib/kpi/switch.ts`): nav, routes, command palette, My month card, Approvals tab. Deep links to KPI routes when off land on a friendly "not available" state.
- `docs/kpi/05-ux.md` is binding: plain questions (not disclosure codes) for contributors, one KPI at a time, framework badges, auto values read-only with "From your data", drafts save as you type, progress always visible.
- The FE never calculates a reported figure; previews (unit conversion, formula) mirror `src/lib/kpi/` and the server's numbers win.

## Definition of done (every module)

1. Matches its spec's layout and the screen in the previews artifact.
2. No hex colours or `isDark` in the module; renders correctly in PlanetPulse, Midal Classic, Midal Light, Midal Night.
3. Loading, empty and error states implemented; no `alert()` / `confirm()` / console-only errors.
4. Keyboard: all actions reachable; focus visible; dialogs trap focus and close on Esc.
5. Works at 1280 / 1024 / 768 / 390px.
6. Old route redirects; old files deleted in the same PR that switches the route.
7. Unit tests for any logic moved (calc, theme builder, period labels); Playwright smoke test for the page's main path.

## Commands

Run after `npm ci`:

| What | Command |
|---|---|
| Lint new code (must pass) | `npm run lint:new` |
| Lint whole repo | `npm run lint` (legacy code has ~455 existing problems; don't add new ones) |
| Typecheck | `npm run typecheck` |
| Unit tests (Vitest) | `npm test` (watch mode: `npx vitest`) |
| Playwright smoke tests | `npm run test:e2e` (first time on a machine: `npx playwright install chromium`) |
| Component visual snapshots (opt-in, not in CI) | `npm run test:ui-snapshots` (add `-- --update-snapshots` after an intended visual change) |
| Build | `npm run build` |

- `lint:new` covers `src/lib`, `src/ui`, `src/theme`, `src/features`, `src/test` (MSW mocks), `src/routes/newUiRoutes.tsx`, `legacyPages.tsx`, `pageRegistry.ts`, `src/routes/devRoutes.tsx`, `src/main.tsx`, `e2e/` and the test configs. Add any new top-level location you create for redesign code to that script.
- Unit tests live next to the code as `*.test.ts(x)` under `src/`. Playwright specs live in `e2e/`; the config starts the Vite dev server on port 4173 itself (or reuses one already running there).
- Shared components: see `src/ui/README.md`; the dev-only gallery is `/__ui` (`npm run dev`).
- Run lint:new, typecheck and unit tests before every push.
- A lane with a backend part runs the end-to-end data workflow test in ESG-lite before review (`bash ci/workflow/local.sh`, see ESG-lite `ci/workflow/README.md`) and puts "Workflow test: N passed, M skipped" in its last PR. It checks the data from client setup to the report; what a User sees stays in Playwright.

## Design Studio — see docs/design-studio/ (in ESG-lite)
- Pages live in `src/features/studio/`; shared logic in `src/lib/studio/`. Nothing is visible unless `designStudioOn(user)`. Sustainability designs also need `kpiTrackingOn(user)`.
- `src/lib/studio/render/` is a generated mirror of ESG-lite `src/reporting/studio/render/`. Never edit it by hand: run `npm run sync:studio-render`. CI checks `RENDER_HASH`.
- The editor draws pages with that renderer inside a shadow root, so the editor, Page view, Present and the PDF match. Never restyle report content with app CSS or Tailwind inside the sheet.
- Numbers on pages come from `/studio/resolve` and data chips. The FE never computes a reported figure.
- Every AI result is a suggestion card with Accept / Try again / Discard. Nothing AI-written lands on a page without a click.
- `docs/design-studio/05-ux.md` is binding (Canva-style rail, drawers, contextual toolbar, page strip). Never use "Magic" or Canva's names, icons or look. The editor needs ≥1280 px.

## Insights — see docs/insights/ (in ESG-lite)
- Page lives in `src/features/insights/`; shared logic in `src/lib/insights/`. Nothing is visible unless `insightsOn(user)`. KPI panels hide themselves on `availability: 'kpi_off'`.
- Charts: ECharts 6 via `ChartFrame` and `useChartTheme()` only. No new chart library, no hex colours, no `isDark`. Scope, pillar, heat and status colours are fixed tokens.
- Every number comes from an `/insights` endpoint. The FE never computes a reported figure, index, share or driver — it only formats.
- Each panel loads, fails and retries on its own. Every chart has a table view and an aria label; colour is never the only signal.
- Motion goes through `src/lib/insights/motion.ts` and is off under `prefers-reduced-motion`.
- `docs/insights/05-ux.md` is binding.
