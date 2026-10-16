# Simple data entry: calculation is set up by the superadmin

Status: **approved 2026-10-16 04:08, assigned to Sami (samidaire) 04:14.** Module specs in `modules/`. Lane order and rules in `README.md`.

## 1. The goal in one paragraph

A data contributor (role **User**) opens Add data and sees only the fields that matter for their company, in their company's words, and a total at the end, as in the old UI. They never choose a calculation method, never see an emission factor, an exchange rate, a deflator, a Category 3 twin, a data quality score or a formula. All of that is decided once per client by the **Superadmin in Capture setup** (Data-entry forms builder) and applied by the server. Managers, Admins and Superadmins still see the full calculation where they review data (Approvals drawer, reports, Capture setup Test tab).

## 2. Principles

1. **The form decides, the server applies.** The contributor sends field values only. Method, factor, unit conversion, currency, FX, deflator, Category 3 twins and DQ are derived on the server from the form config (`ColumnConfig`) and the factor library. This is already how `emissionWrite` works for most categories; the plan closes the gaps.
2. **No method words on contributor screens.** Where a client really has two kinds of records for one category (fuel bills for some trucks, distances for others), the Superadmin adds an ordinary choice field in the client's words ("What does your record show?" → "Fuel bill" / "Trip distance"), and maps each choice to a method in the builder. The contributor answers a question about their paperwork, not about GHG methods.
3. **One switch for detail, per client.** A company setting, `entry_detail` = `total` (default) or `full`, decides how much a User sees on Add data, My entries and bulk upload. Reviewer screens are not affected.
4. **Safe to change.** Each form has a version, gets checked before it is published, and saved rows keep their snapshot, so editing a form never moves stored totals (same rule as factor snapshots today).
5. **Nothing calculates outside `emissionWrite`** (unchanged ESG-lite rule). The builder only stores configuration.

## 3. What a contributor sees today (production + open PRs)

All of this is visible to Users; nothing in add-data or my-entries checks the role.

| Where | What the User sees | Source |
|---|---|---|
| Add data row | "Calculation method" select, "Choose how this row is calculated" (forms whose spec uses `@method`: S3-9 travel/commuting) | production `add-data/components/EntryRow.tsx:129-137` |
| Add data row | Unit options "X (factor unit)", help "The factor is per X…" | `EntryRow.tsx:171-173`, `my-entries/components/EditEntryForm.tsx:142` |
| Add data row | Category chip "Company name · Global: factor name" | `EntryRow.tsx:101-103` |
| Add data row footer | "Factor 2.68 kgCO₂e per litre, 2025 · factor year…", "No factor for this category", "+ FERA … (added on save)" | `EntryRow.tsx:217-246` |
| Add data row | Travel note "Company-owned cars go in Scope 1…" | `EntryRow.tsx:163`, `lib/scope3/travel.ts:7` |
| My entries | Drawer section "Calculation", "FERA (upstream fuel and energy)", "+ FERA" in the list, and the raw key `@method · spend_based` in "What was entered" | `EntryDrawer.tsx:138-170`, `my-entries/Page.tsx:171`, `logic.ts:77-87` |
| Bulk upload (Users) | Map hints "Picks the emission factor…", Preview columns "Factor used", "Factor", "FERA tCO₂e" | `bulk-upload/MapStep.tsx:5-7`, `PreviewStep.tsx:36-55` |
| FE #202 (S3-5) | Amount spent / Currency / Invoice date; preview "₹ 12,40,000 ≈ USD 12,362 (rate on 3 Sep 2026) × 0.42 kgCO₂e/USD (2022 USD, deflated)"; bulk-upload hint about currency codes | `EntryRow.tsx:231`, `lib/scope3/spend.ts:172-178`, `UploadStep.tsx:83` |
| FE #191 (S3-7) | "+ Cat 3 0.12 tCO₂e (upstream of electricity) + 0.08 tCO₂e (T&D losses)", twin rows in My entries drawer | `EntryRow.tsx:265`, `EntryDrawer.tsx:150-152` |
| FE #195 (S3-8, team draft) | Unit help is the formula ("Weight × distance, one row per leg"); the unit select is in effect the method choice; Category 4 vs 9 "Who paid?" help | `logic/transport.ts:8-32` |
| FE #190 (S3-4, team) | "Sent, with notes" engine warnings on Review ("No 2026 factor for Diesel; the 2025 factor was used") | `steps/Review.tsx:153,199` |

Not contributor-facing (no change needed): FE #198 Sold products, #199 GHG report, #200 Base year (all Manager+); S3-11 assets, S3-9 commuting survey setup (Manager+); smart import (never offered to Users); factor drawers (admin).

## 4. What the Superadmin cannot set today

From `ESG-lite/src/entities/ColumnConfig.ts` and the builder tabs (Fields, Choices, Factor match, Extra details, Calculation, Test, Preview):

- A fixed method per form. `method_options` exists only in team draft ESG #135 (S3-3) and nothing writes it; `@method` forces the contributor to pick.
- A choice field that **maps to a method** (today a per_method select picks the multiply fields, but the row's stored method is not derived from it).
- A default or fixed **currency** (no `currency` on company, site or form) and a fixed **unit** (`activity_unit` only preselects).
- Field **defaults, hidden fields, read-only fields** (columns and extras have no `default`, `hidden`, `readonly`).
- **Labels and help text per client** (help is hard-coded copy for transport, travel, spend).
- How much calculation detail a User sees.
- A check that the form is complete before contributors use it, and a version history.

## 5. Target design

### 5.1 Form config additions (`ColumnConfig`, one idempotent `migrate:entry-forms` script)

```
method_options: Method[] | null          // from S3-3 (#135); [0] is the form default
method_by_choice: {                      // NEW: a select field's choices pick the method
  column: string,                        // e.g. "record_type"
  map: { [choiceId]: Method }            // "fuel_bill" → "fuel_based", "trip" → "distance_based"
} | null
field_settings: {                        // NEW, per column name or extra key
  [field]: { label?, help?, default?, hidden?: boolean, readonly?: boolean, required?: boolean }
}
units: { allowed?: string[], fixed?: string } | null    // NEW; fixed hides the unit select
currency: { fixed?: string } | null                    // NEW; else company default
version: int, published_at, published_by                 // NEW
```
`calculation` (multiply / divide / percent / per_unit) stays as it is. A per_method spec whose `method_column` is a normal select replaces `@method` for contributor forms.

Company gets `default_currency` (default INR for current clients, set in Clients) and `entry_detail` (`total` | `full`, default `total`).

### 5.2 How the server picks things (contracts §6 changes)

Method for a row, first that applies:
1. Imports by Admin/Superadmin and MCP may send `method` (must be in `method_options`, else `METHOD_NOT_ALLOWED`).
2. `method_by_choice` from the row's answer.
3. `method_options[0]`.
4. Spend when the matched factor is `eeio_spend` (S3-5 rule, kept).
5. `activity`.

A User's typed entry never sends a method; if it does, it's ignored when the form fixes one. Currency: row unit if it is a currency → form `currency.fixed` → company `default_currency`. Hidden fields with a `default` are filled by the server, not the browser, so bulk upload and Claude imports get the same values.

### 5.3 What the contributor sees (`entry_detail = total`)

- Fields in the order and wording the Superadmin set; hidden fields gone; one unit shown as text when fixed.
- Row footer: **"= 1.24 tCO₂e"** only (as the old UI). No factor line, no FX line, no Category 3/FERA line, no "(factor unit)".
- Problems in plain words that the contributor can act on: "We can't work this row out yet. Your administrator has been told." (missing factor), instead of "No factor for this category". The Superadmin gets a notification and a red mark on the form.
- My entries: "What was entered" (config fields only, internal keys like `@method` filtered) and the total. No "Calculation" section.
- Bulk upload for Users: the template has the form's fields; Preview shows entered values and tCO₂e only.
- `entry_detail = full` restores today's lines for clients that want them (consultant-run accounts).

### 5.4 Capture setup builder (Superadmin)

1. **Method section** at the top of the Calculation tab: "How is this category calculated for this client?" Pick one method (fixed), or "It depends on the record" → choose the select field and map each choice to a method. Method names are shown here, never to contributors.
2. **Recipes.** Picking a method offers a preset: the fields it needs, the formula, units and the factor type it expects (spend → Amount + EEIO factor; distance → Weight × Distance, tonne.km; fuel → Litres; supplier → supplier field + supplier factor). The Superadmin can rename fields and hide the rest. Recipes live in one file per method next to the S3 method files' contracts (`src/lib/scope3/recipes/`), so each S3 module adds its recipe instead of contributor UI.
3. **Field settings** on the Fields tab: label, help, default, hidden, read-only, required.
4. **Units and currency**: allowed list or fixed unit; fixed currency or "company default".
5. **Form check** (new "Check" panel, also run on save): every choice path reaches a factor for the current year, every method's fields are present and numeric, spend forms have a currency and an EEIO factor, units convert to the factor unit, hidden required fields have a default. Publishing is blocked on errors; warnings are listed.
6. **Contributor preview**: the Preview panel renders exactly what a User sees (`total` mode), next to the Test tab with full detail.
7. **Copy to other sites/clients** and **templates**: save a form as a template and apply it to many site × category pairs in one go, with the check run on each.
8. **Version history**: who published what and when; rows keep `form_version` so reviewers can see which form a row used.

### 5.5 Reviewers keep the detail

Approvals drawer (Manager/Admin) shows method label, factor, FX, deflator, Category 3 twins, DQ and engine notes. Reports and the methodology tab are unchanged. This is where S3-3's "How it was calculated" line and DQ badge belong.

## 6. Modules

Small, ordered, each one backend PR then FE PR into `production`, titled `[SE-n k/m]`.

| Module | What | Depends on | Size |
|---|---|---|---|
| **SE-1 Contributor view** | FE only. `entry_detail` read from the company (default `total`, FE falls back to `total` until SE-2 ships the column). Hide factor/FX/FERA/Cat 3 lines, "(factor unit)", Global chip, method select (until SE-3 replaces it), engine notes and "Calculation" section for Users; filter `@method` from "What was entered"; Users' bulk-upload preview shows values and tCO₂e only. Playwright: a User sees no factor text. | none | 1.5 d |
| **SE-2 Form config model** | Backend: migration for `method_by_choice`, `field_settings`, `units`, `currency`, `version`; `company.default_currency`, `company.entry_detail`; schemas in `src/forms/contracts.ts`; server-side defaults and currency; method order of §5.2 in `compute.ts` `methodFileFor`; `METHOD_NOT_ALLOWED`; tenant-isolation tests; golden unchanged. | S3-3 part 1 (`method_options`), or SE-2 adds it if #135 is still a draft | 3 d |
| **SE-3 Builder: method, recipes, field settings** | FE Capture setup: method section, recipes, field settings, units/currency, contributor preview. Add data reads `field_settings` and `method_by_choice`; the `@method` select is removed for Users. | SE-2 | 3 d |
| **SE-4 Form check and versions** | Backend check endpoint (`GET /admin/column-configs/:id/check`), publish with version, `emission.form_version`; FE Check panel, history, missing-factor notification to Superadmin. | SE-2 | 2.5 d |
| **SE-5 Migrate existing forms** | Idempotent script: S3-9 travel/commuting `@method` forms → a client-worded select with `method_by_choice`; S3-10 Cat 10/12 and S3-8 transport forms → `method_options`; spend extras → recipe fields. Dry run lists every form changed; stored totals don't move (golden + a before/after total check on staging). | SE-3 | 1.5 d |
| **SE-6 Templates and copy** | Save as template, apply to many site × category pairs with the check. | SE-4 | 2 d |

SE-1 can start at once and removes every exposure in §3 in one place, including those from PRs still open. SE-2 → SE-3 → SE-5 is the critical path (about 8 lane days); SE-4 and SE-6 run beside it.

## 7. What each Scope 3 PR and spec needs

No running lane is stopped. Merged and open PRs keep going; SE-1 hides their contributor copy behind `entry_detail`. Specs for work not yet built are changed so nobody builds new contributor-facing method UI.

| PR / spec | Status | Change needed |
|---|---|---|
| S3-9 (ESG #147, FE #197) | merged | Its "Calculation method" select and travel note go behind SE-1; its `@method` forms are migrated by SE-5. TripCalculator stays (it's a helper, not a method), shown when the form's method is distance. |
| S3-5 FE #202 / ESG #154 | open, Claude lane | Fine to merge. Amount/Currency/Invoice date stay as fields (they are real data), but Currency is hidden when the form or company fixes it (SE-2/3). The rate preview line and bulk-upload currency hint are Users-hidden by SE-1. Spend should be chosen by the form (`method_options`/recipe), not by typing in a spend field silently setting `@method`; SE-3 replaces that. |
| S3-7 FE #191 | open, Claude lane | Fine to merge. "+ Cat 3 … (T&D losses)" line and twin rows in My entries are Users-hidden by SE-1; reviewers keep them. |
| S3-4 FE #190 | open, team (Sami) | "Sent, with notes" engine warnings go to reviewers only (SE-1); the User sees "Sent" and, for a missing factor, the plain message of §5.3. The INR/USD/EUR currency list is replaced by the form/company currency (SE-2). |
| S3-8 FE #195 / ESG #141 | team drafts (Sami) | Unit help showing formulas moves to the builder recipe; contributor help comes from `field_settings.help`. Transport forms get a fixed unit or a client-worded "What does your record show?" choice instead of the unit acting as method. "Who paid?" stays only if the Superadmin keeps that field. |
| S3-10 ESG #148 | open, Claude lane | Cat 10/12 forms are seeded with `@method`, which makes Users pick a method. Before merge, seed them with `method_options` (one fixed method) or a client-worded select; else SE-5 migrates them. |
| S3-3 ESG #135 (+ FE parts) | team draft (balyancode) | Keep `method_options`, `emission.method/dq/data_type/is_estimate`. **Drop** the contributor method radio cards, the read-only method line and the live "Data quality" line in Add data (spec FE step 3). The method chip and DQ badge go to the Approvals and reviewer drawers only. |
| S3-6 Suppliers (ESG #143, team draft) | not built in FE | Supplier stays a contributor field (it is real data), but "Supplier's own figure" and the matched factor line show to reviewers only; the form decides supplier-specific vs average via `method_by_choice` ("Do you have the supplier's figure?" in the client's words), set by the Superadmin. |
| S3-12 Screening, S3-13/14 reports, S3-11, S3-15 | Manager+ pages | No change. S3-15's review checks `METHOD_GIVEN` should read "method set by form", never ask the User. |
| `scope3/01-contracts.md` §6 | merged spec | Replace "chosen by the row's `method` field" with §5.2 order. |

The specs edits above (S3-3, S3-5, S3-6, S3-8, contracts §6) are one docs PR in ESG-lite, done after approval.

## 8. Decisions (Shyam, 2026-10-16 04:08)

1. A User sees the **total tCO₂e only per row**, like the old UI (`entry_detail` default `total`).
2. Contributors **never pick a method**; the Superadmin maps a plain, client-worded question to methods (`method_by_choice`).
3. Open S3 PRs **merge as they are**; SE-1 hides their contributor-facing detail.
4. Default currency for existing clients: **INR** (`company.default_currency`).

## 9. Risks

- Hiding the factor line removes a self-check contributors use today to catch a wrong unit. Mitigation: the form check (SE-4) and the reviewer drawer carry it; unit is fixed by the form where possible.
- Migrating `@method` forms (SE-5) touches live config; it is a dry-run-first script, run on staging, and stored totals never change (rows keep their snapshot).
- The real prod DB stays untouched by this work; migrations are additive (`prod-db-safety` rules).
