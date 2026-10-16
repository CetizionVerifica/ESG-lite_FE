# SE-0 · Scope 3 spec updates

> Module spec. Docs only, ESG-lite `docs/scope3/`. PR title `[SE-0 1/1] Scope 3 specs: method set by the form, not the contributor`.
> Depends on: nothing · Owns: the doc edits below.

## Job to be done
Stop future Scope 3 work from building User-facing method or calculation UI.

## Build
1. `docs/scope3/01-contracts.md` §6: replace "The method is chosen by the row's `method` field. When it's missing, by the form's `method_options[0]`. Otherwise `activity`." with the order in `00-plan.md` §5.2 (Admin/MCP import `method` → `method_by_choice` → `method_options[0]` → `eeio_spend` factor → `activity`; a User's typed entry never sends a method).
2. `modules/S3-3-method-and-data-quality/CLAUDE.md`: drop FE step 3 (Add data method radio cards, read-only method line, live "Data quality" line) and the "method picker shows on multi-method forms" done-when line. Keep `method_options`, the row columns, DQ defaults, and the method chip + `DataQualityBadge` in reviewer drawers (Approvals). My entries (Users) shows neither.
3. `modules/S3-5-spend-based/CLAUDE.md` FE step 1: the FX preview line shows only when `showCalcDetail` (SE-1); Currency is hidden when the form or company fixes it (SE-2).
4. `modules/S3-6-suppliers/CLAUDE.md` step 2: Supplier stays a field; "Supplier's own figure" vs average is chosen by the form (`method_by_choice` with a client-worded question); the matched supplier factor line is reviewer-only.
5. `modules/S3-8-transport/CLAUDE.md`: unit help with formulas moves to the builder recipe; User help comes from `field_settings.help`.
6. `modules/S3-15-review-workflow/CLAUDE.md`: check `METHOD_GIVEN` means "method set by the form or import", never asked of a User.
7. Add a "Simple data entry" section to ESG-lite root `CLAUDE.md` (3 lines: rules 1–3 of `ESG-lite_FE/docs/simple-entry/README.md`).

## Done when
The six edits are merged and no Scope 3 spec asks for a User-facing method picker, factor line or DQ line.
