# P11 · EDE report (Emissions Data Entry report)

> Blueprint spec. Route `/reports/ede` (alias `/ede-reports`). Roles: **Manager**, **Superadmin**.
> Replaces `pages/Reports/*` (EdePreports, EdeReportTable, EdeReportCharts, EdeReportsFilters, ReportPdf, downloadPdf).
> Depends on: same components as P10. Shares P10's header filter model.

## Job to be done
"Operational view of approved data: which site emits what, month by month, renewables and intensity."

## Data
`reportService.getEdeReport` (POST `/user/reports/ede` `{siteIds, frequency, year, month?, categoryIds?}`) → totals, bySite, siteDonut, monthlyBySite, savedBySite, renewableKwhBySite, intensityMonthly.

## Layout
```
PageHeader "EDE report"  chips: Sites ▾ Categories ▾ Calendar [CY|FY] Frequency [Year|Quarter|Month] Year ▾   actions: Download PDF
KpiStrip: Total tCO₂e | Scope 1 | Scope 2 | Scope 3 | Renewable produced kWh | Saved tCO₂e
Row: Footprint by site (table: Site | Total | S1 | S2 | S3 | % share bar)  ·  Share by site (single donut, toggle % / tCO₂e)
Monthly emissions by site (stacked/grouped toggle, months × sites)
Row: Renewables produced (kWh by site) · Emissions saved (by site)
Intensity trend (per site: bars emissions + line intensity, dual axis)
```

## Rules
- Same auto-update model as P10 (today EDE auto-fetches but GHG doesn't; unify).
- Add quarterly and FY support (today calendar-only) — needs backend param; until then disable with tooltip.
- Two donuts → one donut with toggle. Remove hidden duplicate chart and leftover `console.log`.
- PDF: uses `pdfTheme(brand)` + client logo + `PoweredBy`; "Generating…" state; filename `EDE_Report_{company}_{period}.pdf`. Show the Overall Totals table on screen too (it's in the PDF only today).
- Site series colours from `--t-series-*` so each site keeps its colour across all charts.

## States
Loading skeletons (today plain text). Errors visible (today swallowed). Filter bar dark-mode safe (today hardcoded `bg-white`).

## Acceptance
KPI strip present; one filter model with P10; PDF branded per client.
