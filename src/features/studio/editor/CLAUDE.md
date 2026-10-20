# DS-6 · Canvas editor with Canva-style chrome

> **Module spec**, lane L4, waves 1–2. Copy to `ESG-lite_FE/src/features/studio/editor/CLAUDE.md`.
> **PR titles:** `[DS-6 k/m]`, six PRs:
> 1. geometry, docOps, history, snapping (pure + tests);
> 2. canvas, selection, transforms;
> 3. side rail + drawers framework + Pages drawer;
> 4. contextual toolbar + Position panel (Arrange, Layers);
> 5. page strip, grid view, zoom, rulers and guides;
> 6. shortcuts, context menu, polish.
>
> **Depends on:** DS-0 (mocks), DS-1, DS-5 · **Owns:** FE `studio/editor/*` (except `text/`, `charts/`, `tables/`), `src/lib/studio/geometry.ts`, `docOps.ts`, `history.ts`, `snapping.ts`
> **Base:** RS-6 (`rs-base/modules/RS-6-freeform-editor/CLAUDE.md`): its pure core, canvas, transforms, snapping, performance and width gate are kept. What changes is the chrome: the RS insert bar and right inspector are replaced by the Canva-style rail, drawers, contextual toolbar and Position panel from `05-ux`.

## Build (in addition to RS-6)
1. **Side rail + drawer framework:**
   - 72 px rail, 340 px drawer, keyboard reachable (rail is a `tablist`);
   - the drawer remembers its scroll per tab;
   - drawers are registered by modules (`registerDrawer('data', DataPanel)`), so DS-2, DS-3, DS-4, DS-8 and DS-9 plug in without touching the shell.
2. **Contextual toolbar:**
   - a per-type toolbar registry (`registerToolbar('chart', ChartToolbar)`), with the common tail (Position, Transparency, Link mark, Lock, ⋯);
   - "Nothing selected" shows page Background and Layout;
   - the toolbar wraps into a ⋯ overflow below 1440 px.
3. **Position panel** in the drawer area: an **Arrange** tab and a **Layers** tab (RS layers list).
   - Arrange: order, align to page or to the selection, **Tidy up** (equal spacing on the dominant axis), X/Y/W/H/rotation in mm.
4. **Page views:**
   - scroll view (default), page strip in the status bar, and grid view (full canvas area, grouped by chapter, multi-select actions);
   - Alt+⌘+1/2/3;
   - page titles editable above each page; the "+" between pages opens layouts.
5. **Rulers and guides:**
   - rulers in mm on the top and left;
   - drag out a guide (stored in `page.guides`, never rendered in print);
   - show margins and bleed toggles;
   - guides take part in snapping.
6. **Frames and grids:** drop an image on a frame to fill it; double-click to crop inside the frame.
7. **Copy style / paste style** (⌥⌘C / ⌥⌘V).
8. **Comments hook:** C plus a click drops a comment pin (the DS-13 thread UI; until then a stub).

## Tests
- **Unit:** RS tests, plus tidy-up spacing, guide snapping, and the toolbar registry.
- **Component (MSW):** the drawer switches; the toolbar changes with the selection; Position align to page.
- **Playwright:** add a frame from Elements, drop an image into it, crop, align centre, tidy three tiles, reorder pages in grid view, add a guide, undo the lot.

## Done when
A Canva user can find every action where they expect it, and every RS-6 "Done when" still holds.

## As built (DS-6, branch `ds-6-editor`, 2026-10-20)

Frontend only (DS-6 owns no endpoint or table). Built on the DS-0 MSW mocks and the DS-1 renderer mirror, in parallel with DS-5.

### Files
- **Pure core** (`src/lib/studio/`):
  - `geometry.ts`: mm↔px at zoom, rotated boxes, hit testing, align, distribute, **tidy up**, resize from 8 handles in the element's own axes, rotation (Shift 15°, sticky right angles), crop maths (`coverCrop`, `clampCrop`, `zoomCrop`), grid cells.
  - `docOps.ts`: every doc edit, immutable, untouched pages/elements keep identity; re-exports DS-3 `applyStyle` / `shuffleStyle` / brand ops. Element ops (add, frames, props, opacity/lock/hide, delete, duplicate, paste, group/ungroup, z order, layer order, align, distribute, tidy), copy/paste style, `fillFrame` / `setCrop`, page ops (insert, from layout, duplicate, hide, delete, move, rename, notes, background, reset to layout), guides, chapters.
  - `history.ts`: 100 steps, merge by key within 1 s, `saveHistory` / `loadHistory` per doc and rev (last 30 steps in sessionStorage).
  - `snapping.ts`: page edges, safe margin, centres, ruler guides, element edges and centres, equal spacing, edge snapping for resize, ruler ticks.
- **Shell** (`src/features/studio/editor/`): `Editor.tsx` (`<Editor docId>`, autosave, conflict dialog, width gate, shortcuts, context menu), `EditorPage.tsx` (`/studio/:id`), `EditorContext.tsx` (store + `EditorApi`), `state.ts`, `api.ts`, `renderInputs.ts` (one `/studio/resolve` for the doc, asset URLs, brand), `Sheet.tsx`, `canvasUtil.ts`, `SelectionLayer.tsx`, `dnd.ts`, `Canvas.tsx`, `Rulers.tsx`, `SideRail.tsx` + `railTabs.ts`, `registry.ts`, `plugins.ts`, `fallbacks.tsx` + `basicElements.ts`, `ContextToolbar.tsx`, `toolbars.tsx`, `actions.ts`, `PositionPanel.tsx`, `StatusBar.tsx`, `GridView.tsx`, `TopBar.tsx`, `ContextMenu.tsx`, `shortcuts.ts`.
- `src/features/studio/panels/PagesPanel.tsx` (Pages drawer).
- Shared file: `src/features/studio/routes.tsx` (the `studio-editor` line and its import, `// DS-6`).
- Tests: `src/lib/studio/{geometry,snapping,history,docOps}.test.ts`; `editor/{registry,shortcuts,state}.test.ts`; `editor/Editor.test.tsx` (MSW: drawer switches, toolbar follows the selection, move + undo, Position align to page + autosave PATCH with rev, locked element, Delete/⌘Z and typing in a field, grid view delete, unknown doc); `e2e/ds-6-editor.spec.ts` (frame from Elements → drop image → crop → align centre → tidy three tiles → reorder pages in grid view → add a guide → undo the lot, autosaved doc equals the original; width gate; switch off).

### How other modules plug in
- `registerDrawer(id, Component)` in `editor/plugins.ts` (append a `// DS-n` block). Drawers get `DrawerProps` = DS-3 `StudioPanelProps` + `docId` + `editor: EditorApi` (`insertElement`, `commit`, `select`, `openDrawer`, …). The shell's own Elements / Uploads / Templates / Text / Charts / AI drawers are registered as `fallback` and are replaced by any real registration, in any order.
- `registerToolbar(type | "page" | "multi", Component)`: same rule; DS-7 replaces `text`/`callout`, DS-8 `chart`/`table`.
- `registerCommentHandler(fn)`: DS-13 replaces the pin stub.
- Drag payloads onto a page: `DND_ELEMENT` (an Element template) and `DND_ASSET` (`{id, w, h, alt}`), see `dnd.ts`.

### Decisions and deviations
- **No react-moveable / react-selecto** (D2 names them): transforms, marquee and snapping are our own pointer-event code on `geometry.ts` / `snapping.ts` (the RS-6 fallback), so no new dependency. Drags preview by moving the rendered box in the shadow root (`liveFrame`) and commit one `updateFrames` on pointer-up.
- **Thumbnails** (page strip in strip view, grid view) are the renderer at a small zoom, memoised per page object (pages that didn't change don't re-render), not html-to-image snapshots. The status-bar mini strip shows page colour tiles.
- **Chapters** for grid view: a page with a `bookmark` opens a chapter named by it; pages before it are "Opening"; no bookmarks → one "All pages" group. "Move to chapter" moves pages to the end of that chapter.
- **Strip view** (⌥⌘2) shows the page in view only, with a thumbnail row above the status bar.
- **Doc calls**: `editor/api.ts` has its own GET/PATCH `/studio/docs/:id`, `/studio/assets`, `/studio/layouts` against the contract (DS-5 builds the docs API in parallel). Merge with DS-5's hooks when both land.
- **Data drawer**: clicking a row inserts a big number at the page centre (DS-8 adds "tile or chart?" and drag-to-page).
- **New shapes** without colours take the report's accent (else primary) so they show.
- **Fit** fits the whole page (width and height) of the canvas.
- Shortcuts: RS S3 + 05-ux (⌥⌘1/2/3, ⌥⌘C/V, T/R/L/C, ⌘/ sheet). ⌘K stays the app's command palette.
- Width gate: below 1,280 px (or a final) the editor is view-only with a notice; comments and downloads stay.

### Not done
- Text editing inside elements, text presets, data chips (DS-7); chart and table editing, Charts drawer (DS-8); Templates, full Elements and Uploads drawers (DS-4: the shell's fallbacks cover basic shapes, lines, frames, a grid and the company's images); AI drawer (DS-9); Resize (DS-10); Share/Download/Present (DS-11: the top bar links to the placeholder routes); checks chip (DS-12); comment threads and version history (DS-13: C + click drops a local pin).
- Image toolbar "Flip" and "Filter" (no doc fields for them in the contract); flow-section settings drawer (DS-7).
- Speaker notes are edited in the status bar; no separate notes window.
- 60 fps drag trace on a 50-page doc in CI (informational in RS-6) is not added; drags don't re-render sheets.
- The "+" layout gallery shows layout names (no thumbnails until DS-4 serves them).
