# P22 · Emission factors

> Blueprint spec. Route `/factors` (alias `/emission-factors`). Role: **Superadmin**.
> Replaces `pages/EmissionFactorPage.tsx` (608), `components/EmissionFactorList.tsx`, `SmartUploadModal.tsx` (1,550), the client-side Bulk Upload modal.
> Depends on: Setup list pattern + F3 `Stepper`, `FileDrop`. AI: python_AI_service `/v1/emission-factors/*`.

## Layout
```
PageHeader "Emission factors"  chips: Client ▾ Site ▾ Category ▾ Year ▾ · search   actions: Import factors (primary) · Add factor
Tabs: Factors · Imports
Factors: DataTable (server pagination 50): ☐ | Site | Category | Emission category name | Year | Factor (mono) | Unit | Source | Import batch | ⋯
Imports: list of `emission_factor_uploads`: File | Uploaded by | Site | Layout (simple/sub_columns/disposal_pivot) | Records created/skipped | Status | ⋯ (view, delete batch)
```

## Import factors (one entry point, replaces three: single/bulk/smart)
Stepper in a wide drawer:
1. **Upload** sheet (.xlsx/.xls). Choice: "Simple sheet (year, factor_value, unit, source, name)" → parsed in browser; anything else → **AI read** (`parse-excel`).
2. **Check layout** (AI): sheet picker, detected layout, column mapping (Category name*, Factor value*, Unit, Source) each with "AI detected" chip; Re-analyze.
3. **Map to categories**: each Excel parent group → DB category with AI suggestion + confidence (high/medium/low); unmapped groups skipped with warning.
4. **Preview**: target site (one or all of client's sites), filter by group/year, search, editable cells, exclude row toggle; note "Existing site+category+year+name are skipped".
5. **Result**: created/skipped per site; categories not assigned to a site listed; CTA "Generate data-entry forms for these categories" → P24 auto-generate.

## Rules
Category filter on the list shows only the selected site's categories (consistent with forms). Single delete has confirm; success toasts (today commented out). Factor "year" explainer: "Entries for 2025 use 2024 factors" (matches P03 rule).

## Status (P22 ships in 2 parts)
- **1/2 (#108):** Factors tab (server pagination 50, Client/Site/Category/Year filters in the URL, bulk delete), add/edit drawer, single delete with confirm, Imports tab. Needs ESG-lite #73 (`company_id` and `year` on `GET /admin/emission-factors`, `company_id` on `/batches`) merged first.
- Imports tab shows two lists, because the two records aren't linked: **Imported factors** (backend `upload_batch_id` groups; "Delete batch" removes their factors) and **Uploaded sheets** (AI service `emission_factor_uploads`, read-only, file opens in a new tab). Deleting sheet records isn't offered.
- Client filter narrows Site; Site narrows Category; changing one clears the ones below it. A chosen site replaces the client in the query.
- Year options run from next year back to 2015 (no distinct-years endpoint).
- **2/2:** "Import factors" (primary; Add factor moves to secondary) opens a wide drawer.
  - Simple sheet: Upload → Preview → Result, read in the browser (old Bulk Upload headers accepted).
  - AI read: Upload → Check layout → Map to categories → Preview → Result, via `parse-excel` / `re-analyze`. Column changes must be re-analyzed before continuing; sub-column and disposal layouts read one column per year, so no factor column is asked for. Groups start on the AI's high/medium suggestion when the target allows that category; empty groups are skipped.
  - The target (Client, "Save to" a site or all sites of the client) is chosen on Upload, not Preview as the blueprint drew it, because the AI's category suggestions and the Map step need it.
  - Preview: rows editable, excludable, filtered by group/year, searchable; invalid rows block saving; every included row is saved whatever the filters show.
  - Saving: one bulk call per site and group, one after the other so a failing site doesn't stop the rest; `global_category_name` = the full name, as Smart Upload did. A client-wide import skips sites that don't report the category and lists them. The AI upload record is stamped with the outcome.
  - Result lists each site's created and skipped counts with the server's reason for every skipped row (bulk `errors[]`: already exists, site or category not found, missing fields).
  - Factor text: comma thousands grouping ("1,234.5") is read; anything else, such as a decimal comma ("0,5"), is reported as an invalid row instead of being guessed.
  - Preview has "Exclude all shown" / "Include all shown" for the rows the filters show (replaces Smart Upload's include/exclude-all). The old manual "Add row" isn't carried over: add single factors with Add factor.
  - `global_category_name` (= the full name) is sent on simple sheets too, as Smart Upload did for AI reads.
  - **Gap, for P24:** the old in-place "Generate data-entry forms" after an import is not offered. Add it to the Result step once P24's new Forms page reads `?site=&category=&generate=1` (/capture/forms is still the legacy page, which ignores it).
- Old page and modals stay until the flag is removed (as other modules do); with the flag on, `/emission-factors` redirects to `/factors`.
