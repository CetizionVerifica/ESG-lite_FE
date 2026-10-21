# Design Studio Pro: frontend build status (ESG-lite_FE)

Written 2026-10-21 in a cloud session. Branch `ds-pro/local` holds `production` (nothing new there since PRO-0) plus AT-1, AT-2, PE-1 and PE-2, merged in that order. Built against the PRO-0 contracts and the MSW mocks; the backend is built by a separate session. PE-3 and later are not built. No PR was opened and `production` was not touched.

## What was built

| Module | Branch (tip) | Where | What |
|---|---|---|---|
| AT-1 Template suggestions | `at-1-template-suggest` (`8350411`) | `src/features/studio/new/` (`HelpMeChoose.tsx`, `SuggestPreview.tsx`, `suggestLogic.ts`, `CLAUDE.md`) | `/studio/new` step 1 offers **Browse all \| Help me choose**. The brief (purpose, standards, audience, length, tone, an optional note) is sent to `POST /studio/templates/suggest`. Up to 3 cards show a brand-rendered cover, the AI's reasons, readiness badges (counts only) and pages to drop or add. **Preview with my data** pages through the template with `/studio/resolve` values and saves nothing. **Use this** moves on to the scope step. Without the AI the cards come in rule order with no reasons and an info callout. |
| AT-2 Layouts + try another template | `at-2-layouts-swap` (`8cc16c0`) | `src/features/studio/swap/` (`LayoutIdeas.tsx`, `TemplateSwap.tsx`, `PagePreview.tsx`, `logic.ts`, `CLAUDE.md`), two lines in `ai/AiPanel.tsx` | **Layouts for page N** in the AI drawer (`suggest_layouts`): 3 options previewed on the page, with Accept (one undo step), Try again (`differentFrom`) and Discard. **Try another template**: the server preview is shown side by side, then Apply with `previewHash`. A 409 shows "The design changed since the preview. Preview again." Text, chips and charts are kept. |
| PE-1 Photo edit | `pe-1-photo-edit` (`a60bc2c`) | `src/features/studio/photo/` (`PhotoTools.tsx`, `register.ts`, `CLAUDE.md`), `src/lib/studio/photoOps.ts`, renderer `imageFx.ts` | Image/frame toolbar: Remove background (job polled to done; the original is kept; Restore original), Adjust (brightness, contrast, saturation, warmth, blur; one drag is one undo step), filters (vivid, mono, warm, cool, fade), brand-colour duotone and a before/after view. Transparency is the existing opacity control, shown in %. `DS_BG_UNAVAILABLE` shows "Background remover isn't set up on this server yet". Every effect is drawn by the shared renderer, so the editor, Page view and PDF match. |
| PE-2 Text effects, fonts, find | `pe-2-text-fonts-find` (`eecf93d`) | `src/features/studio/textfx/`, `src/features/studio/find/`, `brand-kit/components/BrandFontsSection.tsx`, `brand-kit/fontLogic.ts`, `src/lib/studio/findReplace.ts`, renderer `textEffects.ts` | **Effects** popover: shadow, lift, outline, highlight, curve; shadow and lift exclude each other. **Font** picker per text box: style font, the bundled fonts and uploaded brand fonts; the editor loads uploaded files through `@font-face`, and a deleted font falls back to the style font. **Brand fonts** on the brand kit page: Managers and the Superadmin upload WOFF2/TTF/OTF up to 5 MB with a required licence tick, each server error has its own copy, delete has an inline confirm, and everyone else sees a read-only list. **Find and replace** (⌘⇧F / Ctrl+Shift+F, plus a button on the text and page toolbars): match case, whole words, whole report or this page, Replace all as one undo step. It never changes data chips, locked or template-locked boxes, or hidden pages, shows how many matches it skipped, and refuses numbers. |

Shared code changed:
- `src/ui/Popover.tsx` (PE-1): fixes an existing bug where a layered panel never took focus, so Esc cleared the editor's selection.
- `editor/plugins.ts`: PE-1 and PE-2 registrations.
- `editor/shortcuts.ts`, `Editor.tsx` and `Sheet.tsx` (PE-2): find command, custom-font loading, and a sheet redraw when fonts load.
- `src/test/msw/studio.ts` (AT-2): the `suggest_layouts` mock keeps locked elements in place.

## Renderer mirror (`src/lib/studio/render/`): the backend must match

- PE-1 (`imageFx.ts`, `elements/media.ts`, `types.ts`, `index.ts`) and PE-2 (`textEffects.ts`, `text.ts`, `elements/text.ts`, `context.ts`, `css.ts`, `types.ts`, `index.ts`) are **byte-identical to ESG-lite `origin/pe-1-photo-edit` and `origin/pe-2-text-fonts-find`**. Nothing in render/ was hand-written in this session.
- The two merge cleanly file by file. Only `hash.ts` and the `renderHash` line of `src/test/fixtures/studio-render/{snapshots,ghg-snapshots}.json` conflicted. **Merged `RENDER_HASH` = `bc13a108ebb83cd681c9abbd1e28fc6e3cb7af68cbf7b2121703df7833caf980`**, computed with the sync script's hash. When ESG-lite merges PE-1 and PE-2 into its `ds-pro/local`, `npm run sync:studio-render` there must give the same value. If it doesn't, re-sync this folder from the backend.

## Test results (on `ds-pro/local` after the last merge)

| Check | Result |
|---|---|
| `npm run typecheck` | clean |
| `npm run lint:new` | clean |
| `npm run check:studio-render` | ✓ `bc13a108…` |
| Vitest (`npm test`) | 225 files, **2074 passed**, 0 failed |
| `npm run build` | ok; no CSS warnings |
| Playwright `e2e/ds-*` | **54 passed**, 2 skipped (`ds-14-main-path` needs the real stack), 0 failed |

Checks after each merge: AT-1 (216 files, 2015 tests), AT-2 (218, 2029), PE-1 (221, 2048), PE-2 (225, 2074). Typecheck, lint, render check and build were green each time.

New e2e specs:
- `ds-at-1-suggest` (2)
- `ds-at-2-layouts` (3)
- `ds-pe-1-photo` (3)
- `ds-pe-2-text` (6)
- `ds-pro-fit` (9, see below)

### Toolbar and popover fit (1366×768 and full screen)

`e2e/ds-pro-fit.spec.ts` runs at 1366×768, at 1366×768 in the editor's full screen, and at 1920×1080 in full screen. It checks:
- **Image frame toolbar and text toolbar:** every visible control sits inside the toolbar row. The row is `overflow-hidden`, so a control past its edge would be clipped.
- **Every popover opened from those toolbars** (every `aria-haspopup` trigger, drawn through the `PopoverLayer`) lies fully inside the window, including Effects with the shadow sliders open.
- **Find and replace panel** and **AI drawer:** inside the window.

All 9 pass. `ds-at-2-layouts` and `ds-pe-1-photo` also check the layout options, the compare dialog and every photo panel at 1366×768.

## Fixed during integration

- AT-2 `TemplateSwap`: the AI drawer always mounts the template list, and a non-array `GET /studio/templates` answer crashed the whole editor. This was caught by the existing DS-9 e2e and fixed on the branch (`8cc16c0`).
- `e2e/ds-pro-fit.spec.ts`: an early version had a `[role="dialog"]:visible` selector string. Tailwind scans the repo and turned it into an invalid CSS class (build warning). The spec now uses `.filter({ visible: true })`.

## Open issues

1. **PE-1:** if the picture is deselected while a background-removal job runs, the result isn't applied to it. The derived image is still saved in Uploads.
2. **PE-1:** "Touch up edges" and Flip from the mockup aren't built (not in the PE-1 contract). Grid cells get no photo edits.
3. **PE-2:** at 1366 px the text toolbar fits with about 32 px to spare. While a box is being edited, the list buttons fold into "Tools" (existing behaviour). New toolbar buttons may tip more into the fold.
4. **PE-2:** the read-only canvas and the public viewer don't load the brand fonts list, so uploaded-font boxes show the style font there. Effects and fonts apply to `text` boxes, not callouts.
5. **PE-2:** in jsdom, axios multipart uploads don't complete through MSW. The unit tests stub `api.post`; the real multipart body is checked in Playwright.
6. **AT-2:** before previewing a swap, the dialog waits for autosave by re-reading the saved doc (one 1.6 s retry), because the editor can't force a save first. After Apply, autosave PATCHes once more at the new rev, which adds one harmless extra revision.
7. **AT-2:** the test fixture's `design.templateId` is a family name (`ghg-inventory`), not a slug, so the current template can appear among the choices for that doc.
8. **DS-9 (existing):** `BudgetMeter` crashes the editor if `/ai/usage` returns a body without `monthUsd`. The backend always sends it; worth a guard later.
9. **Not checked against the real backend:** everything runs on the MSW and Playwright mocks. When the backend modules land, run `npm run test:e2e:ds-real` and the ESG-lite workflow test.
10. `e2e/ds-3-brand-kit.spec.ts` hard-codes port 4173 in its route filter, unlike the newer specs (`E2E_PORT`).
