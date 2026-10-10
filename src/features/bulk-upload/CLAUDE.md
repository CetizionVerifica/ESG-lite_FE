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
  - **Historical import** is at `?mode=historical`. It posts to `POST /admin/upload/emissions` with `companyId`, `siteId` and `categoryId`, first with `dryRun=true` for the preview. Months already filed, repeated months and rows with no total are skipped with a reason. New people get an invite through #79's `issueInvite`, and the result shows a warning when email isn't configured.
  - **Contributors:** the route also allows `User`. A contributor sees only their own sites (from the signed-in user, without FERA), has no client picker and no historical import, and reads the form through `/user/column-configs`. Add data links to `/capture/upload?site=&category=&period=`, using the month the entry period ends. This is a link to the same page, so nothing had to move to `src/ui`.
  - **Legacy files:** `pages/UploadPage.tsx` and `pages/BulkUpload/*` are kept until the PR that turns the new UI on, following the P03 and P24 precedent. With the flag off, `/upload-data` and the classic Add data modal still use them. With the flag on, `/upload-data` already redirects to `/capture/upload` (routeMap).
