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

## S3-2

### S3-2 · Emission factor metadata

> Module spec. Lane L2. Copy it to `ESG-lite_FE/src/features/emission-factors/CLAUDE.md` (append it under "## S3-2") and to `ESG-lite/src/scope3/contracts/factor.CLAUDE.md`. PR titles `[S3-2 k/m] …` (backend, FE, AI service).
> Depends on (merged): S3-0 · Owns: `EmissionFactor` S3 columns, factor upload/edit/export, FE `emission-factors/*`, AI `excel_parser.py` sub-columns · Touches: `emissionWrite` snapshot builder

#### Job to be done
Every factor records what kind of factor it is, which gases and GWP set it covers, where it applies and which dataset version it comes from. A factor's precision is no longer lost on import. WTT and per-gas columns survive the upload.

#### Guidance
- Use cradle-to-gate factors for Cat 1/2, upstream-only (WTT) factors for Cat 3, and life-cycle factors for the other energy use in the value chain (Introduction, L1340–1380).
- Cover all 7 Kyoto gases including NF₃, with GWPs on a 100-year basis, and disclose the GWP source (L1381–1402).
- Prefer recognised databases, and check them for technology, time and geography fit (L1404–1418).

#### Today
- A factor has only `factor_value decimal(10,4)`, `denominator_unit`, `year`, free-text `source` and the name columns (`ESG-lite/src/entities/EmissionFactor.ts:28-43`).
- The AI importer keeps only the "Total" sub-column (`python_AI_service/app/services/excel_parser.py:418-438`) and rounds to 4 decimals (`:284-300`).
- The FE drawer has only a free-text Source field (`ESG-lite_FE/src/features/emission-factors/components/FactorDrawer.tsx:135-176`).

#### Build
##### Backend (ESG-lite)
1. `migrate:scope3-factor-meta`: add the §2 columns (all nullable). Widen `factor_value` to `numeric(18,8)`; existing values are unchanged. Backfill `factor_type`:
   - from the category's scope (Scope 1 → combustion, Scope 2 → combustion);
   - from FERA categories → wtt;
   - from Scope 3 names → by `ghgCategory` map (Cat 1/2 with a currency unit → eeio_spend, otherwise cradle_to_gate; transport → life_cycle);
   - otherwise `other`.
   
   Set `includes_wtt = true` where the source text says WTT is included or summed in (for example the freight factors in `docs/emission-factor-sources.md:49-51`).

   Backfill `gwp_set` from the source text when it says "AR4", "AR5" or "AR6", otherwise null. Backfill `dataset` from the source text by keyword (DEFRA/DESNZ, IEA, IPCC, EPA, ecoinvent), otherwise null.
2. Factor create, update and bulk upload accept and validate the new fields with `schemas.ts`.
   - Warn `FACTOR_TYPE_MISMATCH` when the type is outside the allowed list for its category's `ghg_category`.
   - A factor with no `denominator_unit` → `UNIT_REQUIRED`. This complements the S3-4 engine rule.
3. The snapshot builder (`emissionWrite/compute.ts` `snapshotOf`, S3-0's location) adds `factor_type`, `gwp_set`, `geography`, `dataset`, `dataset_version` and the gas parts when present.
4. Export (the XLSX of factors) includes the new columns. `GET /admin/emission-factors` returns them and filters by `factor_type`.

##### Frontend (ESG-lite_FE)
1. Factors list: add Type and GWP columns (hidden by default, available in the column picker) and a Type filter chip.
2. Drawer: add Type (select with the plain labels from `src/lib/scope3/labels.ts`), GWP set, Geography (country select plus "Global"), Dataset plus version, and a collapsible "Gas breakdown (optional)" with CO₂, CH₄, N₂O, Other (kg per unit) and Biogenic CO₂.
   - Show a hint when the parts don't add up to the total within 1 %. It's a warning, not a block.
3. Import stepper (P22 2/2): map the new columns when the sheet has them, and show "WTT kept as its own factor" rows in Preview.

##### AI service
`excel_parser.py` returns one candidate per sub-column with `factor_type` and gas parts, at full precision as strings (layer rule 2). Remove the 4-dp rounding warning.

#### Golden cases
None of the §9 cases. Add a regression case that a 2026 factor of `0.00012345` survives upload and calculation at 8 dp.

#### Tests
- API: validation codes, the `FACTOR_TYPE_MISMATCH` warning, tenant isolation on the list filter, and the backfill run twice.
- AI: a pytest sheet with Direct, WTT and Total plus gas columns gives the expected candidates.
- Playwright: edit a factor's type and GWP, then reload.

#### Out of scope
- Choosing factors by geography in the engine. That is S3-3 DQ only; factor selection by site stays as it is.
- EEIO-specific fields are used by S3-5.

#### Done when
- Every staging factor has a `factor_type`.
- New uploads keep WTT and gas columns.
- Snapshots on new rows carry the type and GWP.
- `ci/golden` is unchanged.

#### As built (FE, 2026-10-15)
- Labels and types come from `src/lib/scope3/factor.ts` (written by S3-2 before S3-0's `contracts.ts`; fold it in when S3-0 lands).
- Drawer: Type, GWP set (new factors start on AR6, D7), Geography (countries from `/admin/countries` plus Global `GLO`), Dataset and version, collapsible "Gas breakdown (optional)". The gas hint uses CO₂ + CH₄ × GWP + N₂O × GWP + other (fossil CH₄ GWPs in `GWP100`); biogenic CO₂ is outside the total. Unit is now required (server `UNIT_REQUIRED`). Factors take up to 8 decimals. A `FACTOR_TYPE_MISMATCH` warning from the server shows in the save toast.
- List: Type and GWP columns hidden by default, in the column picker; Type filter chip in the URL (`?type=wtt`, `?type=none`). `DataTable` saved prefs now record the column ids they have seen (`known`), so a new `defaultHidden` column stays hidden for people with saved prefs. The Factors table has no export yet (spec Build 4 waits on Shyam's call).
- Import: simple sheets read `factor_type` (key or label), `gwp_set`, `geography`, `dataset`, `dataset_version`, gas columns and `includes_wtt`. AI read keeps one candidate per sub-column: the primary keeps the plain name; WTT candidates go to their own "WTT" (or "<group> · WTT") group, start unmapped (skipped) and show "WTT kept as its own factor"; other non-primary columns (Direct) start excluded. A row with no unit is now a Preview problem. The AI service puts gas parts on the Direct candidate; the kept primary copies them when it has none, so a default import keeps them. Only named headers are read for metadata (`factor_type` / "Factor type", `gwp_set` / "GWP set"), never a generic "Type" or "GWP". Geography "Global"/"World" becomes `GLO`, gas parts are rounded to 8 dp, and a bad geography or gas value is a Preview problem (the server would skip the row).
