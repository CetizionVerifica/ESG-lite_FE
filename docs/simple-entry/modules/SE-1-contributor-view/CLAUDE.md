# SE-1 · Contributor view: total only

> Module spec. FE only. Copy to `src/features/add-data/SE-1.CLAUDE.md`. PR title `[SE-1 1/1] …`, `Completes: SE-1`.
> Depends on: nothing (reads `company.entry_detail` when SE-2 ships it; treat missing as `total`) · Owns: `src/lib/entryDetail.ts` · Touches: add-data, my-entries, bulk-upload (manual path)

## Job to be done
A User entering or checking data sees their fields and "= 1.24 tCO₂e", like the old UI. Managers, Admins and Superadmins keep today's detail.

## Today (evidence; find by the quoted copy or symbol, line numbers move)
- `add-data/components/EntryRow.tsx`: "Calculation method" select, "(factor unit)" options and "The factor is per X…" help, "· Global: …" chip, factor footer "Factor … kgCO₂e per …, year · factor year …" and "No factor for this category", "+ FERA …", `TRAVEL_MODE_NOTE`.
- `add-data/logic/entry.ts` and `my-entries/edit.ts`: "The factor is per X and Y can't be converted to it."
- `my-entries/components/EntryDrawer.tsx` ("Calculation" section, FERA rows), `my-entries/Page.tsx` ("+ FERA"), `my-entries/logic.ts` (`META_KEYS` misses `@method`), `EditEntryForm.tsx`.
- `bulk-upload/components/MapStep.tsx` (factor hints), `PreviewStep.tsx` ("Factor used", "Factor", "FERA tCO₂e").
- From Scope 3 PRs (merged or merging as they are; hide here): #202 spend preview (`lib/scope3/spend.ts`, `EntryRow.tsx`) and bulk-upload currency hint (`UploadStep.tsx`); #191 (merged) Category 3 line "+ Cat 3 …" (`lib/scope3/fera.ts`, `EntryRow.tsx` `cat3`, `EntryDrawer.tsx` twin rows); #190 "Sent, with notes" (`steps/Review.tsx`); #195 transport formula help (`logic/transport.ts`).

## Build
1. `src/lib/entryDetail.ts`: `showCalcDetail(role, company)` = role is Manager/Admin/Superadmin, or `company.entry_detail === "full"`. Company comes from the user's site (`site.company`, as bulk-upload reads `ai_import_enabled`). Unit tests.
2. Add data, Edit entry, My entries, manual bulk upload: when `showCalcDetail` is false, hide everything listed under Today except the total, the step totals and "unit converted". Unit options show plain unit names; unit help disappears.
3. Plain-language problems for Users: missing factor → "We can't work this row out yet. Your administrator has been told." (the notification itself is SE-4; until then the copy says "Ask your administrator."). Unit can't convert → "This unit can't be used here. Choose another unit."
4. My entries "What was entered": filter every key starting with `@` or `_` (always, not only for Users).
5. The `@method` select: hidden for Users when the form has exactly one method in its spec (auto-select it); when it has several, keep it until SE-3/SE-5 replace it with a client-worded question, but for Users only label it "Type of record" (reviewers keep today's label) and use the Superadmin's choice labels if present. Note this in the PR as temporary.
6. Engine notes after save (#190): Users see "Sent"; the notes go to reviewers (Approvals drawer already shows them).

## Tests
- Unit: `showCalcDetail` matrix (4 roles × `total`/`full`/missing).
- Playwright: as a User on a seeded form, Add data shows no "Factor", "kgCO₂e per", "(factor unit)", "FERA", "Calculation method"; total shows. As a Manager on the same form, the factor line shows.

## Done when
No User screen shows a method, factor, FX, FERA/Category 3 or DQ text; reviewers see the same detail as before; lint:new, typecheck, unit and e2e green.
