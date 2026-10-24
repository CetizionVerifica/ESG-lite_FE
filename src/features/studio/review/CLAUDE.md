# DS-13 · Collaboration: comments, @mentions, tasks, approval, version history, locks, brand controls

> **Module spec**, lane L2, wave 5. Copy to `ESG-lite/src/studio/collab/CLAUDE.md`.
> **PR titles:** `[DS-13 k/m]`, five PRs:
> 1. comments + mentions + tasks;
> 2. approvals + require-review switch;
> 3. version history (autosave snapshots, restore);
> 4. template locks, save as template or layout, brand controls;
> 5. FE review UI.
>
> **Depends on:** DS-5, DS-6, DS-12 · **Owns:** `report_comment` (+mentions, tasks), `report_approval`, `company.report_require_review`, `company.brand_controls`, `src/studio/collab/*`, FE `studio/review/*`
> **Base:** RS-10 (comments, review status, drift, templates from a doc, locks). Kept. Changes are below.

## Changes from RS-10
1. **@mentions:**
   - autocomplete of company users with studio access;
   - a mention sends an in-app notification and an email (`notificationService`, a new `studio_mention` type) with a deep link to the page and element.
2. **Tasks:** "Assign as task" on a comment sets an assignee and notifies them; tick done; a filter for "My tasks"; open tasks show as an info check.
3. **Approval** (D14):
   - Request approval (reviewer = a Manager, optional due date, note);
   - the reviewer sees the approval bar → Approve / Request changes (note required);
   - a request is tied to `rev`, and an edit after approval marks it "Approved an earlier version";
   - with `report_require_review`, a final needs an approval for the current rev.
4. **Version history** (D16):
   - autosave snapshots every 10 minutes of activity and on named saves;
   - a list grouped by day; read-only preview; **Restore** makes a new rev;
   - pruning job: 90 days or the last 200; finals and named versions are kept.
5. **Brand controls** (`company.brand_controls`, Superadmin): colour and font pickers limited to the brand kit (DS-3 hook), and template-locked elements are not unlockable by Admins.
6. **Drift:** RS drift for both sources (GHG data hash).

## Tests
- **API:** a mention notifies only users with access; approval roles; a restored version makes a new rev; pruning keeps finals.
- **Playwright:** mention a colleague, assign a task, request approval, approve, generate the final.

## Done when
A team can review, assign and approve a report inside the studio, and roll back any edit from history.

## As built, frontend (2026-10-20, branch `ds-13-collab`, local only)

The full As built (backend endpoints, decisions, what is not done) is in ESG-lite `src/studio/collab/CLAUDE.md`. This part covers the FE.

### Files
- `review/api.ts` (calls and TanStack hooks for people, comments, tasks, approvals, drift, review settings, save as template/layout, snapshot and restore), `store.ts` (panel open/tab, focused thread, the C + click pin), `logic.ts` (+`logic.test.ts`: @mention query/search/insert/ids/highlight, threads, pins, approval role/bar words/final block, version groups by day with named and finals pinned, Mark as checked, open drift, template unlock rule).
- UI: `MentionInput.tsx` (textarea combobox, @ list of studio people, ↑↓ Enter/Tab, Esc, ⌘↵ sends), `ReviewPanel.tsx` (`ReviewPanelHost`; Comments: All / My tasks, Show resolved, threads with replies, Assign as task, tick done, Resolve/Reopen, delete, Go to; new comment with "Pick a spot (C)" and "Assign as task"; Data changes: drifted texts with before → after, Mark as checked, Go to, Ask AI to update), `CommentPins.tsx` (page overlay), `CommentsButton.tsx` (top bar "Comments n", amber dot for data changes), `register.ts` (comment handler + overlay), `ReviewLinks.tsx` (`?comment=` / `?approval=` deep links), `DriftBanner.tsx`, `ApprovalBar.tsx` (Approve / Request changes with a required note / Withdraw / Request approval again), `RequestApprovalDialog.tsx` (Managers other than me, due date, note; tied to the saved rev), `ReviewSettingsCard.tsx` (studio home: Require approval before a final, Brand controls), `SaveTemplateDialog.tsx` (File ▾ Save as template… / Save this page as a layout…, "Lock locked elements for everyone"), `TemplateUnlock.tsx` (Position → Layers), `VersionsPage.tsx` (`/studio/:id/versions`).
- Tests: `review.test.tsx` (9, MSW), `logic.test.ts` (12), `e2e/ds-13-review.spec.ts` (2).
- Shared lines marked `// DS-13`: `editor/plugins.ts`, `editor/TopBar.tsx`, `editor/Editor.tsx`, `editor/SelectionLayer.tsx`, `editor/PositionPanel.tsx`, `share/ShareMenu.tsx` (+ `share.test.tsx` copy), `checks/FinalForm.tsx`, `lib/studio/outputs.ts`, `home/HomePage.tsx`, `routes.tsx`, `lib/studio/contracts.ts` (+ snapshot), `test/msw/studio.ts` (+ `studio.test.ts`).

### Decisions (FE)
1. "Comments n" replaces the shell's "Comment" button; C + click still drops a pin and opens the comment box at that spot.
2. The review panel and the checks panel share the space beside the canvas; opening one closes the other, a rail drawer closes both.
3. "My tasks" asks the server (`?tasks=mine`), so the FE needs no user id for it; the approval bar compares `user.user_id` with the reviewer and requester.
4. A mention ends at the space after the name, so the list closes after a pick; the list opens above the box (the box sits at the panel's foot).
5. A restored version drops the editor's cached doc so the editor loads the new draft rev.
