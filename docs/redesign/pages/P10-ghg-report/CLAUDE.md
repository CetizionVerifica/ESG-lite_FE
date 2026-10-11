# P10 · GHG report

> Blueprint spec. Route `/reports/ghg` (alias `/ghg-reports`). Roles: **Manager**, **Superadmin** (with client switcher).
> Replaces `pages/GhgReport/*` (GhgReport.tsx 821, GhgReportFilters 681, charts/tables files, `pdf/*`). Delete dead `GhgReportCharts.tsx` (743 lines, unused).
> Depends on: F1 (`pdfTheme`), F3 (`PageHeader`, `ContextChips`, `KpiStrip`, `ScopeBar`, `ChartFrame`, `DataTable`, `Tabs`, `Callout`).

## Job to be done
"Show me this year against last year, and give me a client-branded PDF I can send to the board."

## Data
`ghgreportService.getGhgReportTables` (POST `/user/ghg/tables`) and `getGhgReportDetails` (POST `/user/ghg/details`), payload `{siteIds, yearType, year, frequency, month?|quarter?, categoryIds?}`; `companyService.getReportingCalendar` (FY start month), `getCompanyNameBySites`; branded PDF `GET /reports/ghg?siteIds=…` (backend `src/reporting/*`, already uses `Brand`).

## Big change: no wizard
Today: 3 steps (decorative intro → filters → results); every change means "Back to Filters". New: **one live page**. Filters sit in the header; results update in place (debounced 400ms). The intro graphic moves to a dismissible "About GHG reporting" side panel.

## Layout
```
PageHeader "GHG report"
  chips: Sites ▾  Categories ▾  Calendar [CY|FY]  Frequency [Year|Quarter|Month]  Year ▾  (Quarter/Month ▾)
  actions: [Download branded PDF] (primary) · ⋯ (Quick PDF, Export tables XLSX)
"Comparing {sel} with {prev}" note
KpiStrip: Total tCO₂e (Δ vs prev) | Scope 1 | Scope 2 | Scope 3 | Data coverage % | Largest source
Tabs: Summary · By location · Scope 1 · Scope 2 · Scope 3 · Findings
  Summary:    Emissions by scope (prev vs sel, grouped bars, % toggle) + Table 1 · Emissions by category (top 10)
  By location: site × scope table for both years + bar
  Scope n:    category table (Category | Location | Emission category | prev: Consumption, Unit, tCO₂e | sel: …) + % distribution bars
  Findings:   key findings bullets (same rules as PDF) + recommended actions
Right rail (≥1440px): "Report preview" thumbnail of branded cover in client theme
```

## Rules
- KPI set mirrors the backend branded report's "Emissions at a glance" (Total, YoY, S1, S2, S3, Data coverage).
- Renewable Electricity (scope null) excluded from scope charts, shown as "Saved" line in KPI tooltip.
- Period labels come from one util respecting `fyStartMonth` and month/quarter (fixes `PdfShared.formatPeriodLabel` hardcoding Apr–Mar).
- **One PDF story:** primary = branded backend PDF (client theme, logo, AI narrative). Secondary "Quick PDF" (client-side @react-pdf) moves under ⋯ and must use `pdfTheme(brand)` + logo (today no brand at all) or be retired; decision for team lead, default = retire after backend PDF covers monthly/quarterly.
- Token: don't put the JWT in the URL. Proposed: short-lived signed download link from the API.
- Superadmin: client switcher sets company; sites list = that company's sites.

## States
No sites: amber callout as today. No data for period: empty state with "Try {prev year}" quick action. Generating PDF: button spinner + toast when ready. Errors inline (today console only).

## Acceptance
Change any filter → results update without navigation. Both years always visible. Branded PDF uses Midal theme for Midal sites. Charts use scope tokens, not hardcoded `#1a56a8/#16a34a`.
