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
