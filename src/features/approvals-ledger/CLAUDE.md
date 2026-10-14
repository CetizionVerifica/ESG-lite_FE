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
Replaces the orange collapsible panel. Columns: Category, Rows, Status split bar (pending/approved/rejected), Uploaded by, Uploaded at, Actions (Review rows, Approve pending, Reject pending). **Batch reject only touches pending rows**, with a separate explicit "Reject approved rows too" checkbox (fixes today).

**Review rows** (2026-10-13, Shyam: a manager reviews each entry of a Claude import on its own) is a link (so it opens in a new tab too) to the Approvals tab with `?batch=<upload_batch_id>` and the batch's site and category as context (the Ledger when nothing is pending). The list then shows only that batch's rows under a "Showing the … rows of one upload batch" line with "Show all rows"; every row keeps its own Approve, Reject and drawer, and the tab badge counts that batch. `GET /user/emissions?batchId=` does the narrowing (ESG-lite). "Approve pending" on the batch approves only the rows still pending, so rows handled one by one are left as they are.

`?view=batches&batch=<upload_batch_id>` (the link in an `UPLOAD_PENDING` notification, IM4) lands on that batch: DataTable `highlightId` turns to its page, focuses the row and marks it `aria-current`; a batch not in the list (other sites, or already handled) shows a status line above the table.

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

## Needs attention (XI5, smart Excel import; spec `/mnt/project-files/excel-import/modules/XI5-review-polish/CLAUDE.md`, ESG-lite `docs/excel-import/`)
After a smart import the manager reviews the batch one row at a time, sees first the rows the mapper was least sure about, and approves the rest together. Per-row approve/undo, reject-with-reason and batch "Approve pending" stay as they are.
- **Chip** "Needs attention (n)" on the Review rows status line (Approvals tab with `?batch=`): sends `attention=1` with `GET /user/emissions?batchId=`; `n` is the summary's `attention` count from a separate `limit=1` request with the list's own filters (pending only, no attention filter; `useListAttention`), so it never counts approved rows. With no `?attention` param the list waits for that count before its first fetch, so it loads once, already filtered. On by itself while n > 0; `?attention=0` turns it off, `?attention=1` forces it (`attentionOn`). Hidden whenever the API sends no count (an older API ignores the filter), even with `?attention=1`. "Show all rows" and "Clear filters" drop it.
- **Drawer**: "Imported from Sheet!Cell · Matched by: remembered from an earlier upload / suggested (64 %) / matched by name", read off `extra_data.import` (`row_ref` since IM1; `meta { source, confidence }` is what the ESG-lite half of XI5 adds for smart-import rows). A typed entry shows nothing.
- **Batch "Approve pending"**: the dialog asks the API for the batch's attention count (`useBatchAttention`, `status=pending&batchId=`, `summary.attention`, or `attention_count` as ESG-lite #127 first named it, via `attentionOf`); with n > 0 it reads "Approve all N pending rows?" with "n of N pending rows were matched (numbers formatted, singular for 1) by the smart import below 80 % or changed before the import", a "Review them first" button (Review rows with `attention=1`) and "Approve all". Without the count (older API) the dialog is unchanged.
- Decision 6 (uploader = approver audit note) is the backend's; nothing to show here.
- **Uploader approves own batch** (ESG-lite #127): allowed only while none of its rows was edited after the upload; otherwise ESG-lite refuses the whole batch with 403 and the dialog says "Someone else must approve this batch: rows you uploaded were edited after the upload." (`batchApproveError`).
- Tests: `logic.test.ts` ("needs attention (XI5)"), `e2e/approvals-ledger.spec.ts` (chip on by default and off by click, count is pending-only and the list loads once with the filter, drawer line, approve dialog → Review them first).
