# SE-3 · Capture setup builder and Add data read the form

> Module spec. FE. Copy to `src/features/capture-setup/SE-3.CLAUDE.md`. PR titles `[SE-3 1/2] Builder: method, recipes, field settings`, `[SE-3 2/2] Add data reads field settings and method question`.
> Depends on: SE-2 · Owns: `src/lib/forms/recipes/` · Touches: `capture-setup/components/builder/*` (CalcTab, FieldsTab, Preview, TestTab), `capture-setup/builder.ts`, `add-data` (EntryRow, logic/form), `src/ui/DynamicField`, my-entries edit, clients page (company `entry_detail`, `default_currency`)

## Job to be done
The Superadmin decides, per client form, how the category is calculated and what the contributor sees, in one place, and can see the contributor's view before publishing.

## Build
### 1/2 Builder
1. **Method** section at the top of the Calculation tab: "How is this category calculated for this client?" Pick one method (writes `method_options: [m]`), or "It depends on the record": choose a select field (or create "What does your record show?") and map each choice to a method (`method_by_choice`). Method names (`methodLabel`) are shown here only.
2. **Recipes** (`src/lib/forms/recipes/<method>.ts`, one per method): picking a method offers the fields, formula (`calculation`), unit and expected factor type (spend → Amount + currency, EEIO factor; distance → Weight × Distance, tonne.km; fuel → Litres; supplier → Supplier field + supplier factor). Applying a recipe adds missing fields; the Superadmin then renames/hides. Recipes are config only, no maths.
3. **Fields tab**: per field label, help, default, hidden, read-only, required (`field_settings`).
4. **Units and currency**: allowed units or a fixed unit; currency "Company default (INR)" or fixed.
5. **Preview**: toggle "Contributor view" (default) / "Reviewer view". Contributor view renders exactly what a User sees (SE-1 rules + field settings).
6. Clients page (Superadmin): "Contributors see" Total only / Full calculation (`entry_detail`) and Default currency.

### 2/2 Add data
1. Apply `field_settings` (labels, help, hidden, read-only, defaults shown as text) in `DynamicField` and extras.
2. Replace the `@method` "Calculation method" select with the form's `method_by_choice` question (an ordinary select with the client's labels). Forms with one method show no method UI. Rows no longer send `@method` from Users.
3. Fixed unit shows as text; fixed/default currency hides the Currency field.
4. Preview total still comes from the same `emissionCalc` mirror (must match the server after SE-2 defaults; add cases to the golden snapshot test).

## Tests
- Unit: recipes produce valid SE-2 config; builder draft ↔ config round trip; field-settings rendering.
- Playwright: Superadmin sets "It depends on the record" with two choices; as a User, Add data shows the question in the client's words, no method words, and the saved row has the mapped method (check via Manager drawer).

## Done when
A Superadmin can configure a two-method form without touching JSON; a User never sees a method name; totals match the server.
