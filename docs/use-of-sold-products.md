# Use of Sold Products (Scope 3 Category 11) — frontend notes

Frontend half of the Category 11 feature. Full feature doc, formulas, seed data,
and the deploy checklist live in the **backend** repo: `docs/use-of-sold-products.md`.

## What changed here

The data-entry page (`src/pages/UserDataEntry/`) understands an optional
**calculation spec** on the column config (`config.calculation`, typed in
`types.ts` as `CalculationSpec`). When present:

- `useEmissionCalculation.ts` — the live preview computes the **product** of the
  chosen method's fields (`multiply` list; `percent` fields ÷ 100) instead of the
  first-numeric-field heuristic. Statuses are plain language ("Enter Lifetime
  Uses", "% of Gas Released cannot be more than 100"). This mirrors the backend's
  `services/calculationSpec.ts` exactly, so the preview always matches the saved
  total.
- `index.tsx` —
  - numeric columns show/hide per chosen method (`isColumnVisibleForRow`); all
    method-specific numbers are hidden until a Method is picked;
  - switching Method clears numbers the new method doesn't use, prefills
    percentage fields to 100, and preselects the method's `activity_unit`;
  - Bulk Upload is hidden for spec categories (the AI-service import only knows
    one-value × factor math; its API also refuses with a 400 as defence in depth);
  - the spec state resets wherever the rest of the config state resets.

The Method and Country / Fuel / Gas dropdowns, the factor auto-selection, and the
per-country factor lookup are **not** new code — they ride the existing cascading
dropdown + `emission_category_mapping` machinery (same as transport categories).

Categories without a spec (`calculation` null/absent) are untouched — every
pre-existing code path runs unchanged.

## Deploy

Nothing frontend-specific beyond the normal build. Deploy order and the required
`ALTER TABLE column_config ADD COLUMN calculation jsonb NULL` are in the backend
doc. The frontend tolerates a backend without the column (spec is simply absent).
