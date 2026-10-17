# P24 · Capture setup (Columns library + Column configs = data-entry forms)

> Blueprint spec. Routes `/capture/forms` (alias `/column-config`) and `/capture/columns` (alias `/manage-columns`). Role: **Superadmin**.
> Replaces `ColumnPage.tsx`, `ColumnConfig.tsx`, `components/ColumnList.tsx`, `ColumnConfigList.tsx` (61 isDark), `EditColumnConfigModal.tsx` (1,366), `AutoGenerateColumnConfigModal.tsx` (1,670). AI: `infer-columns`, `infer-all-columns` via ESG-lite `columnConfigGenerator.ts`.
> Depends on: F3 + reuses P03's `DynamicField` for a **live form preview**.

## Job to be done
"Design the form contributors fill for each site × category, and see exactly what they'll see."

## Forms list `/capture/forms`
```
PageHeader "Data-entry forms"  chips: Client ▾ Site ▾ · search   actions: Auto-generate (needs site+category) · New form
Coverage matrix (site rows × category columns): ● configured · ○ missing (click → create/auto-generate)
DataTable: Form name | Site | Category | Fields | Calculation mode | Mappings | Extra fields | Updated | ›
```

## Form builder `/capture/forms/:id` (full page, replaces modal + table chips; one place to edit)
```
Left 55%: builder tabs                                Right 45%: Live preview (P03 row, themed)
 1 Fields      ordered list, drag to reorder, add from library, per-field options override
 2 Choices     dropdown options; dependent options shown as a tree (Mode › Vehicle › Fuel)
 3 Factor match  rules mapping choice paths → emission category (table + "Generate from choices"), with validation that each target exists in factors
 4 Extra details extra fields: label, key (auto from label), type, required, show for
 5 Calculation  None | Per method | Per unit; plain-language editor: "When Method is 'Fuel-based', multiply Fuel used × Share (%)"; preselected unit; duplicate-check fields
 6 Test         enter sample values → see computed tCO₂e with the real factor
```
- Plain words instead of raw keys: "Paper › Recycled" instead of `Paper|Recycled`; `field_key` auto-generated and editable under "Advanced".
- Auto-generate (AI) opens as a Stepper: unit groups → proposed fields/choices/mappings → review in the same builder before saving; option "Also create missing units".

## Columns library `/capture/columns`
DataTable: Column | Type | Options count | Used by N forms. Drawer: name, type, default options editor. Changing type away from Select warns before wiping options; delete blocked with list of forms using it (as today, but as a dialog).

## Acceptance
Every form edit is visible in the preview instantly; no `alert()`; delete confirm; dark mode consistent.

## S3-3 as built (Methods offered, 2026-10-16; spec `src/lib/scope3/CLAUDE.md`)
- Calculation tab, Scope 3 forms only (the category's `ghg_category`): "Methods offered" chips, the category's methods (contracts §1) in their order, most specific first; whatever order they're ticked in, the saved list stays most specific first and the first is Add data's default. "Offer all N methods" prefills the category's list.
- Each offered method takes its units (comma-separated; contracts §6 needs at least one); an "@method" formula's result unit or a per-unit spec's units are suggested. An offered method an "@method" formula lacks blocks saving.
- Saved as `method_options: [{method, units}]` (null when none is ticked); the live preview shows the method cards. Logic in `methodOptions.ts`, UI in `components/builder/MethodsOffered.tsx`.
