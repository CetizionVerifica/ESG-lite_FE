# PE-1 · Photo edit (frontend)

> Plan: `docs/design-studio/pro/01-pro-editing-and-ai-templates.md` (PE-1); contracts `docs/design-studio/pro/PRO-0.md`; mockup `docs/design-studio/pro/canvas/project/PhotoEdit.dc.html`. Layer rules: `src/features/studio/CLAUDE.md`.

## Build
- Image and frame toolbar: Remove background, Adjust (brightness, contrast, saturation, warmth, blur), Filters (none, vivid, mono, warm, cool, fade), Duotone in brand colours, Before/after. Transparency is the common tail's element `opacity` (0..1, shown as %).
- Background removal is a server job (`photo/api.ts`): POST → poll → the element shows the derived asset and keeps `originalAssetId`; "Restore original" moves it back. `DS_BG_UNAVAILABLE` → "Background remover isn't set up on this server yet".
- Edits are props the shared renderer draws (`render/imageFx.ts`), so editor, Page view, Present and PDF match. Never style the picture with app CSS.

## As built (branch `pe-1-photo-edit`, 2026-10-21)
- `src/lib/studio/photoOps.ts`: pure ops (`setImageAdjust`, `setImageFilter`, `setDuotone`, `resetPhotoEdits`, `applyBackgroundRemoved`, `restoreOriginal`, `beforeElement`, `brandDuotones`); same doc back when nothing changes.
- `photo/PhotoTools.tsx`: `PhotoToolbar` (the shell's `MediaToolbar` + `PhotoTools`), registered for `image` and `frame` in `photo/register.ts` (one `// PE-1` block in `editor/plugins.ts`). Every panel is a `Popover` under the editor's `PopoverLayer` (body portal; nothing clipped by the toolbar). Slider drags commit with a `mergeKey` per slider, so a drag is one undo step. Previews (filters, before/after) are the element drawn by the renderer (`ElementPreview`).
- `src/ui/Popover.tsx`: a layered panel now takes focus once it is placed (it was hidden while focus moved, so Esc reached the editor and cleared the selection).
- Renderer (`render/imageFx.ts`, `elements/media.ts`, `types.ts`, `index.ts`, `hash.ts` + snapshot hashes) is byte-identical to ESG-lite `pe-1-photo-edit`.
- Tests: `src/lib/studio/photoOps.test.ts` (7), `src/lib/studio/imageFx.test.ts` (7, same markup in sheet/paged/present/print), `photo/PhotoTools.test.tsx` (5, MSW), `e2e/ds-pe-1-photo.spec.ts` (3, incl. panels on screen at 1366 × 768).

## Open
- A running job belongs to the toolbar: deselecting the picture before it finishes drops the result (the derived asset is still saved in Uploads).
- No "Touch up edges" (mockup) and no Flip: not in the PE-1 plan's contract.
- Grid cells have no photo edits (no props in the contract).
