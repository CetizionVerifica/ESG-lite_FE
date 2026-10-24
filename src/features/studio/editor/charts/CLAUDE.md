# DS-8 · Charts and tables editor

> **Module spec**, lane L4, wave 4. Copy to `ESG-lite_FE/src/features/studio/editor/charts/CLAUDE.md`.
> **PR titles:** `[DS-8 k/m]`, four PRs:
> 1. GHG chart renderers (in `render/charts/ghg`, with the L1 owner);
> 2. Charts drawer + chart toolbar + kind picker;
> 3. table editor;
> 4. custom-data grid.
>
> **Depends on:** DS-1, DS-2, DS-6 · **Owns:** `render/charts/ghg/*`, FE `studio/editor/charts/*`, `editor/tables/*`, `panels/ChartsPanel`, Data drawer drag-to-page

## Job to be done
Canva's "select chart → edit data" ease, except that the data is approved inventory data. A typed table is allowed only where it is clearly labelled.

## Build
1. **GHG chart renderers** (static SVG, theme colours, scope colours):

   | Kind | Shape |
   |---|---|
   | `scope_split` | 100 % bar or donut with 3 segments and an optional Scope 2 basis note |
   | `category_bars` | Scope 3 categories, sorted, top n + "Other" |
   | `gas_split` | Bars by gas |
   | `site_bars` | Bars by site |
   | `monthly_stack` | Months stacked by scope |
   | `base_year_waterfall` | Base → drivers by scope → current |
   | `intensity_line` | Intensity over the years |
   | `treemap` | Categories |

   Every kind labels totals and the biggest parts only (RS research §2).
2. **Charts drawer:** thumbnails of the kinds valid for the doc's kind and data (a kind is disabled with a tooltip when the data can't feed it); click or drag to add, bound to a sensible default (e.g. `category_bars` → Scope 3, current year, top 8).
3. **Chart toolbar:**
   - Edit data opens the Data drawer focused on this binding (metric, years, sites, breakdown, top n, compare);
   - Chart kind ▾ (valid kinds only);
   - Colours (brand series or scope colours);
   - Labels (values, legend);
   - Grey prior years;
   - AI "Suggest a title" (DS-9).
4. **Drag from the Data drawer:** dropping a metric on the page asks "Big number · Tile · Chart"; dropping onto an existing chart replaces its binding.
5. **Table editor:**
   - bound tables (columns chosen from the breakdown) or static tables;
   - style, total row, column widths, merge cells (static only);
   - a bound table taller than its frame offers "Move to a flow section".
6. **Custom-data chart:**
   - a grid editor (≤ 200 × 20), with paste from a spreadsheet (the `paste` event; TSV);
   - the element shows an "Unlinked data" badge in the editor only (never printed);
   - it is listed in checks as `UNLINKED_DATA`;
   - it can't use GHG or KPI metric names as series labels (a warning in the grid).

## Tests
- Renderer goldens per GHG kind with the seed data.
- **Unit:** kind validity per binding.
- **Playwright:** add Scope 3 category bars, switch to treemap, change top n, grey prior years; paste a custom table and see the badge.

## Done when
Any GHG or KPI figure can be shown as a chart or table and edited from the toolbar, and a typed chart is possible but always marked.

## As built (DS-8, branches `ds-8-charts` in ESG-lite and ESG-lite_FE, 2026-10-20, local only)

### Files
- **Renderer** (ESG-lite `src/reporting/studio/render/`, mirrored; RENDER_HASH `7fbbefc6…`):
  - `charts/ghg/`: `common.ts` (current/prior series, ranking with "Other" last, biggest-n labels, total line from `display`, wrapping legend), `scopeSplit.ts` (100 % bar or donut, Scope 2 basis note), `rankedBars.ts` (`category_bars`, `site_bars`; prior year as a thin grey bar), `columns.ts` (`gas_split`, `monthly_stack`), `trend.ts` (`base_year_waterfall` + `bridgeSteps`, `intensity_line`), `treemap.ts` (squarified), `kinds.ts` (kind validity, defaults, reserved labels, `unlinkedElements`), `index.ts` (`GHG_CHARTS`).
  - `charts/registry.ts` spreads `GHG_CHARTS`; `charts/svg.ts` `ChartOptions` (+ `colors`, `showLegend`, `variant`, `basisNote`); `types.ts` (chart options, table `colWidths`/`merges`, `RenderValue.stacks`/`compare`); `elements/chart.ts` (badge words "Unlinked data", no room reserved); `elements/table.ts` (`colgroup` widths, `rowspan`/`colspan` merges, `pickColumns`); `css.ts` (badge absolutely placed, shown only in `.ds-doc--sheet`, hidden in print); `index.ts` exports.
- **Backend**: `src/studio/contracts/schema.ts` (chart options; table `colWidths`, `merges`, merges refused on bound tables), `src/studio/sources/ghg.ts` (`scopeStacks`: month/quarter breakdowns of total and scope metrics return `stacks`, one series per scope), `sources/types.ts` (`stacks`). `scripts/sync-studio-render.mjs` copies the GHG goldens too (both repos).
- **Backend tests**: `ci/unit/ds-8-charts.test.cjs` (12), goldens `ci/golden/ds/render/{ghg-charts.cjs, ghg-snapshots.json, ghg-fixture.json}`; `ci/api/tests/ds-8-charts.test.cjs` (3: switch off/role/tenant on the month breakdown, stacks add back to month and quarter splits CY and FY, every GHG default binding resolves on the API fixture and draws or says why). DS-1 test lines and DS-1/DS-4 snapshots refreshed (the GHG kinds now draw).
- **Frontend** (`src/features/studio/`):
  - `editor/charts/`: `chartOps.ts` (kinds for a binding, defaults, `rebind`, options, top n, DS-2 metric × breakdown table, binding summary, TSV parse/paste, grid ↔ custom data, reserved labels), `store.ts` (dialogs and the pending figure drop; `registerTitleSuggester` for DS-9), `ChartToolbar.tsx`, `ChartKindPicker.tsx`, `BindingEditor.tsx`, `DataDrawer.tsx`, `CustomDataGrid.tsx`, `ChartsHost.tsx` (Big number · Tile · Chart choice, grid and table dialogs), `register.ts`.
  - `editor/tables/`: `tableOps.ts`, `TableToolbar.tsx`, `TableEditor.tsx`.
  - `panels/ChartsPanel.tsx`.
  - `src/lib/studio/contracts.ts` (chart options, table layout, `ResolvedBinding.stacks`), the render mirror and `src/lib/studio/ghgCharts.test.ts`.
- **Shared files touched** (append-only `DS-8` blocks): `editor/dnd.ts` (`DND_DATA`, `readFigure`, `registerFigureDrop`), `editor/SelectionLayer.tsx` (figure drop branch and highlight), `editor/plugins.ts` (`registerChartsPlugins()`), `editor/Editor.tsx` (`<ChartsHost />`), `panels/DataPanel.tsx` (`onDragItem`, draggable rows), `src/test/msw/studio.ts` (DS-2-shaped GHG series, stacks).
- **Frontend tests**: `charts/chartOps.test.ts` (11), `tables/tableOps.test.ts` (7), `charts/Charts.test.tsx` (5, MSW), `src/lib/studio/ghgCharts.test.ts` (4), `e2e/ds-8-charts.spec.ts` (main path + switch off).

### Decisions and deviations
- **Contract additions** (made here, not in a DS-0 follow-up): chart `options.colors | showLegend | variant | basisNote`; table `colWidths`, `merges`; `ResolvedBinding.stacks`. All optional, so existing docs stay valid.
- **`monthly_stack` needs scopes per month**, which DS-2's `month` breakdown didn't return: `/resolve` now adds `stacks` (current year, one series per scope of the metric) from the same approved monthly rows; the stacks add back to the month split (API test). Without `stacks` the chart draws plain month bars.
- **`base_year_waterfall`** reads three shapes: total by scope for [base, current] (drivers by scope, the default the drawer adds), or no split with `compare: 'base'` (base → change → current, as DS-4's templates bind it), or a year series (first → change → last). The drivers are chart arithmetic on the resolved series (differences for the bars); the end bars are the resolved totals.
- **"Unlinked data" badge is editor-only**: rendered in every mode but shown only by `.ds-doc--sheet` CSS (and hidden under `@media print`), absolutely placed so the chart's layout is identical in every mode. DS-1 printed "Typed data, not linked" before.
- **Bound table columns**: `columns` on a bound table now picks columns by heading (the label column always shows) instead of renaming the headers; no DS-4 template set `columns` on a bound table.
- **Kinds in a sustainability doc**: GHG kinds stay available (emissions can appear in a sustainability report); "KPI charts" in the drawer bind the first selected KPI; any other KPI comes by dragging it from the Data drawer.
- **Drawer availability** comes from one `/resolve` of the eight default bindings: a kind is disabled with the unavailable reason, or "No approved data for this year" when every point is empty or zero.
- **Click in the Data drawer** with no data element selected asks Big number · Tile · Chart next to the row (DS-6 inserted a big number); with a bound element selected, the click replaces its binding. A single-value figure chosen as "Chart" becomes a five-year bar.
- **Custom data rules**: reserved labels (Scope 1/2/3, total emissions, tCO₂e, gases, biogenic, intensity, base year, KPI-code patterns, and the company's KPI names from the Data list) block Apply; pasting beyond 200 × 20 is cut with a notice.
- **"Move to a flow section"** uses an estimated table height (header 7.2 mm + 5.6 mm per row, the renderer's 8.5 pt table) rather than a measured one; the section is `scope3_categories` for Scope 3 by category, else `data_tables` with the binding's years (and KPIs).
- **Static tables** keep cells as typed strings (no number parsing); they're layout text, not data, and aren't listed as UNLINKED_DATA (only `custom` bindings are, per the contract).
- No new npm dependency.

### Not done
- **DS-12 wiring of UNLINKED_DATA**: the rule is ready (`unlinkedElements(doc)` in the mirrored renderer, used by tests); the checks runner is DS-12's.
- **AI "Suggest a title"**: the button calls whatever DS-9 registers with `registerTitleSuggester`; until then it is disabled with "Title suggestions arrive with the AI assistant".
- Overflow for "Move to a flow section" is estimated, not measured with `__measure`.
- The binding editor's site picker lists the session's sites (a Manager's); Admins and Superadmins see only "All sites in the report" (no company site list in the session).
- Chart kinds `sankey`, `materiality_matrix`, `target_bars`, `dot_grid` and `waterfall` aren't in the drawer; they're reachable from Chart kind ▾ when the data fits (as in the templates).
- Renderer goldens use made-up seed-shaped data (`ghg-charts.cjs`); the API test draws every default kind from the API fixture's approved rows. DS-14's seed companies don't exist yet.

### Tests run
- ESG-lite: `npm run build`, `npm run test:unit` (all pass), `ci/api` DS tests on a throwaway DB (59 pass), `test-lane.sh ds-8-be`: build ok, unit ok, scope3-golden 32/32, calculation snapshot matches, API 716 pass / 0 fail, workflow 48 + 29 pass with 1 fail (K9 KPI audit probes: "fetch failed" while other lanes ran); the workflow step re-run alone passed (55 + 29 pass, 0 fail).
- ESG-lite_FE: `test-lane.sh ds-8-fe` typecheck ok, lint:new ok, vitest ok; Playwright `ds-0`, `ds-3`, `ds-5`, `ds-6`, `ds-8` specs pass.
