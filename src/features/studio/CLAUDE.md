# src/features/studio (ESG-lite_FE): Design Studio frontend layer

> **Layer spec.** Goes to `ESG-lite_FE/src/features/studio/CLAUDE.md`.
> **Read it** after the root CLAUDE.md and `docs/design-studio/00-plan.md`, `01-contracts.md`, `04-decisions.md` and **`05-ux.md`**, then your module's CLAUDE.md.
> **Base:** `docs/design-studio/rs-base/layers/ESG-lite_FE-features-kpi-studio/CLAUDE.md`. Its rules hold, with paths moved and the editor layout replaced by `05-ux.md`.

## Shape
```
src/lib/studio/
  contracts.ts   mirror of ESG-lite src/studio/contracts (DS-0)
  switch.ts      designStudioOn(user), kindEnabled(user, kind), useDesignStudio() (DS-0)
  render/        GENERATED mirror of ESG-lite src/reporting/studio/render (DS-1). Do not edit.
  geometry.ts    mm ↔ px at zoom, rotation, hit testing (DS-6)
  docOps.ts      pure doc edits (DS-6), applyTemplate / applyStyle (DS-3, DS-4)
  history.ts     undo/redo command stack (DS-6)
  snapping.ts    snap targets, guides, equal spacing, rulers (DS-6)
  resize.ts      client preview of a resize mapping (DS-10)
src/features/studio/
  CLAUDE.md      this file
  routes.tsx     one entry per page (DS-0 creates)
  home/          S1 (DS-5)
  new/           S2 template → scope → details → words → build (DS-5)
  editor/        shell: TopBar, SideRail, Drawer, ContextToolbar, Canvas, Sheet, SelectionLayer, Rulers,
                 PageStrip, GridView, PositionPanel, StatusBar, shortcuts (DS-6)
  editor/text/   TipTap, DataChip, DataPicker, TextPresets, footnotes, overflow measure (DS-7)
  editor/charts/ ChartToolbar, ChartKindPicker, CustomDataGrid (DS-8)
  editor/tables/ TableToolbar, TableEditor (DS-8)
  panels/        TemplatesPanel, ElementsPanel, TextPanel (DS-4/7), BrandPanel + StylesPanel (DS-3),
                 UploadsPanel (DS-4), DataPanel + ReportDetailsForm (DS-2 FE, DS-8), ChartsPanel (DS-8), PagesPanel (DS-6)
  ai/            AiPanel (chat), SuggestionCard, DiffView, GhostPreview, BriefDialog, BudgetMeter (DS-9)
  resize/        ResizeDialog, LinkedSourceChip (DS-10)
  preview/       Page view iframe, PDF proof (pdf.js) (DS-11)
  present/       Present mode (DS-11)
  share/         ShareMenu, DownloadMenu, ViewLinkDialog, public viewer page (DS-11)
  checks/        ChecksPanel, inline markers, FinalDialog (DS-12)
  review/        comments, mentions, tasks, ApprovalBar, VersionHistory, drift review (DS-13)
  brand-kit/     /studio/brand-kit page (DS-3)
  api.ts         TanStack Query hooks per endpoint
src/test/msw/studio.ts   mocks for every 01-contracts §4 endpoint (DS-0), kept in step by each module
```

## Rules
1. **Switch everywhere.** `designStudioOn` gates nav, routes, commands and deep links. `kindEnabled(user, 'sustainability')` also needs KPI tracking. Off → `EmptyState` with the `05-ux` S10 copy.
2. **The sheet is the renderer.** Pages are drawn with `render/renderSheet()` into a shadow root. Selection, handles, guides, rulers and data hover cards are a separate overlay positioned with `geometry.ts`. Never re-create an element's look in React.
3. **The doc is the state.** Editor state is one `ReportDoc` plus the selection, zoom, view mode, open drawer and `rev`. Every change goes through `docOps` + `history`. Autosave PATCHes 1 s after idle; a 409 opens the RS conflict dialog.
4. **Canva-style chrome, our tokens.** Rail, drawers and toolbar use `src/ui` components and app tokens in all four app themes. Icons come from `lucide-react`. No Canva names, icons or look.
5. **Numbers only from the server.** Values come from `/studio/resolve`. The FE formats nothing that is reported; it shows `display` strings. The Data drawer shows values and approval dates from the same call.
6. **AI is a card.** Every AI result renders as a `SuggestionCard`, and a doc change happens only in its Accept handler.
7. **Performance.** Only visible pages ±2 render as live sheets; the page strip and grid view use cached thumbnails. Dragging stays at 60 fps on a 50-page doc.
8. **Width gate.** Below 1280 px: read-only canvas, comments and downloads (RS R16).
9. **Tests:** unit tests for `src/lib/studio/*`; component tests with MSW for each panel; Playwright `e2e/ds-*.spec.ts` for the main path of each module and the switch-off path.

## Pro editing (AT-1, AT-2, PE-1, PE-2) — see ESG-lite docs/design-studio/pro/
- Plan: ESG-lite `docs/design-studio/pro/01-pro-editing-and-ai-templates.md`; mockups `docs/design-studio/pro/canvas/project/{AiTemplates,AiLayouts,PhotoEdit,TextEffects}.dc.html` (match their layout with `src/ui` components and theme tokens). Contracts and rules: `docs/design-studio/pro/PRO-0.md`.
- Types: the `// PRO-0` block of `src/lib/studio/contracts.ts` (element props `ImageEditProps`, `TextEditProps`, `FontRef`; API shapes; find and replace op types `FindQuery`/`FindMatch`/`FindReplaceOp`). Change the backend contracts first, then this mirror and `contracts.snapshot.json`.
- API clients (typed stubs, hooks): `new/suggestApi.ts` (AT-1), `swap/api.ts` (AT-2 template swap; `suggest_layouts` goes through `ai/api.ts` `postAiAction`), `photo/api.ts` (PE-1 background remover jobs), `brand-kit/fontsApi.ts` (PE-2 fonts). MSW: the `PRO-0` block of `src/test/msw/studio.ts` (`setStudioMockTemplateAi`, `setStudioMockBgRemover`, `studioMockFonts`).
- Transparency is the element's `opacity` (0..1) shown as 0..100 %. Image edits are non-destructive; every visual effect is drawn by the shared renderer (never by app CSS in the sheet), so editor, preview and PDF match.
- Figures stay chips: find and replace skips data chips and locked boxes; layouts and template swaps keep every text, chip and chart; AI output is a card applied in one undo step on Accept.
- Font upload and delete are Manager-only (show the licence tick; delete needs an inline confirm). "Background remover isn't set up on this server yet" for `DS_BG_UNAVAILABLE`.

## #209 follow-up: tCO₂e at 3 decimals
- The renderer mirror (RENDER_HASH `b3a36e64…de29`) prints tCO₂e chart labels, legend values and bound table / flow cells with 3 decimals; chips and the Data drawer show the server's `display`, which `src/studio/sources/format.ts` now sends with 3 decimals for any tCO₂e spelling. The FE still formats nothing.
- The MSW `/resolve` and `/data` mocks send tCO₂e displays the same way ("1,111.000"); `e2e/ds-5`, `ds-7`, `ds-9` mock the server's 3-decimal displays. `e2e/tonnes-209-fit.spec.ts` checks a 123,456.789 chip and Data drawer row fit at 1280 px.
- #209 review (RENDER_HASH `ed8a8d56…8b64`): each resolved series may carry its own `unit` (`ResolvedBinding.series[].unit`; absent = the binding's unit, null = none). The server sends "t" on a GHG `gas` breakdown's series (tonnes of each gas, printed 8,350 / 19.8 / 2.9) and every KPI series' unit (one series per KPI, each in the binding's unit or its own). The renderer formats labels, legends and bound table rows by it, staggers / shrinks / drops colliding value labels and keeps treemap lines inside their tile. The MSW `/resolve` mock and the Playwright studio mocks send the same shapes and 3-decimal tCO₂e displays; `src/test/msw/studio.test.ts` renders them through the mirror.
- #209 review round 3 (RENDER_HASH `e08511fd…8f30`): label widths are measured per character (`render/charts/metrics.ts`, the widest of the 8 studio faces). Value labels keep clear of tick labels, other bars and target words (step down to 0.8, then stagger, then drop as a last resort); GHG headlines wrap or step down to fit the chart; a donut's figure fits its hole or moves under the donut; scope_split keeps its shares, legend figures and basis note. The renderer goldens (`src/test/fixtures/studio-render`, copied by the backend's sync) now carry the server's 3-decimal displays ("12,480.000"), so FE unit-test inputs standing in for a tCO₂e `display` use the 3-decimal form too.
