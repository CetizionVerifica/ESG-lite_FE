# DS-12 · Checks and the final gate (with GHG completeness)

> **Module spec**, lane L1, wave 4. Copy to `ESG-lite/src/studio/checks/CLAUDE.md`.
> **PR titles:** `[DS-12 k/m]`, four PRs:
> 1. RS-9 port (layout, number, content checks);
> 2. GHG checks;
> 3. kind-aware final gate;
> 4. FE checks panel + inline markers + final dialog.
>
> **Depends on:** DS-2, DS-7, DS-11 · **Owns:** `src/studio/checks/*`, `render/checks/number.ts`, FE `studio/checks/*`
> **Base:** RS-9. Kept. Changes are below.

## Changes from RS-9
1. **GHG checks** (`01-contracts` §6), in `checks/ghg.ts`, from:
   - the resolved data (DS-2);
   - report inputs;
   - the doc structure, e.g. "is there a page whose bindings include `scope3_category` for each category, or a `scope3_categories` flow section";
   - rendered text (`BIOGENIC_IN_SCOPE`: any binding summing biogenic into a scope total; `TOTAL_MISMATCH` against `series` sums).
2. **Severity by framework:** ISO checks become errors when `ISO14064` is in `meta.frameworks`. BRSR and ESRS intensity checks apply only when those frameworks are selected (D8).
3. **Before marking ISO checks as errors,** confirm the ISO 14064-1:2018 clause 9.3.1 list against the standard text, which the company must buy. Record the outcome in "As built".
4. **Final gate by kind:**
   - **GHG:** `GHG_PENDING_ENTRIES`, plus any open error, plus `DS_APPROVAL_PENDING` when review is required.
   - **Sustainability:** RS (`YEAR_NOT_LOCKED` etc.).
5. **Fix actions:**
   - "Mark as excluded…" (opens an exclusion input with an AI draft);
   - "Open pending entries" (Review);
   - "Add market-based note" (inserts the "Not reported" row);
   - "Add per-gas chart" (inserts `gas_split`).
6. **FE:** RS S5 panel and markers. GHG messages are written in plain words per `05-ux` S8.

## Tests
- **Unit:** each GHG check on positive and negative fixtures.
- **Golden:** the seed GHG Inventory doc has exactly the expected checks.
- **API:** a final blocked with an error open; allowed after the fix; pending entries block.
- **Playwright:** the checks counter, jump to the page, fix, and a final enabled.

## Done when
A GHG final can't be produced while it misses a GHG Protocol required disclosure that ESGLite can detect, and every check shows a way to fix it.

## As built (2026-10-20, branch `ds-12-checks`, local only)

Backend, endpoint, the gate and the check rules: ESG-lite `src/studio/checks/CLAUDE.md` ("As built"). This is the FE part.

### Files
- `src/lib/studio/checks.ts` (+ `checks.test.ts`): groups and words (`groupChecks`, `countsLine`, `counterLabel`, `finalBlock`, `pageLabel`, `fixLabel`, `checkLink`), and the fixes as pure doc edits: `replaceTypedNumber` / `applyReplaceWithToken` (the server's paragraph and offsets; a chip is one character), `moveInside`, `fixElement` (market-based tile, `gas_split` chart, biogenic figure), `factorSection`, `targetPage`, exclusions (`findExclusion`, `withExclusion`, `plainText`).
- `src/lib/studio/contracts.ts` (`CHECK_FIXES` + 7, `CheckFix`, `ChecksResponse.warnings/layout/rev`, `CheckMeasurement`, `ChecksBody`), `contracts.snapshot.json` (copy of ESG-lite `ci/studio-contracts.json`), `render/checks/number.ts` (mirror; RENDER_HASH and the render goldens synced), `outputs.ts` (job failure reason `checks`).
- `src/features/studio/checks/`:
  - `store.ts`: one small external store per doc (latest answer, open, focused row, refresh);
  - `api.ts`: `postChecks`, `runChecks` (saved rev from GET /docs/:id, one retry on a moved rev), `liveMeasurements` (DS-1 `measureSheet` on every mounted sheet), `useChecksRunner` (2.5 s after the last edit, so after autosave), `useChecksOnce` (the final form outside the editor);
  - `ChecksButton.tsx`: "⚑ n checks" in the top bar (errors + warnings; red with errors, amber with warnings), toggles the panel;
  - `ChecksPanel.tsx`: "Checks before the final", frameworks, "1 must fix · 2 to review · 2 for info", rows grouped Must fix / Review / For info with the fix button, "Mark as reviewed" for AI text and "Go to page n"; footer "Generate final PDF", disabled with the reason; `ChecksPanelHost` (a rail drawer replaces it and the other way round);
  - `ChecksLayer.tsx`: page markers (red wavy underline for a mismatched number, amber dot for AI text, a small flag for any other element check; overflow keeps DS-7's corner); a marker opens the panel at its row;
  - `FinalForm.tsx`: the reason while blocked (pending entries in 05-ux words with "Open Review"), else the warnings with "I've reviewed these" checkboxes, "This will be Final vN", the note once a final exists, Generate → `acknowledgedWarnings`; used in the panel's dialog and in Download ▾;
  - `ExclusionDialog.tsx`: "Mark as excluded…" saves `{what: 'Category n · name', reason}` into `exclusions` (PATCH inputs); "Draft with AI" asks DS-9's `exclusion_reason_draft` and puts the draft in the field for the person to edit;
  - `actions.ts`: Go to and every fix (doc fixes are one undo step each; links open Review, the site ledger, screening or KPI review; `open_inputs` opens the Data drawer);
  - `register.ts`, `checks.test.tsx` (MSW: counter, panel groups, Go to, Add per-gas chart saved, Mark as excluded saved, the final with ticked warnings).
- Shared lines (`// DS-12`): `editor/TopBar.tsx` (the counter), `editor/Editor.tsx` (the panel; the autosave follows a rev moved by a report-details save), `editor/plugins.ts` (markers), `share/DownloadMenu.tsx` (Final PDF uses `FinalForm`; the item says why it is blocked), `panels/data/api.ts` (`STUDIO_REV_EVENT` after PATCH inputs), `src/test/msw/studio.ts` (`setStudioMockChecks`, the gate on finals, `studioMockCheckCalls`, rev check), `share/share.test.tsx` (the final now ticks the warning first).
- `e2e/ds-12-checks.spec.ts`: counter → panel → Go to the page → Move inside margin → autosaved, counter down → Generate final enabled → warning ticked, note → POST jobs with `acknowledgedWarnings`; switch off.

### Decisions and deviations
- **The panel is its own 400 px aside**, opened from the top bar's counter (as the mockup), not a tenth rail tab; it and the rail drawers replace each other.
- **When checks run:** 2.5 s after the last edit (autosave is 1 s), on Refresh, after a fix, and when the final form opens. The server always recomputes from the saved draft; the live measurements of the mounted sheets go along (pages in view ±2), so layout rows show at once.
- **Report details saved inside the editor** (Data drawer, Mark as excluded…) bump the doc's rev on the server (DS-2). The editor's autosave now follows that move (`studio:doc-rev` event) instead of showing a false "changed somewhere else" conflict.
- **Fix labels** follow the contract's fix ids; links are named by where they go ("Open Review", "Open site data", "Scope 3 screening").
- **Keys:** a marker focuses the panel row `checkKey(check, index in its group)`.

### Tests run
- `test-lane.sh ds-12-fe`: typecheck ok, lint:new ok; vitest 1927 pass (203 files) on a clean run. One lane run had DS-7's "adds a heading ready to type over" time out at 5 s under machine load (other lanes running); it passes alone and in the full rerun.
- Playwright (port 4173, CI=1): `ds-12-checks` 2/2; `ds-11-outputs`, `ds-6-editor`, `ds-7-text`, `ds-8-charts`, `ds-5-reports`, `ds-0-switch` pass.

### Not done
- "Explain the change" (AI) on YOY_UNEXPLAINED (DS-9 action); "Describe instruments in text" opens the Data drawer, not the field itself.
- `open_inputs` opens the Data drawer; it doesn't switch to its "Report details" tab or focus the field.
- A Playwright run against the real backend.
