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

## Status (P22 ships in 3 parts)
- **1/3 (#108):** Factors tab (server pagination 50, Client/Site/Category/Year filters in the URL, bulk delete), add/edit drawer, single delete with confirm, Imports tab. Needs ESG-lite #73 (`company_id` and `year` on `GET /admin/emission-factors`, `company_id` on `/batches`) merged first.
- Imports tab shows two lists, because the two records aren't linked: **Imported factors** (backend `upload_batch_id` groups; "Delete batch" removes their factors) and **Uploaded sheets** (AI service `emission_factor_uploads`, read-only, file opens in a new tab). Deleting sheet records isn't offered.
- Client filter narrows Site; Site narrows Category; changing one clears the ones below it. A chosen site replaces the client in the query.
- Year options run from next year back to 2015 (no distinct-years endpoint).
- **2/3:** "Import factors" (primary; Add factor moves to secondary) opens a wide drawer: Upload → Preview → Result. Simple sheets are read in the browser (old Bulk Upload headers accepted). Preview picks Client, "Save to" (a site, or all sites of the client) and one Category; rows are editable, can be excluded, filtered by year and searched; invalid rows block saving. Saving sends one bulk call per site (sequential, a failing site doesn't stop the rest) with `global_category_name` = the full name, as Smart Upload did. A client-wide import skips sites that don't report the category and lists them. Result links each new site+category to `/capture/forms?site=&category=&generate=1` for P24 to honour.
- **3/3:** AI read path (check layout, map to categories), old page, `EmissionFactorList.tsx` and `SmartUploadModal.tsx` deleted.
