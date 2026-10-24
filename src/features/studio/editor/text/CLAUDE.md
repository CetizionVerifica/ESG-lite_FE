# DS-7 · Text and flow

> **Module spec**, lane L4, wave 3. Copy to `ESG-lite_FE/src/features/studio/editor/text/CLAUDE.md`.
> **PR titles:** `[DS-7 k/m]`, four PRs:
> 1. TipTap + DataChip (both sources);
> 2. text presets and the Text drawer;
> 3. flow-section settings + footnotes;
> 4. overflow measuring.
>
> **Depends on:** DS-2, DS-6 · **Owns:** FE `studio/editor/text/*`, `panels/TextPanel`, flow-section settings drawer
> **Base:** RS-7, kept in full. Changes are below.

## Changes from RS-7
1. **`KpiChip` becomes `DataChip`:**
   - it renders a `DataToken` of either source;
   - the `{{` picker searches GHG metrics and KPIs (by kind);
   - the hover card shows source, period, sites and approval date;
   - for GHG it also shows "Approved entries: n".
2. **Text drawer:**
   - Add heading / subheading / body;
   - **text presets**: kicker + title, big number + caption, quote + attribution, and section opener, styled from the theme;
   - "Insert data value".
3. **Footnotes:** a `footnote` mark numbered per page in free-form pages and per section in flow sections, rendered at the page foot. Used for factor sources and methodology notes.
4. **Flow sections** for the GHG kind (`scope3_categories`, `ghg_factor_table`, `ghgp_index`, `iso_index`): settings in the drawer (columns, which categories, show DQ, show method).
5. **Toolbar AI ▾** (shorter, longer, formal, plain, brand voice) comes from DS-9 through the toolbar registry.

## Tests
- **Unit:** DataChip serialisation round trip for both sources.
- **Component:** the picker filters by kind; a footnote renumbers after a move.
- **Playwright:** type `{{scope`, pick Scope 1 → a chip with the value; delete the chip; undo.

## Done when
Text anywhere can carry live data values of either kind, and long GHG tables flow across pages with repeated headers.

## As built (DS-7, branch `ds-7-text` in ESG-lite and ESG-lite_FE, 2026-10-20, local only)

Built on `ds/local` (DS-0…DS-6 merged). RENDER_HASH `eb86298da9442fb797d2a0586bcdf6930535cc2dd17902e2e47cea969136252a`.

### Files
**ESG-lite (backend + renderer)**
- `src/studio/contracts/schema.ts`: the `footnote` mark (`{type: "footnote", attrs: {note: 1–500 chars}}`) joins `TEXT_MARK_TYPES`; `MAX_FOOTNOTE_CHARS`; up to 5 marks per text node. `ci/studio-contracts.json` regenerated.
- `src/reporting/studio/render/footnotes.ts` (new, mirrored): the one numbering rule (runs, reading order, per page / per section); `text.ts` prints `<sup class="ds-fn-ref" data-fn="n">` after each run; `sheet.ts` prints the notes at the foot of the safe area; `flow/index.ts` after the section; `context.ts` `footnoteBase`; `index.ts` exports. Footnote styling is inline, so documents without footnotes render byte-identically (snapshots: only `renderHash` moved).
- `src/studio/sources/ghg.ts` + `types.ts`: GHG values carry `approvedEntries` (approved Scope 1–3 rows behind the figure, from the existing coverage query) for the chip hover card.
- Tests: `ci/unit/ds-7-text.test.cjs` (9: contract accepts/refuses footnotes, runs across chips, reading order, renumber after a move, escaping, per-section flow notes, no-footnote CSS unchanged, scope3 flow settings); `ci/api/tests/ds-7-text.test.cjs` (4: autosave keeps chips of both sources + footnotes + flow settings, invalid footnotes/options → DS_DOC_INVALID, `approvedEntries` equals the approved rows, switch-off / role / tenant isolation). Goldens: `ci/golden/ds/render/snapshots.json`, `ci/golden/ds/templates/snapshots.json` (hash only).

**ESG-lite_FE**
- `src/features/studio/editor/text/`:
  - `extensions.ts` TipTap schema = the contract (StarterKit trimmed, Highlight, `data` chip node, `footnote` mark with editor-side numbering decorations, `{{` trigger plugin, paste cleaning); `convert.ts` TextDoc ↔ TipTap JSON (sanitising), `cleanPastedHtml`;
  - `chipData.ts` / `ChipDataProvider.tsx` (values from the doc's one `/studio/resolve`, primed from the picker until resolved; hover-card words), `DataChip.tsx` + `chipView.ts` (node view: value, hover card, measure/format popover, remove), `picker.ts` + `DataPicker.tsx` (doc kind only, single values), `TriggerPicker.tsx`, `useStudioText.ts` (editor hook, `insertChip`);
  - `editing.ts` (which box is edited, the live editor), `TextEditOverlay.tsx` (in place, inside a shadow root with the renderer's CSS and the element's own rendered box), `TextToolbar.tsx` + `toolbarSlots.ts`, `presets.ts`, `FlowPanel.tsx` + `flowLabels.ts`, `overflow.ts` + `OverflowLayer.tsx`, `ops.ts`, `register.ts`;
  - tests `convert.test.ts` (8), `ops.test.ts` (9), `TextEditing.test.tsx` (8).
- `src/features/studio/panels/TextPanel.tsx` (Text drawer).
- `e2e/ds-7-text.spec.ts` (3: `{{scope` → Scope 1 chip → delete → undo → Esc saves; flow settings saved; switch off).
- Mirrors: `src/lib/studio/render/*` (sync), `src/test/fixtures/studio-render/snapshots.json`, `src/lib/studio/contracts.ts` (+footnote mark, `MAX_FOOTNOTE_CHARS`, `approvedEntries`), `contracts.snapshot.json`; `src/test/msw/studio.ts` (`approvedEntries` / `evidenceCount` on resolved values, `// DS-7`).
- `package.json`: `@tiptap/core`, `@tiptap/pm`, `@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-highlight` pinned at 3.31.4 (MIT; all 52 added packages MIT).
- Shared files (small, marked `// DS-7`): `editor/registry.ts` (`registerPageOverlay`, `registerElementEditor`), `editor/SelectionLayer.tsx` (double-click → registered element editor; draws page overlays), `editor/plugins.ts` (`registerTextPlugins()`), `editor/Canvas.tsx` (a click on a flow page opens the Text drawer).

### How others plug in
- **DS-9 "AI ▾"**: `registerTextToolbarItem("ai", Component)` from `text/toolbarSlots.ts`; the component gets the toolbar props plus `textEditor` (the live TipTap editor while a box is edited, to rewrite the selection; null to rewrite the whole box). Insert AI text with `setElementText` (ops.ts) inside the Accept handler.
- **DS-12**: overflow uses render/measure.ts's rule (`overflow.ts measureDom`); footnote numbers come from `render/footnotes.ts`, so checks and the editor agree.
- Any module can add a page overlay (`registerPageOverlay`) or an in-place editor for its element type (`registerElementEditor`).

### Decisions and deviations
- **Footnotes**: one number per run (the same note twice gets two numbers); free-form pages number in reading order = top to bottom, then left to right, so moving a box renumbers. Flow sections print their notes **after the section's content** (an endnote list per section), not at each printed page's foot: Paged.js footnote floats weren't verified and per-section numbering is the spec's rule. Free-form notes sit at the foot of the safe area above the elements; overlap with a box there is the designer's call (DS-12 may add a check).
- **Text toolbar "font / size"** (05-ux) is the design's **Style** menu (nine text styles from the theme): the contract's `TextProps` has no font or size fields. "Shrink text to fit" therefore steps the **style** down (title → heading → subheading → body → caption), the design minimum being caption.
- **Underline** (05-ux "B I U") is not offered: the contract marks are bold, italic, link, highlight (+ footnote). Adding it is a DS-0 contract follow-up.
- **In-place editing** renders the element's own box (renderer HTML, emptied) into a shadow root over the page and portals TipTap into it, so fonts, sizes, colours and page-colour switches are the renderer's. The rendered element underneath is hidden while editing.
- **Chips** show the server's `display` only. A chip picked but not yet resolved shows the picker's value (also from the server, GET /studio/data); a chip is its own undo step inside the text editor. Changing a GHG chip to a change measure sets `compare: "prior"` on its binding.
- **Picker**: single values only (items with a breakdown are charts, DS-8). GHG filters locally; KPI search goes to the server (`q`).
- **Text presets** are groups of text elements (plus a divider in the section opener) carrying text styles only; the theme gives fonts and colours. The big number preset holds a chip of Total emissions (GHG) or the first KPI (sustainability). Previews in the drawer are drawn by the renderer.
- **Hover card** extra: KPI chips show "Evidence files: n" (RS-7) when the server sends `evidenceCount`.
- **AI marker**: "Mark as reviewed" in the text toolbar for `source: "ai"` boxes not yet reviewed; any edit through the text editor sets `reviewed: true`. The amber dot on the canvas is not drawn (the toolbar button shows it instead).

### Not done
- Flow-section footnotes at each **printed page's** foot (they print after the section).
- A mark toolbar inside the flow narrative editor (⌘B / ⌘I and the `{{` picker work there; footnotes and links are added from free-form text boxes' toolbar only).
- RS-7 Playwright "proof PDF text contains the chip's formatted value": proof PDFs are DS-11, not on this branch.
- Enter to start editing a selected text box (double-click and the toolbar's "Edit text" do it).
- Live footnote list at the page foot while typing (it updates on commit).
- Flow sections render their first page's worth in the editor (DS-6); pagination with repeated table headers is DS-1's html.ts handler, unchanged here.
- Tests run: BE `test-lane.sh ds-7-be` (build, unit, both goldens, API, workflow); FE `test-lane.sh ds-7-fe` (typecheck, lint:new, vitest); Playwright `e2e/ds-7-text.spec.ts` and `ds-6-editor.spec.ts` locally on a private port.
