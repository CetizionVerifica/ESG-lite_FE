# P23 · Category mappings

> Blueprint spec. Route `/factors/mappings` (alias `/category-mappings`). Role: **Superadmin**. Setup list pattern.
> Replaces `pages/CategoryMappingPage.tsx` (417) and `components/MappingUploadModal.tsx`. AI: `POST /v1/category-mappings/parse-excel`.

## Job to be done
"Translate each client's own names ('HSD fuel') to the global factor names ('Diesel') so entries pick the right factor."

## Layout
```
PageHeader "Category mappings"  chips: Client ▾ Category ▾ Site ▾ · search   actions: Import sheet · Add mapping
DataTable (paginated): ☐ | Client | Category | Client's name | → Global factor name (with ✓ matched / ⚠ no factor) | Site (All sites) | ⋯
Bulk bar: Delete
Drawer "Add/Edit mapping": Client*, Category*, Site (optional = company-wide), Client name*, Global name* (Combobox from `getEmissionCategoryNames`, shows factor value/unit)
```
## Import (Stepper)
Upload (client*, category*, site) → AI parse → preview with match summary ("38 of 42 match existing factors"), include toggles, inline edit → result (created/skipped/errors).
## Rules
Manual add exists (today import-only). One delete control (today duplicated). Unmatched mapping rows get warn tint and a "Create factor" link to P22.
