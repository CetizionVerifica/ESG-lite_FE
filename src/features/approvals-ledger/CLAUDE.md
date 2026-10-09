# P07 · Approvals and Emissions ledger

> Blueprint spec. Routes `/data/approvals` (default tab) and `/data/ledger`; alias `/data-manage`. Role: **Manager**.
> Replaces `pages/Manager/index.tsx` (1,117 lines), `Manager/EmissionsTable.tsx` (1,557 lines), `ManagerPage.tsx`.
> Depends on: F3 `DataTable`, `FilterBar`, `StatusPill`, `Drawer`, `AuditTimeline`, `DocumentViewer`, `Modal`, `Field` set.

## Job to be done
Approvals: "Clear my queue quickly and safely, with the evidence in front of me."
Ledger: "Find, correct and export any emission record."

## Data
`emissionService`: getEmissionsPaginated, approveEmission, rejectEmission, bulkApproveEmissions, bulkRejectEmissions, bulkDeleteEmissions, getEmissionBatches, approveEmissionsByBatch, rejectEmissionsByBatch, managerUpdateEmission, exportMonthlyEmissions.
`columnConfigService.getUserColumnConfigsBySiteAndCategory` (load **once per site×category on demand**, not in an N×M loop), `emissionFactorService`, `unitService`, `documentService.getDocumentsByEmission`, AuditLog (`entity_type = emission`).
Proposed: B6 server sort/search, B7 year export.

## Layout
```
PageHeader "Emissions"  tabs: [Approvals (N)] [Ledger] [Upload batches (N)]
            context chips: Sites ▾  Category ▾  Period (month picker)   actions: Export ▾
FilterBar: search (category, value, submitter) · Status chips (Pending/Approved/Rejected) · Submitted by ▾ · Has evidence ☐
DataTable ───────────────────────────────────────────────────────────────────────
☐ | Site | Category (+scope dot) | Key activity (1 line, "+3 fields") | Quantity + unit | tCO₂e (mono, right) | Period | Status | Submitted by · when | 📎 | ⋯
Bulk bar (appears on selection, sticky bottom): "12 selected · Approve · Reject · Delete · Clear"
Row click → Drawer (720px)
```

## Approvals tab
- Defaults: Status = Pending, sorted oldest first.
- Keyboard: `J/K` move, `A` approve, `R` reject (opens reason), `Space` select, `Enter` open drawer. Shown in a shortcuts hint.
- Approve single = immediate with **Undo toast (8s)** instead of no confirmation.
- Reject = small modal, reason required (min 5 chars), suggested reasons chips ("Wrong unit", "Missing invoice", "Duplicate", "Wrong period").
- Over-threshold rows (vs previous month, company `Threshold`) show a warn icon with tooltip "+6% vs Aug, threshold 5%".

## Ledger tab
- All statuses, sortable by any column, server pagination 50/100/200, column picker, density toggle.
- Export: CSV/XLSX for current filter; **Year** export (B7) and **Month** export (existing).
- Delete allowed for pending, approved, rejected (today approved only) with confirm modal; deletion of approved writes AuditLog reason.

## Upload batches tab
Replaces the orange collapsible panel. Columns: Category, Rows, Status split bar (pending/approved/rejected), Uploaded by, Uploaded at, Actions (Approve pending, Reject pending). **Batch reject only touches pending rows**, with a separate explicit "Reject approved rows too" checkbox (fixes today).

## Record drawer
Header: category, site, period, StatusPill, tCO₂e (large mono).
Sections:
1. **Activity** — all `activity_data` fields as label/value, option IDs resolved to labels; FERA child shown as nested row "FERA (fuel- and energy-related) +X tCO₂e".
2. **Calculation** — quantity × factor = result, factor from `emission_factor_snapshot` (value, unit, source, year). Makes audit easy.
3. **Evidence** — documents list with inline `DocumentViewer`; AI-extracted bills show "AI" chip and link to original (B8).
4. **History** — `AuditTimeline`.
5. Footer actions: Approve · Reject · Edit.
**Edit mode** inside the drawer (replaces the max-w-4xl modal): dynamic fields from ColumnConfig (cascading dependent selects "Select {parent} first"), unit, date, **reason (required)**; approved rows show info banner "Changes are logged".

## States
Empty approvals: "You're all caught up" + link to Ledger. Empty filter: "No records match" + Clear filters. Errors: inline banner + toast (no `alert()`).

## Fixes vs today
Two select-all bars → one selection model · 12 wide columns + tall Activity cell → one-line summary + drawer · 156-option month dropdown → MonthPicker · pending count per page → global count in tab badge · no sort/search → both · sequential N×M config loading → on-demand cache.

## Acceptance
- Approve 20 pending rows with keyboard only, no mouse.
- Undo restores status and removes the AuditLog entry or adds a reversal entry.
- Drawer opens < 300ms from cached row data; configs fetched lazily.
- Same table component as P04, P05, P08.
