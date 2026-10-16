# SE-1 · Contributor view: total only

> Module spec. FE only. Copy to `src/features/add-data/SE-1.CLAUDE.md`. PR title `[SE-1 1/1] …`, `Completes: SE-1`.
> Depends on: nothing (reads `company.entry_detail` when SE-2 ships it; treat missing as `total`) · Owns: `src/lib/entryDetail.ts` · Touches: add-data, my-entries, bulk-upload (manual path)

## Job to be done
A User entering or checking data sees their fields and "= 1.24 tCO₂e", like the old UI. Managers, Admins and Superadmins keep today's detail.

## Today (evidence, production + open PRs)
- `add-data/components/EntryRow.tsx`: "Calculation method" select (`:129-137`), "(factor unit)" options and "The factor is per X…" help (`:171-173`), "· Global: …" chip (`:101-103`), factor footer "Factor … kgCO₂e per …, year · factor year …" and "No factor for this category" (`:217-225`), "+ FERA …" (`:246`), `TRAVEL_MODE_NOTE` (`:163`).
- `add-data/logic/entry.ts:78` and `my-entries/edit.ts:102`: "The factor is per X and Y can't be converted to it."
- `my-entries/components/EntryDrawer.tsx:138-170` ("Calculation" section, FERA rows), `my-entries/Page.tsx:171` ("+ FERA"), `my-entries/logic.ts:77-87` (`META_KEYS` misses `@method`), `EditEntryForm.tsx:142,166-178`.
- `bulk-upload/components/MapStep.tsx:5-7` (factor hints), `PreviewStep.tsx:36-55` ("Factor used", "Factor", "FERA tCO₂e").
- Arriving with open PRs (merge as they are, then hide here): #202 spend preview (`lib/scope3/spend.ts:172-178`, `EntryRow.tsx:231`) and bulk-upload currency hint (`UploadStep.tsx:83`); #191 Category 3 line (`lib/scope3/fera.ts:63-74`, `EntryRow.tsx:265`, `EntryDrawer.tsx:150-152`); #190 "Sent, with notes" (`steps/Review.tsx:153,199`); #195 transport formula help (`logic/transport.ts:8-16`).

## Build
1. `src/lib/entryDetail.ts`: `showCalcDetail(role, company)` = role is Manager/Admin/Superadmin, or `company.entry_detail === "full"`. Company comes from the user's site (`site.company`, as bulk-upload reads `ai_import_enabled`). Unit tests.
2. Add data, Edit entry, My entries, manual bulk upload: when `showCalcDetail` is false, hide everything listed under Today except the total, the step totals and "unit converted". Unit options show plain unit names; unit help disappears.
3. Plain-language problems for Users: missing factor → "We can't work this row out yet. Your administrator has been told." (the notification itself is SE-4; until then the copy says "Ask your administrator."). Unit can't convert → "This unit can't be used here. Choose another unit."
4. My entries "What was entered": filter every key starting with `@` or `_` (always, not only for Users).
5. The `@method` select: hidden for Users when the form has exactly one method in its spec (auto-select it); when it has several, keep it until SE-3/SE-5 replace it with a client-worded question, but label it "Type of record" and use the Superadmin's choice labels if present. Note this in the PR as temporary.
6. Engine notes after save (#190): Users see "Sent"; the notes go to reviewers (Approvals drawer already shows them).

## Tests
- Unit: `showCalcDetail` matrix (4 roles × `total`/`full`/missing).
- Playwright: as a User on a seeded form, Add data shows no "Factor", "kgCO₂e per", "(factor unit)", "FERA", "Calculation method"; total shows. As a Manager on the same form, the factor line shows.

## Done when
No User screen shows a method, factor, FX, FERA/Category 3 or DQ text; reviewers see the same detail as before; lint:new, typecheck, unit and e2e green.
