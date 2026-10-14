# P27 · Bulk upload (emission rows)

> Blueprint spec. Route `/capture/upload` (alias `/upload-data`) for Superadmin; the same `BulkUploadStepper` opens from P03 for contributors (scoped to their site/category).
> Replaces `pages/UploadPage.tsx` (legacy import, shows default password in plain text) and `pages/BulkUpload/*` (FileUploadStage, ColumnMappingStage, ReviewStage, UseBulkUpload). AI service: `/v1/excel/upload → unique-categories → preview → import`.

## Stepper
1. **Upload** — Client* and Site* (Superadmin) or prefilled (contributor); Category (or "from the sheet"); FileDrop `.xlsx/.xls/.csv`; **Download template**; tips.
2. **Map columns** — required field → sheet column, auto-matched with "Matched"/"Check" chips, Skip toggle; category list loads automatically (no separate "Load categories" click); select categories to import.
3. **Preview** — first 100 rows with Global category, Factor, Unit, tCO₂e, Issue column; filter by issue; counts Valid/Issues.
4. **Import** — progress bar; result stays on screen (no auto-close) with imported/skipped and downloadable skipped-rows CSV; link to P07 Upload batches (rows arrive as **pending**).

## Legacy import (Superadmin only, behind "Historical import")
Keep the year/month/equipment… format but: pick existing site/category only (no free-text creation that bypasses master data), require client, preview before import, and **never display passwords**; created users get invite emails.

## Rules
Closable while busy with "continue in background" (import keeps running; toast when done).

## As built
- Part 1 (FE #116, with python_AI_service #21): the four-step stepper, context in the URL (`?client=&site=&category=&period=`). The per-row date key is `date_of_reporting`. There is no "category from the sheet" option, because the AI service needs one category_id.
- Part 2 (with ESG-lite #83, stacked on #79):
  - **Historical import** is at `?mode=historical`. It posts to `POST /admin/upload/emissions` with `companyId`, `siteId` and `categoryId`, previewing by default and saving only with `commit=true`. Months already filed, repeated months and rows with no total are skipped with a reason. New people get an invite through #79's `issueInvite`, and the result shows a warning when email isn't configured.
  - **Contributors:** the route also allows `User`. A contributor sees only their own sites (from the signed-in user, without FERA), has no client picker and no historical import, and reads the form through `/user/column-configs`. Add data links to `/capture/upload?site=&category=&period=`, using the month the entry period ends. This is a link to the same page, so nothing had to move to `src/ui`.
  - **Legacy files:** `pages/UploadPage.tsx` and `pages/BulkUpload/*` are kept until the PR that turns the new UI on, following the P03 and P24 precedent. With the flag off, `/upload-data` and the classic Add data modal still use them. With the flag on, `/upload-data` already redirects to `/capture/upload` (routeMap).

## As built (IM11, with python_AI_service #25)
Spec: ESG-lite `docs/mcp-import/later/IM11-bulk-upload-on-plans/CLAUDE.md`. The page keeps its four steps; Preview and Import now read ESG-lite's plan instead of the Python calculation, so a sheet row and a typed entry are the same code (IM1 engine behind the IM2 plans API, channel `bulk_upload`).
- **Preview** (`usePreview`, `fetchPreviewRows`): one call plans the whole sheet and answers `{ plan, rows, total_rows, not_selected, sheet_rows }`. `plan` is the IM0 `ImportPlan` without rows (`PlanSummary` in `excelService.ts`): the KPI strip shows its `counts.ready`, `counts.issue + skipped` and `totals.tco2e` for the whole sheet; the table shows the first 100 rows with the factor used (and its year), value, unit, tCO₂e, FERA tCO₂e (hidden by default) and the Issue column. `rowIssue` reads the row's `state`: `issue`/`skipped` rows are "Won't import" (red, `row_error` = the engine's messages), a `row_warning` imports as shown (amber). There are no "saved as 0 tCO₂e" rows any more: no factor or a zero total is an issue the engine refuses. The page keeps the last plan's id in a ref and sends it as `cancel_plan_id` on the next preview, so re-mapping doesn't pile up drafts (ESG-lite allows ten per user); it is cleared after an import or "Start another upload".
- **Import** (`useImportRows`, `importAllRows`): sends `plan_id` + `version` from the preview (no `user_id`; ESG-lite knows the caller from the token). The button says `Import N rows` with N = `counts.ready`, and is off when the plan has no id (every row refused before planning) or nothing is ready. The result keeps `inserted`, `skipped`, `skipped_rows` (row number, category, the engine's reason), `fera_inserted` (shown as a hint under Imported) and `upload_batch_id`.
- **Errors:** the AI service passes ESG-lite's status and IM0 body on under `detail`; `ExcelServiceError` carries `status` and `code`. A `409 IMPORT_PLAN_VERSION_CONFLICT` (rows changed between preview and commit) shows as `PLAN_CHANGED_MESSAGE`; "Back to preview" after any failed import previews afresh (a new plan, the old one cancelled). The document-claim 409 (file already imported) keeps its old string message.
- **Mapping:** the value field can't be skipped any more (`canSkip`): ESG-lite refuses a row with no value and no fields, where the old service guessed a value from any number column. Multi-field forms still have no value field.
- Tests: `logic.test.ts` (issues by state, counts from the plan, value not skippable, skipped rows with their row number) and `e2e/bulk-upload.spec.ts` (preview body, plan KPIs, issue filter, import body with `plan_id` and `version`, skipped-row line).
