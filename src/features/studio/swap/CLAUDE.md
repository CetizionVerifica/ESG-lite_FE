# AT-2 · Suggest layouts and try another template (editor AI drawer)

> **Module spec** (FE). Plan: `docs/design-studio/pro/01-pro-editing-and-ai-templates.md` §2B and §3; contracts: `docs/design-studio/pro/PRO-0.md` (AT-2 rows); mockup `docs/design-studio/pro/canvas/project/AiLayouts.dc.html`. Layer rules: `src/features/studio/CLAUDE.md`.

## What it does
- **Layouts for page N** (top of the AI drawer): "Suggest layouts" calls the DS-9 action `suggest_layouts` (`ai/api.ts` `postAiAction`, `target: {pageId}`) for the free-form page in view. The server answers a `pages` Suggestion with three options (`payload.pages[i]`, described by `payload.layoutOptions[i]`: A/B/C, name, reason). Options show as renderer thumbnails; picking one previews it on the page (the editor's preview doc + `GhostPreview` dashed outlines on what moves). **Accept** replaces the page as one undo step; **Try again** asks for layouts different from the ones shown (`params.differentFrom`); **Discard** drops the options. Nothing changes before Accept.
- **Try another template**: up to four other templates of the doc's kind and format. Choosing one waits for the autosave to catch up, then `POST /template-swap/preview {templateId, rev}`; the dialog shows each page now and with the new template side by side (pager) and the swap summary (pages mapped / kept, items left in place). **Apply template** posts `/template-swap/apply {templateId, rev, previewHash}`; the editor follows the server's new rev (`STUDIO_REV_EVENT`) and takes the saved doc as one undo step. 409 `DS_VERSION_CONFLICT` → "The design changed since the preview. Preview again."

## Files
- `LayoutIdeas.tsx`, `TemplateSwap.tsx`, `PagePreview.tsx` (a page drawn by the shared renderer at thumbnail size), `logic.ts` (pure: page summary, the option check, apply, changed ids, swap summary, `swapKeepsContent`), `api.ts` (swap client + error copy).
- Shared: two lines in `ai/AiPanel.tsx` (`// AT-2`); the `suggest_layouts` mock in `src/test/msw/studio.ts` keeps locked elements in place.
- Tests: `logic.test.ts`, `swap.test.tsx` (MSW), `e2e/ds-at-2-layouts.spec.ts`.

## Rules
- An option is applied only if every element of the page is kept with identical props (only frame/z move), locked and template-locked elements don't move, and anything new is decoration (`layoutOptionIssues`, the server's rule too). A swap is applied only if every text, chip and chart is kept (`swapKeepsContent`).
- The FE never types a number: options and swaps reuse the page's own elements and bindings.
- Tokens and `src/ui` only; the compare view is a `Modal` (no in-toolbar dropdowns).
