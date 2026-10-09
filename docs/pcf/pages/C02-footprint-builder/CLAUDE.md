# C02 · Footprint builder

> Blueprint spec. Route `/products/:productId/footprints/:studyId/edit`. Role: **Manager**.
> Depends on: F3 (`Stepper`, `DataTable` editable mode, `UnitInput`, `Combobox`, `FileDrop`, `Drawer`, `Callout`), C04 (factor picker), E1 inputs/allocation-preview/calculate, E2 BOM import + matching.

## Job to be done
"Describe how one unit of this product is made, using data we already have wherever possible, and see the footprint build up as I go."

## Layout
Left: `Stepper` (6 steps). Centre: step content. Right rail (sticky, 280px): **running total** kgCO₂e per declared unit with a stage stacked bar, completeness checklist, and "Calculate" button. Autosave on every change (draft).

## Steps
1. **Scope**: product (fixed), producing site, declared unit (e.g. 1 t, 1 km) and mass per unit, reference period (12 months, CY/FY chips), boundary (Cradle-to-gate default; Cradle-to-grave disabled until phase 4), standard + optional PCR tag, "Copy from previous version".
2. **Materials (A1)**: editable table: Material | Qty per declared unit | Unit | Recycled % | Origin | Supplier | Factor (picker from C04, shows value + source) | Data type (Primary/Secondary) | DQR. Buttons: "Import BOM" (FileDrop → E2 parse-bom → review table with AI chips), "Suggest factors" (E2 match-factors). Yield field: "Process yield 97%" scales material masses.
3. **Inbound transport (A2)**: one row per material leg: Mode (road/sea/rail/air) | From → To | Distance km (sea via existing sea-route service, road manual) | Mass auto from step 2 | Factor (existing DEFRA freight rows). "Same as last version" toggle.
4. **Plant energy (A3)**: read-only table from **approved** corporate data of the site for the period: Category | Scope | Plant total tCO₂e | Allocation key | Product share | kg per unit. Key selector (Mass default; Machine hours / Metered energy / Economic / Manual % with reason). Shows production used (from approved `ProductionData`, link to P08). Warn callout if any month in the period has pending or missing entries.
5. **Packaging and waste**: reels/drums, pallets, wrap per declared unit; process waste to treatment.
6. **Review**: totals by stage, cut-off list (items < 1% omitted, sum < 5%), primary data share, DQR, unresolved warnings (low AI confidence, unit mismatch, missing factor). Actions: "Calculate" (writes draft result) and "Submit for review".

## Rules
- Nothing typed twice: A3 always comes from approved plant data; editing it means going to P07.
- A factor shown in the picker always shows its source and year; ecoinvent-licensed values show the source but mask the value for non-PlanetPulse users.
- Status pills and AI chips follow F1/F3 rules; low confidence lines are warn-tinted and block Calculate until confirmed.

## Acceptance
- A Midal rod pilot can be built from a BOM file in under 15 minutes.
- Running total updates within 300ms of an edit (client-side compute with E1 engine logic shared or mirrored, confirmed server-side on Calculate).
- Matches screen "Builder" in the previews artifact.
