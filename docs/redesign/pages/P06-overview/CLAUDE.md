# P06 · Overview (Manager home)

> Blueprint spec. Route `/overview` (aliases `/manager-dashboard`, `/company/dashboard`). Role: **Manager**.
> Replaces `pages/ManagerDashboard/*` and `components/SubmissionStatusWidget.tsx`.
> Depends on: F1 tokens, F2 shell, F3 (`PageHeader`, `ContextChips`, `KpiStrip`, `ScopeBar`, `ChartFrame`, `DataTable`, `StatusPill`, `Callout`).

## Job to be done
"In ten seconds, tell me how my plants are doing this period and what needs me today."

## Data
- Emissions (approved only for figures): `Emission` via `emissionService.getEmissionsBySite` today → **proposed B4** `GET /manager/overview?period=&siteIds=&categoryId=` returning KPIs, monthly series, by-site, by-category, by-scope.
- Intensity: `productionDataService.getEmissionIntensity / getEmissionIntensityComparison`.
- Submission status: `GET /manager/submission-status?month=YYYY-MM`.
- Pending queue count + top items: `getEmissionsPaginated({status:'pending'})`, `getProductionDataForManager({status:'pending'})`.
- Threshold: `Threshold.threshold_percentage` for "above threshold" alerts.

## Layout (desktop)
```
PageHeader: crumb "{Company} · {sites} · {period}"  title "{period label}"
            context chips: [Sites ▾] [Category ▾]   period segmented: Month | Quarter | CY | FY | Compare
┌ KpiStrip ───────────────────────────────────────────────────────────────────┐
│ Net emissions (wide) │ Intensity │ Saved (renewables) │ Gross by scope (ScopeBar) │
└─────────────────────────────────────────────────────────────────────────────┘
┌ left 60% ───────────────────────────────┐ ┌ right 40% ─────────────────────┐
│ Monthly net emissions (area/line + bars)│ │ Needs your attention  (count)   │
│ toggle: Net | Gross | Scope stack       │ │  · N entries waiting approval → │
│                                         │ │  · N people missing {month} →   │
│ By site table                           │ │  · Category above threshold →   │
│  Site | Net | vs LY | Entries | Status  │ │  · N production records pending │
│                                         │ │ Insight callout (largest source)│
│ By category (horizontal bars, top 8)    │ │ Submission status (this month)  │
│                                         │ │  avatars + submitted/missing    │
└─────────────────────────────────────────┘ └─────────────────────────────────┘
Tabs below the fold: Intensity · Scope 2 electricity · Year over year · Site comparison
```

## Sections
1. **KpiStrip** (one panel, 4 cells, replaces 7 equal cards)
   - Net emissions `tCO₂e`, delta vs same period last year (▼ good).
   - Intensity `tCO₂e / {product unit}`; "Combined" when units differ; empty → "Add production data" link to P08.
   - Saved `tCO₂e` (categories with `scope = null`, e.g. Renewable Electricity).
   - Gross with `ScopeBar` S1/S2/S3 and figures.
2. **Monthly trend** `ChartFrame`: 12 months for CY/FY, last 6 for Month/Quarter. Yearly-filed rows shown as a separate hatched bar "Yearly filing" (fixes today's note-only treatment).
3. **By site** `DataTable` (compact, no pagination): Site, Net tCO₂e, vs LY, Entries done/expected, Status pill for the current month (Approved / N pending / N missing). Row click → P07 filtered to that site.
4. **By category** horizontal bar, top 8 + "Other". Click a bar → P07 filtered.
5. **Needs your attention** list (right): every item is a link with a count. Sources: pending emissions, pending production, missing submitters, categories over threshold (vs last month, using company threshold %), SBTi pathway status (from P12).
6. **Insight callout**: largest source share ("Purchased aluminium is 87% of the footprint"). Rule-based text, no AI needed.
7. **Submission status**: month picker (last 6 months), avatars with submitted/missing; "Send reminder" (uses existing notification queue; proposed endpoint).
8. **Below-the-fold tabs** (lazy-loaded): Intensity trend (bars + line, dual axis), Scope 2 electricity (emissions + kWh), Year over year (lines per year, multi-select years), Site comparison (bars). All use the header filters (fixes today's per-chart filters).

## States
- No sites assigned: `EmptyState` "You don't manage any sites yet. Ask your admin to assign one."
- Loading: skeletons for KPI strip, chart, table.
- No approved data in period: KPI shows "—" and a callout "Nothing approved for {period} yet. {N} entries are waiting for you." with button → P07.
- Error per panel, not whole page.

## Theming
Chart primary series `--t-brand`; scope colours `--t-s1/2/3`; deltas use fixed good/bad. Status pills fixed.

## Fixes vs today
7 cramped KPI cards → 4-cell strip · read-only pending list → actionable attention list · charts ignoring filters → all follow header context · intensity empty for multi-site → combined series · all-records download → aggregate endpoint · dead `KPICards.tsx` removed · export added (PNG per chart, CSV per table).

## Acceptance
- First meaningful paint < 1.5s on 3 sites × 12 months with B4.
- Every number links to the filtered list that produced it.
- Header filters persist in URL and survive reload.
- Matches screen "Overview" in the previews artifact in PlanetPulse, Midal Classic and Midal Night.
