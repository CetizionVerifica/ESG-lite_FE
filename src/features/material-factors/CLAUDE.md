# C04 · Material factors library

> Blueprint spec. Route `/factors/materials`. Role: **Superadmin** (edit global + client rows), **Manager** (view global, add company-specific rows, e.g. supplier-provided values).
> Depends on: F3 (`DataTable`, `FilterBar`, `Drawer`, `FileDrop`, `Stepper` for import), E1 `/pcf/material-factors`, E2 parse-excel + match.

## Job to be done
"Keep one trusted list of cradle-to-gate factors for materials, packaging and freight, with their source, so every footprint uses the same numbers."

## Layout
PageHeader with primary "Add factor", secondary "Import sheet". `FilterBar`: material group, geography, source, licence, year. `DataTable`: Name | Group | Geography | Value | Unit | GWP set | Source + year | Licence | Used by (n studies). Row click → `Drawer` with full metadata and usage list.

## Rules
- Editing a factor used by an approved study never changes that study (results keep their snapshot); the drawer shows "Used by 3 approved footprints. They keep the old value until recalculated."
- Licensed (ecoinvent) values are masked for client users; the source label stays visible.
- Seed set for phase 1 (open sources): primary aluminium by region (IAI), recycled aluminium (IAI/EAA), copper cathode (ICA), PVC/XLPE/PE (PlasticsEurope eco-profiles), steel wire, wooden and steel drums, pallets, freight (reuse DEFRA rows from `docs/factor-files`).
- Import reuses the AI factor-sheet reader (E2) with the same detected-schema review as P22.

## Acceptance
- One factor per name × geography × year × company; duplicates are blocked with a link to the existing row.

## Built (E2 2/2, 2026-10-12)
- Import sheet sends the file to the AI reader (`POST /v1/pcf/material-factors/parse-excel`, `src/services/pcfAiService.ts`): any layout, header row found by the service, columns shown with their confidence and how they were matched (an "AI n%" chip when the service placed the column), rows returned already checked. Changing a column or the sheet re-reads the file with the person's mapping. Low-confidence rows are listed for a check before import.
- When the AI service can't be reached (no answer, 5xx, no such route or a refused token) the drawer falls back to the in-browser reader (`sheet.ts`, header-name matching) and says so; `.xls` files always use it. A 4xx from the service (wrong file type, bad sheet) is shown as is.
