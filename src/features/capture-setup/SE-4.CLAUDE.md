# SE-4 · Form check and versions

> Module spec. PR titles `[SE-4 1/2] Form check endpoint and versions` (ESG-lite), `[SE-4 2/2] Check panel and history` (FE), `Completes: SE-4`.
> Depends on: SE-2 · Owns: `src/forms/check.ts`, `column_config_version` table · Touches: column-config endpoints, `Emission.ts` (`form_version`), notifications

## Job to be done
A form can't go live half-configured, and anyone can see what changed and which version a row used.

## Build
### Backend
1. `src/forms/check.ts` (pure) + `GET /admin/column-configs/:id/check?year=`: errors and warnings with a field path:
   - a choice path (factor-match rule) with no factor for the year → error; only an older year → warning (`FACTOR_FALLBACK_YEAR`);
   - a method in `method_options`/`method_by_choice` whose recipe fields are missing or not numeric → error;
   - spend method without currency (form or company) or without an `eeio_spend` factor → error;
   - unit (fixed or allowed) not convertible to the factor's unit → error;
   - hidden + required field without a default → error;
   - `method_by_choice` choice with no method → error.
2. Saving a draft always works (today's `PUT` keeps its behaviour). **Publish** runs the check; errors block publish (`409 FORM_CHECK_FAILED`, code defined in `src/scope3/contracts/errors.ts`); warnings publish. Existing live forms that fail the new check stay live and get a warning mark on the forms list until fixed. Each publish bumps `version` and writes `column_config_version` (config json, by, at, note).
3. `emission.form_version int null` (migration), written by `emissionWrite`.
4. When a User's entry hits a missing factor, notify all Superadmins once per site × category × month (`notification` kind `form_needs_factor`).

### Frontend
1. Builder "Check" panel (runs on open and before save), errors link to the tab/field.
2. "History" drawer: versions with who/when/note and a diff of changed settings.
3. Manager drawer shows "Form version n".
4. Forms list: red mark on forms with errors.

## Tests
Unit for every check rule; API tenant isolation, publish blocked on error, version increment; Playwright: a broken form shows the error and can't be saved.

## Done when
Every live form passes the check; rows carry `form_version`; Superadmins hear about missing factors.

## As built (2026-10-17, frontend part 2/2)
- **Logic** `src/features/capture-setup/check.ts` (pure):
  - `readCheck`: null when the server sends no check (an older server, or `{}`), and then nothing blocks or publishes.
  - `tabForIssue`: a problem's field path → the builder tab that fixes it.
  - `newErrors`: the draft's errors the saved form doesn't have.
  - `versionChanges`: what a version changed from the one before, setting by setting, in the builder's words.
- **Check tab** (`?tab=check`, the `form_needs_factor` link):
  - On open it shows the saved form's check (`GET …/:id/check`). With unsaved changes, "Check again" checks the draft (`POST /admin/column-configs/check` with `pk_id`), and the panel says whether it shows the saved form or the changes, and whether the form changed since.
  - Errors and warnings each have "Go to <tab>". The tab's count is the error count.
- **Save** runs the draft check first. **Only problems the saved form doesn't have stop the save** (listed in a callout, Check tab opened), so a live form with old problems can be fixed a step at a time. A form that passes is saved, then published with the optional "Note for this version". The toast says "Version n is live." or "Nothing changed since version n". One that still has old problems is saved and not published: "N things still to fix before a new version can go live".
  - Save and publish are one mutation (`useSaveForm({payload, publish, note})`), so the toast reads the publish result although the builder remounts on the new server copy. A refused publish leaves the save done and says why.
- **History** (header button): `HistoryDrawer` lists versions newest first with who, when, the note, a "Live" badge and the changes from the previous version.
- **Forms list**: a red "N things to fix" badge beside the form name, with the first error as its title (`GET /admin/column-configs/checks`).
- **Approvals drawer**: "Form · Form version n" in Activity when the row has one (`LedgerRow.form_version`).
- **Deviation:** the spec says a broken form "can't be saved". A save that adds a problem is refused; a save of a form that already had problems (29 of 152 live forms on production data) isn't, or nobody could fix them gradually. Such a form isn't published until it passes, and keeps its red mark.
