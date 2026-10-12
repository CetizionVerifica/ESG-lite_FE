# ESGLite frontend (ESG-lite_FE)

React 19 + Vite + TypeScript + Tailwind. Backend is ESG-lite (Node), AI/OCR endpoints come from python_AI_service.

## Branches

- All redesign and PCF work targets the long-lived integration branch `redesign/integration`, not `main`. Branch from it and open PRs against it.
- `main` stays the current production UI until the team merges `redesign/integration` into it.
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

- The redesigned app is the only UI on `redesign/integration` (M3, 2026-10-11). The `VITE_NEW_UI` flag, the old `src/pages/` and `src/components/` and `ThemeContext` were removed in that PR.
- Register a page in its module's own `src/features/<module>/routes.tsx` (see `src/features/README.md`); don't edit `src/routes/newUiRoutes.tsx` or `src/routes/legacyPages.tsx` for it. A shell route no module claims shows a placeholder.
- Old paths redirect through `LEGACY_REDIRECTS` in `src/features/shell/routeMap.ts`.
- Dev-only pages (never in production builds) go in `src/routes/devRoutes.tsx`. `/dev/theme` previews every theme token in PlanetPulse, Midal Classic, Midal Light and Midal Night.

## Connect Claude — see docs/mcp-import/ (in ESG-lite)

- Consent and Connected apps screens follow the redesign rules (src/ui, tokens only). Consent copy must say what Claude can't do (approve, edit, delete).
- Upload batches show their `channel` (Claude, Bulk upload, API; no channel = Bulk upload).

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

- `lint:new` covers `src/lib`, `src/ui`, `src/theme`, `src/features`, `src/routes/newUiRoutes.tsx`, `legacyPages.tsx`, `pageRegistry.ts`, `src/routes/devRoutes.tsx`, `src/main.tsx`, `e2e/` and the test configs. Add any new top-level location you create for redesign code to that script.
- Unit tests live next to the code as `*.test.ts(x)` under `src/`. Playwright specs live in `e2e/`; the config starts the Vite dev server on port 4173 itself (or reuses one already running there).
- Shared components: see `src/ui/README.md`; the dev-only gallery is `/__ui` (`npm run dev`).
- Run lint:new, typecheck and unit tests before every push.
