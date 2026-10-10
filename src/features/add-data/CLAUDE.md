# P03 · Add data (contributor data entry)

> Blueprint spec. Route `/data/new` (alias `/data-entry`); deep link `/data/new?site=&category=&period=`. Role: **User**.
> Replaces `pages/UserDataEntry/index.tsx` (**5,557 lines, ~60 useState, 6 modals**), `UserDataEntryPage.tsx`, `UserDataEntry/components/*`, `useEmissionCalculation.ts`, and the invoice flow (AI service).
> Depends on: F1–F3, especially `Stepper`, `Field` set, `UnitInput`, `FileDrop`, `DocumentViewer`, `Drawer`, `Callout`.
> This is the biggest module. Split across 3 developers (see `../../01-plan.md`, workstream W3).

## Job to be done
"Record this month's numbers for my category, from a bill or by hand, see the tCO₂e right away, and send it for approval."

## Data
- Context: `user.sites`, `site.categories` (filtered by `user_categories`), reporting mode lock (`reporting_period` monthly/yearly, `year_type` CY/FY; backend `services/reportingPeriod.ts`).
- Form definition: `ColumnConfig` for site×category (`columns`, `column_options`, `column_dependencies`, `dependent_options`, `emission_category_mapping`, `extra_fields`, `calculation`).
- Factors: `getUserEmissionFactorsBySiteAndCategory` with no year (all years; the calc tries year-1 first, then falls back like the backend save); units `getUserUnitsBySiteAndCategory`; mappings `getMappingsByCompany`; FERA factors.
- Compare: `getPeriodTotal` (approved vs entered) + company `Threshold`.
- Save: `createEmission` / `updateEmission`; 409 duplicate → force replace. Documents `documentService`.
- AI (python_AI_service): `POST /v1/invoices/upload` → `InvoiceData`, `CategorySuggestion` (confidence), `EmissionReady`, validation; `GET /v1/invoices`, reuse/re-extract; distance: `distanceService`, `routingService`, `POST /v1/sea-route`.

## New structure (code)

> Working copy note (P03-A, 2026-10-09): the module lives in `src/features/add-data/`, not `data-entry/`. The calculation is in `hooks/emissionCalc.ts` (+ `hooks/reportingPeriod.ts`), form rules in `logic/form.ts`, period/validation/payload in `logic/entry.ts`, rows in `hooks/useEntryRows.ts` (one reducer), steps in `steps/`, row UI in `components/`. The sketch below is the original plan.

```
src/features/data-entry/
  AddDataPage.tsx            ≤ 250 lines, composes steps
  context/EntryContext.tsx   site, category, period, mode, config (one reducer, replaces ~60 useState)
  steps/ChooseContext.tsx    step 1
  steps/EnterRows.tsx        step 2 (manual) — EntryRow.tsx per row
  steps/FromBill.tsx         step 2 (AI) — BillReview.tsx
  steps/Review.tsx           step 3
  form/DynamicField.tsx      renders one ColumnConfig column (select/number/text/date, dependent options)
  form/ExtraFields.tsx       extra_fields with show_for
  calc/useEmissionCalc.ts    existing logic moved + unit-tested (per_method, per_unit, legacy, FERA)
  distance/DistanceDrawer.tsx (road, rail, air, sea)
  duplicates/DuplicateDialog.tsx
```

## Flow
```
Step 1 · What are you reporting?           Step 2 · Enter values                     Step 3 · Review & submit
 Site (if >1) · Category (scope dot)        [Type it in]  [Start from a bill ✨]       rows summary, total tCO₂e,
 Period: Month picker | Year (CY/FY)          rows ...                                 evidence attached ✓/✗,
 Mode shown as locked chip if locked          live tCO₂e per row + total               vs last period, Submit
 "From My month" deep links skip this step    
```
- Step 1 is a single compact bar when opened from P02 (context prefilled). Period picker = month list for the selected year, no 156-option dropdown; Monthly/Yearly segmented visible before category is picked, disabled with reason when a mode lock exists ("Bahrain · Diesel is filed yearly").
- **Type it in**: each row is a card in a vertical list (not a 4xl modal):
  1. Emission category: auto chip when mapping resolves ("Diesel · Global: Diesel (avg biofuel blend)"), else select.
  2. Activity fields from ColumnConfig; dependent selects show "Select {parent} first"; composite units (passenger.km) show `mult × dist`; distance fields have a **Calculate distance** button opening `DistanceDrawer`.
  3. More details (collapsed if optional): extra fields.
  4. Result line (right-aligned, mono): `1,600 L × 2.68 kg/L = 4.29 tCO₂e`, factor source and year visible, "factor year 2024 used for 2025 data" note (makes the hidden year-1 rule explicit), or "no 2024 factor; 2023 used for 2025 data" when the save falls back to another year.
  5. Comparison chip: "▲ 6% vs Aug (threshold 5%)" warn, or "▼ 3% vs Aug" neutral.
  + Add row, duplicate row, remove row. Evidence: `FileDrop` per row or for all rows.
- **Start from a bill ✨** (AI): drop one or more PDFs/images → progress with stages → split view: bill viewer left, extracted entries right grouped by invoice (vendor, number, date, amount). Each field shows an **AI** chip; category suggestion shows confidence; < 60% in warn tint; validation warnings in a callout ("Total doesn't match line items by 357,621"). The bill is attached as evidence automatically (B8). Uses the **same row component** as manual entry, so validation, period mode and FERA all apply (fixes today: invoice save skipped validation and ignored yearly mode).
- "My bills" library opens as a drawer (preview, reuse, delete).
- **Bulk upload** (monthly and yearly) opens P27's stepper scoped to this site/category.
- **Review**: table of rows, total, evidence status, warnings; Submit sends all; duplicates (409) collected into one `DuplicateDialog` listing each conflict with Skip / Replace per row and "apply to all".
- After submit: success panel "Sent to {manager} for approval" with links: Add another category · Back to My month · View in My entries.

## Existing entries for the context
Below the stepper (or as a tab "Already entered for Sep (4)") a compact `DataTable` of entries for site×category×period: status pill, tCO₂e, actions (Edit if pending/rejected, view factor, documents). Rejected rows show the reason inline with "Fix" button that loads the row into step 2.

## States & validation
- No config for category: `EmptyState` "This category isn't set up for data entry yet. Your admin has been notified." (+ notify, proposed).
- Row validation inline per field (not one joined block): required, unit mismatch with fix hint, % ≤ 100, number > 0.
- Network errors: inline banner with retry; no `alert/confirm`.
- Unsaved rows guard on navigation; draft kept in sessionStorage.

## Acceptance
- No file in `features/data-entry` over 400 lines; calc logic has unit tests covering per_method, per_unit, legacy_field, FERA and unit conversion.
- A bill-extracted row and a manual row produce identical payloads.
- Keyboard: Tab through a row, Enter adds a row, Ctrl+Enter goes to Review.
- Works on a 390px phone for a single row.

## P03-B plan (bill flow, 2026-10-09)
- `steps/FromBill.tsx`: the "Start from a bill" tab of step 2. Drop PDFs/images (`FileDrop`), upload to the AI service, show stages, then a split view: `DocumentViewer` on the left, extracted entries on the right grouped by invoice.
- Extracted entries become ordinary rows in `useEntryRows`, rendered with the same `EntryRow`, so validation, period mode, FERA and `buildPayload` are shared with manual entry. AI-filled fields carry an AI chip; the category suggestion shows its confidence, with a warn tint below 60%.
- Nothing AI-filled is saved until the user confirms each bill's rows ("Use these rows"); then the normal Review step saves them. The bill is linked as evidence (B8) on save.
- "My bills" drawer: list earlier uploads, reuse or re-extract one.
- "My bills" deletes one bill at a time with a confirmation; the legacy library's multi-select bulk delete is not carried over yet.

## P03-C plan (distance, duplicates, existing entries, route switch; 2026-10-09)
- Distance: a "Calculate distance" button on distance fields and composite `mult × dist` units, opening `DistanceDrawer` (road, rail, air, sea) built on `distanceService`, `routingService` and the AI service's `POST /v1/sea-route`.
- Duplicates: one `DuplicateDialog` at Review that lists each 409 conflict, with Skip / Replace per row and "apply to all".
- Existing entries: a compact table of entries already saved for site × category × period, with status, tCO₂e and actions. Rejected rows show the reason and a "Fix" action that loads the row into step 2.
- Per-row evidence: `FileDrop` on a typed row, uploaded through `documentService` after save. An unsaved-rows guard on navigation.
- Route switch: `/data-entry` and the legacy entry routes redirect to `/data/new`; `pages/UserDataEntry/*`, `UserDataEntryPage.tsx` and `/data/new/classic` are deleted, once nothing that is still needed lives only there (bulk upload is checked first).

### P03-C as built (2026-10-09)
- Distance: `logic/distance.ts` (which column takes a distance, count × distance product, per-mode result), `components/DistanceInput.tsx`, `components/distance/*` (drawer, location field, route map). Road and sea use the backend's `/user/emissions/calculate-distance`; rail is the road corridor (else straight line × 1.2); sea falls back to straight-line nautical miles. Shared geo helpers moved to `src/lib/geo/` (old `src/utils` and `services/routingService` paths re-export them).
- Duplicates: `components/DuplicateDialog.tsx` opens after a send with 409s; Replace/Skip per row, "Replace all"/"Skip all", default Skip.
- Already entered: `components/ExistingEntries.tsx` + `logic/existing.ts`. Fix (rejected) and Edit (pending) load the entry as a row with `_editOf`; Review then calls `updateEmission` (the backend sets it back to pending). Composite units load as 1 × the saved product (only the product is stored).
- Evidence: per typed row, kept in memory (`hooks/useRowEvidence.ts`), uploaded with `uploadMultipleDocuments` after the row saves.
- Leaving the page with typed rows not sent asks first (`useUnsavedGuard`, moved to `src/ui`). The draft is cleared once every row is sent or skipped.
- Old page: kept until the new UI goes live (flag off still renders it at `/data-entry`; bulk upload opens only from it until P27). It is deleted in the PR that turns the new UI on.
- Comparison while editing: a pending entry loaded with Edit keeps its saved tCO₂e in `_editSaved`, and `savedExcludingEdits` takes it off the saved total so the "vs last period" chip doesn't count it twice (legacy `effectiveSavedTotals`).
- Not built yet in "Already entered": view factor, documents, and delete (single or batch). My entries (P04) has the drawer with documents; these can move here later.
- A partial send (some rows saved, others failed) keeps the draft; sending the saved rows again later hits the duplicate dialog rather than creating copies.
