# PE-2 · Text effects, brand fonts, find and replace (FE)

> Plan: `docs/design-studio/pro/01-pro-editing-and-ai-templates.md` (PE-2 row), contracts `docs/design-studio/pro/PRO-0.md`, mockup `docs/design-studio/pro/canvas/project/TextEffects.dc.html`.

## As built (branch `pe-2-text-fonts-find`, 2026-10-21)

### Files
- `src/lib/studio/render/*`: mirror of ESG-lite `pe-2-text-fonts-find` (`textEffects.ts`, text element effects and `font`, highlight runs, curve on an SVG textPath). Synced, never edited here.
- `src/lib/studio/findReplace.ts` (+ test): the pure find and replace op (runs of text only; chips, locked / template-locked / hidden boxes and hidden pages are never changed; a number in the search or the replacement is refused).
- `src/lib/studio/renderHost.ts`: `setStudioCustomFonts` (every mount renders with the company's uploaded fonts), `ensureCustomFonts` (loads the files with the session's token into `document.fonts` as "DS Brand <id>"), `subscribeCustomFonts` / `customFontsVersion` (the editor `Sheet` redraws when they change).
- `textfx/`: `logic.ts` (effect defaults from the report theme, shadow/lift exclusion, clamped slider values, `setTextEffects` / `setTextFont`, font picker options), `EffectsButton.tsx` (Effects popover), `FontPicker.tsx` (native select), `useCustomFonts.ts`, `register.ts`.
- `find/`: `store.ts`, `FindReplacePanel.tsx` (`FindReplaceHost`), `FindButton.tsx` (also `PageToolbarWithFind`).
- `brand-kit/`: `fontLogic.ts` (family/weight/style from the file name, upload checks), `components/BrandFontsSection.tsx` on the brand kit page.
- Shared files, small and marked `// PE-2`: `editor/plugins.ts` (`registerProTextPlugins()`), `editor/shortcuts.ts` (`find` command, ⌘⇧F, help line), `editor/Editor.tsx` (`useCustomFonts()`, `<FindReplaceHost />` over the canvas), `editor/Sheet.tsx` (redraw on font changes), `brand-kit/Page.tsx` (the section).
- Tests: `textfx/logic.test.ts`, `textfx/TextFx.test.tsx` (MSW editor: effects, font, find and replace), `brand-kit/fontLogic.test.ts`, `brand-kit/Page.test.tsx` (+4: upload, refused uploads, inline delete, read-only), `lib/studio/renderHost.test.ts` (+2), `editor/shortcuts.test.ts` (+⌘⇧F), `e2e/ds-pe-2-text.spec.ts` (6).

### Decisions
- **Transparency** for text is the toolbar's existing Transparency (element `opacity`, PRO-0 deviation 1); nothing new.
- **Effects** live in a popover on the text toolbar (the mockup draws a right-hand drawer; a popover keeps the canvas width and uses the PopoverLayer, so it never clips). Each tile toggle is one undo step; a slider drag merges into one step (history `mergeKey`). Colours are report data from the resolved theme (`buildTheme`): shadow/outline start in the ink, highlight in a light mix of the accent, with its contrast ratio shown.
- **Effects and fonts on `text` boxes only** (the contract puts them on text props; callouts keep their own look). Locked and template-locked boxes are left alone.
- **Font picker** is a native select (w-32 so the text toolbar still fits at 1366 px without folding into "Tools"). A ref to a deleted font stays listed as "Removed font (uses the style font)"; the renderer falls back.
- **Uploaded faces** load through the API with the session token (an `@font-face` URL can't send it), as the bundled ones do; the renderer's own family name ("DS Brand <id>") is used, never the uploaded name.
- **Find and replace** is a floating, non-modal panel over the canvas (scroll and strip views). ⌘⇧F / Ctrl+Shift+F also works while typing in a field or a text box. "Page" scope is the page in view.
- **The page toolbar** gets "Find and replace" by registering a real `page` toolbar that wraps the shell's `PageToolbar` (a fallback), so `toolbars.tsx` is untouched.
- **Brand font upload** is one file per weight/style; the family name groups files. The upload is saved on its own, not with "Save brand kit".

### Not done / open
- The heading/body pair in the brand kit and `theme.fonts` stay bundled `FontId`s (PRO-0 deviation 6); custom fonts are per text box.
- Find and replace doesn't search table cells, chart titles or labels (the contract's op covers text boxes, callouts and flow text).
- Public viewer / read-only canvas don't fetch the brand fonts list (they draw with the style font until the server render, which embeds them).
- While a text box is being edited at 1366 px the list buttons push the text toolbar into "Tools" (existing fold behaviour).
