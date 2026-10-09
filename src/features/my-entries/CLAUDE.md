# P04 · My entries

> Blueprint spec. Route `/data/mine` (alias `/my-emissions`). Role: **User**.
> Replaces `pages/UserEmissionsPage.tsx` (1,675 lines, light-only) and `components/EmissionsFilterSidebar.tsx` (hover-to-open strip).
> Depends on: F3 `DataTable`, `FilterBar`, `KpiStrip`, `Drawer`, `AuditTimeline`, `DocumentViewer`. Shares the record drawer with P07 (read/edit permissions differ).

## Job to be done
"See everything I've submitted, what state it's in, and fix what was rejected."

## Data
`emissionService.getEmissionsPaginated`, `updateEmission`; `columnConfigService` (on demand per site×category, cached — today sequential per category), `emissionFactorService`, `unitService`, `documentService`, AuditLog.

## Layout
```
PageHeader "My entries"  chips: Site ▾  Period ▾   actions: Add data
KpiStrip: Entries | tCO₂e entered | Pending | Approved | Rejected  (each clickable = status filter)
FilterBar (visible, not hidden): search · Category ▾ · Status chips · Clear all (shows active count)
DataTable: Category (+parent) | Key activity | Quantity + unit | tCO₂e | Period | Status (+reason) | Submitted | 📎 | ⋯
Row → Drawer: activity, calculation (quantity × factor), evidence, history; Edit for pending/rejected
Side panel toggle "Breakdown": consumption/emission by type for selected category (old 'Consumption by Type')
```

## Rules
- Edit in drawer uses P03's `DynamicField` + `useEmissionCalc` so the **live tCO₂e preview** appears (today none). Period uses the month picker (today free date input conflicts with month-end rule).
- Reason for edit optional for pending, required for rejected re-submission ("What did you change?").
- Breakdown panel fetched by the server (proposed aggregate), not by paging 500-row loops in the browser.
- Errors as inline banners/toasts (today `alert()`).

## Acceptance
Filters visible without hover; rejected rows can be fixed and resubmitted in the drawer; same table component as P07.

## Build notes (part 2)
- Edit lives in `components/EditEntryForm.tsx` inside the drawer, shown for pending and rejected entries.
- Uses the shared form and calc in `src/lib/emissions` and `DynamicField` from `src/ui`.
- Saving calls `updateEmission` and refreshes the table; errors show inline in the drawer.
