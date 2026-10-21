# AT-1 · Template suggestions on /studio/new ("Help me choose")

Working spec copy. Plan: `docs/design-studio/pro/01-pro-editing-and-ai-templates.md` §2A; contracts `docs/design-studio/pro/PRO-0.md` (AT-1 row); mockup `docs/design-studio/pro/canvas/project/AiTemplates.dc.html`.

- Step 1 "Template" offers **Browse all | Help me choose**. The brief (purpose, standards, audience, length, tone, optional note ≤ `BRIEF_NOTE_MAX`, fenced server-side) goes to `POST /studio/templates/suggest` (`suggestApi.ts`).
- The server shortlists by rules and scores data readiness; the AI only orders the shortlist and writes reasons. `aiUsed: false` → rule order, no reasons, an info callout.
- Cards: brand-rendered cover (`SheetThumb`), reasons, readiness badges (counts only, never figures), pages to leave out / add, **Preview with my data** (`SuggestPreview.tsx`: renderer + `/studio/resolve`, nothing saved) and **Use this** (picks the template, moves to the scope step).
- Files: `HelpMeChoose.tsx`, `SuggestPreview.tsx`, `suggestLogic.ts` (+ tests), `NewDesignPage.tsx` (mode switch). E2E: `e2e/ds-at-1-suggest.spec.ts`.
