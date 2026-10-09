# P12 · Targets (SBTi)

> Blueprint spec. Route `/targets` (alias `/sbti-commitment`). Role: **Manager**.
> Replaces `pages/sbti/*` (SbtiMain, SbtiNearTerm, SbtiNearTermFilters, SbtiNearTermTableCharts 724, SbtiLongTerm, Sbtilongtermchart 635).
> Depends on: F3 `PageHeader`, `SegmentedControl`, `KpiStrip`, `ChartFrame`, `DataTable`, `Callout`.

## Job to be done
"Set a science-based target and see, every year, whether we are on the pathway."

## Data
`sbtiService.getNearTermTargetTables` (POST `/user/targets/tables` `{siteIds, baseYear, targetYear, annualRate}`) and `getLongTermTargetChart` (POST `/user/targets/long-term-chart` `{siteIds, baseYear}`). Response also has `scope3Share`, `scope3TargetRequired`, `scope1And2CoveragePct/Valid`, `baseTotals` (coverage is not shown today; show it).

## Big change
Landing → filters → results wizard becomes one page. The SBTi rules (landing circles) become a compact "SBTi rules" checklist card that **evaluates the current setup** (✓ base year ≥ 2015, ✓ S1+S2 coverage ≥ 95%, ⚠ Scope 3 is 62% so a Scope 3 target is required).

## Layout
```
PageHeader "Targets"  chips: Sites ▾   controls: Base year ▾ (min 2015, enforced) · Target [Near-term | Net-zero 2050]
   near-term extra: Horizon [5 | 10 yrs] · Pathway [1.5°C 4.2%/yr | WB2°C 2.5%/yr]
KpiStrip: Base emissions | Target (year, tCO₂e) | Latest actual vs pathway (Δ, On track/Off track pill) | Annual rate | Years left
Left: Pathway chart (target bars + actual line + milestones 2030/35/40/45/50)   Right: SBTi rules check card
Tabs: Pathway table · Scope-wise · Actual vs target
   tables as today (Year | N | Target | Reduction | YoY % | Total reduction %; scope-wise; Actual vs Target with Status Reached/Not reached/No data)
Actions: Export (PDF summary + XLSX), PNG per chart
```

## Rules
- On-track/off-track status pills use fixed status colours. Pathway bars `--t-brand`, actual line `--t-ink`, scopes `--t-s1/2/3`.
- Near-term gets KPI cards too (today only long-term has them). Replace emoji icons with Lucide icons.
- Site names come from the chosen sites, not `user.sites`.
- "Commitment" can be saved later (proposed backend `Target` entity) so P06 attention list can show "2030 pathway: on track"; until then compute live.

## States
Calculating skeleton; "No data for base year {y}" with suggested years that have data.

## Acceptance
One page, all controls live; base year < 2015 not selectable; coverage % shown; export available.
