# SE-5 · Migrate existing forms

> Module spec. ESG-lite. PR title `[SE-5 1/1] …`, `Completes: SE-5`.
> Depends on: SE-3 · Owns: `src/scripts/migrateEntryForms.ts` (`migrate:entry-forms-data`)

## Job to be done
Forms that make Users pick a method today move to the new model without changing any stored total.

## Build
1. Idempotent script with `--dry-run` (default) listing every form it would change, and `--apply`.
2. `per_method` specs with `method_column: "@method"` (S3-9 travel/commuting from `migrateScope3Travel.ts`; S3-10 Cat 10/12 from `soldProducts/configs.ts` if merged): one method → `method_options: [m]`; several → add a select column "What does your record show?" with plain choices (e.g. "Trip distance", "Fuel used", "Amount spent"), `method_by_choice`, and point `method_column` at it. Existing rows keep `activity_data["@method"]`; the engine still reads it for old rows.
3. Transport `per_unit` forms (S3-8): set `method_options` from the unit → method list in `transport/configs.ts`.
4. Spend: forms whose extras include `spent_value` + `currency` and whose method is spend get the spend recipe fields.
5. Run on staging: before/after recompute of every row of migrated forms must give identical totals (script prints the count and any difference; any difference aborts).

## Tests
Script twice → no second change; dry run changes nothing; golden unchanged.

## Done when
No live form uses `@method`; staging totals identical.
