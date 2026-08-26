# Yearly Data Entry — Frontend

Branch: `feature/yearly-data-entry` · Requires the backend branch of the same
name (new `emission.reporting_period` / `year_type` columns and validation).

## What this adds

### Data Entry page (`src/pages/UserDataEntry/index.tsx`)

- A **Monthly | Yearly** toggle beside the Date label. It appears **only** when
  the selected category is spend-based (Purchased Goods and Services, Capital
  Goods) — mirroring the backend allow-list. Leaving a spend-based category
  snaps the mode back to Monthly.
- In Yearly mode the month picker becomes a **CY/FY + year picker**
  ("CY 2025", "FY 2025-26"). The selection drives `selectedDate` to the
  period-end date the backend expects (CY → Dec 31, FY → Mar 31 of the
  following year), so everything downstream (fetching, factor year) keeps
  working unchanged.
- The entry modal title names the period — e.g.
  **"Add New Entries · FY 2025-26 (yearly)"** — so nobody files a year into the
  wrong slot. A per-row Received Date stays informational and no longer moves a
  yearly row out of its reporting year.
- Save payload carries `reporting_period` and `year_type`
  (`src/services/emissionService.ts`). Backend 409 mode-lock messages surface
  in the modal's existing error box.

### Manager Dashboard (`src/pages/ManagerDashboard/…`)

- Yearly rows are **excluded from the monthly trend and year-over-year
  charts** — plotting a year's total on its period-end month would draw a false
  spike (this is exactly what Noida's data currently does with its December
  dump).
- They are surfaced instead as an amber note under the Monthly Net Emissions
  Trend title: *"+ N tCO2e filed as yearly batches — counted in totals, not
  shown as monthly bars."* KPI cards and category totals still include them.

## Bug fixes (first commit — affect the whole app, production has these bugs today)

- **Dead clear button:** the Dropdown component's ✕ sat inside a
  `pointer-events-none` wrapper, so its `onClick` could never fire on any of
  the ~24 pages using the component — clicking ✕ fell through and opened the
  menu instead of clearing. This is why the Category Mappings list once seemed
  to show the wrong rows: a stuck filter. Fixed with `pointer-events-auto` on
  the control itself.
- **Null-clear crash:** a working ✕ passes `null` to `onChange`; the three
  handlers that read `opt.id` directly are now guarded
  (`CategoryMappingPage` both filters, `MappingUploadModal` site).
- **Filter race:** `CategoryMappingPage`'s fetch effect is split (reference
  data vs mappings) with cancellation, so a slower superseded response can no
  longer overwrite newer filter results.

## Testing

Covered together with the backend branch: 40 automated API/DB checks plus 10
manual UI tests (toggle visibility rules, yearly save end-to-end, all three
mode-lock refusals, manager approval, dashboard note, monthly regression,
document attach). Screenshots on file with @samidaire.

## Known follow-ups (not in this branch)

- Submission Status panel is not yearly-aware yet (still counts covered months
  as missing).
- Bulk Upload does not offer the yearly period yet — spreadsheet imports always
  file as monthly.
- After editing category mappings as Superadmin, an already-open Data Entry
  page keeps its loaded copy until refreshed — consider cache invalidation.
