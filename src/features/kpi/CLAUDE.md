# src/features/kpi (ESG-lite_FE) — KPI tracking frontend layer

> Layer spec. Goes to `ESG-lite_FE/src/features/kpi/CLAUDE.md`. Read it after the root CLAUDE.md, `docs/kpi/00-plan.md`, `01-contracts.md`, `04-decisions.md` and **`05-ux.md`**, and before your module's CLAUDE.md.

## Shape
```
src/lib/kpi/
  contracts.ts   enums, types, error codes (KPI-0; mirrors ESG-lite src/kpi/contracts)
  labels.ts      plain names for topics, frameworks, statuses, value types (KPI-0)
  switch.ts      kpiTrackingOn(user, siteId?), useKpiTracking() (KPI-1)
  units.ts       allowed units, conversion preview (KPI-4)
  formula.ts     formula preview and dependency display (KPI-6)
src/features/kpi/
  CLAUDE.md      this file
  routes.tsx     one page entry per module (KPI-0 creates it)
  setup/         Admin setup wizard and settings (KPI-3)
  my-kpis/       contributor to-do list, entry card, table view, template upload (KPI-7)
  review/        Approvals → KPIs tab content (KPI-8)
  targets/       targets (KPI-9)
  dashboard/     coverage rings, KPI cards, gaps (KPI-10)
  reports/       framework reports and downloads (KPI-11)
  library/       Superadmin KPI library (KPI-2)
  components/    KPI-only shared pieces: FrameworkBadges, KpiQuestionCard, ProgressByFramework, FromYourDataChip
src/test/msw/kpi.ts   API mocks for every §3 endpoint (KPI-0), kept in step by each module
```
Module layout per `src/features/README.md`: `Page.tsx`, `components/`, `hooks/`, `api.ts` (TanStack Query). Pages don't import from other feature folders. Pieces shared with the rest of the app move to `src/ui`.

## Rules
1. **Switch everywhere.**
   - `kpiTrackingOn` gates nav items (`shell/nav.ts` `navFor`), routes (`routeMap.ts`), command palette entries (`shell/commands.ts`), the My month "KPIs due" card and the Approvals "KPIs" tab.
   - A deep link while off shows `EmptyState`: "KPI tracking isn't turned on for your company."
   - A server `KPI_TRACKING_OFF` response gets the same state.
2. **`05-ux.md` is binding.**
   - Contributors see plain questions, never disclosure codes as titles.
   - Framework badges go through `FrameworkBadges`, with a tooltip for each code.
   - Auto values are read-only and show `FromYourDataChip`, linking to the source rows.
3. **One entry component.** Every value is entered through `KpiQuestionCard`, which provides:
   - the value input with its unit (`UnitInput`);
   - last period's value;
   - an optional breakdown, evidence (`FileDrop`), comment and estimate flag.

   The card is used by My KPIs, the table view's row drawer and the review drawer's edit mode.
4. **Never lose work.** Drafts save on blur and after 1 s idle (`PUT /kpi/values`). `useUnsavedGuard` covers anything still unsaved. Optimistic updates roll back on error with a toast.
5. **Server numbers win.** Unit and formula previews come from `src/lib/kpi/`. A total, intensity or framework figure shown on a report or dashboard comes from the API, never from FE arithmetic.
6. **Design system.**
   - `src/ui` components and tokens only: no hex, no `isDark`.
   - Four themes; widths 1280 / 1024 / 768 / 390.
   - Loading, empty and error states on every page; keyboard paths; dialogs trap focus.
   - Status words follow the redesign plan.
7. **Tests every module adds:**
   - unit tests for any logic in `src/lib/kpi/` and its own `logic.ts`;
   - a Playwright check of its main path;
   - a Playwright check that the page is hidden when the switch is off;
   - MSW handlers updated with its endpoints.

## Wave D (plans/kpi/wave-d.md, binding)
- **D17 topics:** setup step 4 is `setup/components/TopicOwnersStep.tsx` (By topic grid + Exceptions); owners resolve as the server's `resolveOwner` (`setup/logic.ts`). The users drawers use `src/lib/kpi/KpiTopicsField.tsx` (`PUT /kpi/people/:id/topics`, moved-from notes via `personTopics.ts`). My KPIs groups rows by topic (`?topic=`).
- **D18 Superadmin:** KPI nav group, `/data/approvals` (KPIs tab only, `approvals-ledger/components/StaffKpiApprovals.tsx`), `/kpi/targets`; no client → `KpiChooseClient` with the shell's picker (`lib/kpi/clientPicker.ts`). Reviewers are `canReviewKpis` (Manager, Superadmin).
- **KPI-7 part 3:** `my-kpis/components/TableView.tsx` (`?view=table`) and `TemplateUpload.tsx` (`GET`/`POST /kpi/my/template`).
- **KPI-12:** `src/lib/kpi/ai.ts` reads both AI answers; `my-kpis/components/AiFillPanel.tsx` and the chips in `KpiQuestionCard`. Suggest only: Use fills the input; AI down is a calm note.

## Wave E (plans/kpi/wave-e.md, binding; copy in `esg/CLAUDE.md`)
- **D19 pillars:** `KPI_PILLARS`, `TOPIC_PILLAR` in `contracts.ts`; `PILLAR_LABEL` / `PILLAR_LETTER` / `PILLAR_COLOR` in `labels.ts`; `src/lib/kpi/pillars.ts` (`pillarOf` = the KPI's own pillar, else its topic's; `groupByPillar`, `topicsByPillar`, `pillarParam`). Show a pillar with `components/PillarBadge.tsx` (letter + dot; colour never alone).
- **Tokens:** `--t-pillar-e/s/g` (marks only) and the heat ramp `--t-heat-1…5` with `--t-on-heat-1…5` (cell text), fixed in every pack (`theme/buildTheme.ts` `PILLAR`, `HEAT`); `chartTheme().pillars` for ECharts.
- **ESG dashboard:** `esg/` (`/kpi/esg`, `GET /kpi/esg` via `kpiService.readEsg`). Pillar cards, topic bars + `TopicDrawer` (reads `GET /kpi/dashboard?topic=` and pending `GET /kpi/values`), `TrendChart` small multiples (`ChartFrame`), `SitesHeat`, `Movers`. Filters in the URL (`?year=&site=&pillar=&topic=`). Trends are keyed by `code` (the composite `GHG_SCOPE1_2` carries Scope 1's id).
- **Classifying:** library pillar chips/column/topic headings and the drawer's Pillar select (override note); setup step 3 by pillar then topic (`setup/logic.ts` `groupByPillarTopic`), step 4 pillar heading rows, custom-KPI Pillar select (sent only when it differs from the topic's).

## #209 follow-up: tCO₂e at 3 decimals
- Every tCO₂e KPI figure shows exactly 3 decimals (`TONNES_DP`, as `src/ui/format.ts` and ESG-lite `emissionWrite/round.ts`): `src/lib/kpi/units.ts` `isTonnesCo2e` (the registry's `normaliseUnit` → `tco2e`: "tCO₂e", "tCO2e", "t CO2e", "tonnes CO2e"), `figureDecimals` and `formatWithUnit` (it overrides the KPI's `decimals`, which stay 2 on KPIs edited before the server's `migrate:kpi-tonnes-decimals`), `columnDecimals` for chart table views (`KpiValueDrawer`, esg `TrendChart`), `targetText({ …, unit })` for a target from a zero baseline. kgCO₂e, intensities ("tCO₂e / M USD") and every other unit keep their rules.
- The MSW library mirrors the server's seed: GHG KPIs have `decimals: 3`. Tests: `src/lib/kpi/units.test.ts`, `targets.test.ts`, `dashboard/components/tonnes.test.tsx`; Playwright `e2e/tonnes-209-fit.spec.ts` (123,456.789 tCO₂e whole at 1280 / 1024 / 768 / 390 px).
- The ESG `ChangeChip` wraps inside a narrow card ("· Better" / "· Worse" kept together) instead of pushing the page sideways; `e2e/tonnes-209-fit.spec.ts` checks every pillar card's chip sits inside its card and the ESG page doesn't scroll sideways at all four widths.
- A dashboard card's target words come from the server (`card.target.label`, ESG-lite `targetLabel`): "Keep at 1,234.500 tCO₂e to 2030", "1,000.000 tCO₂e by 2030", "−20.8 % by 2030 from 2024". The MSW mock words them the same way (`src/test/msw/kpi.test.ts`).
