---
name: phase-gate
description: Check whether a phase of the ESGLite redesign/PCF plan is done and what blocks the next milestone (M0–M3), from the live redesign/integration heads.
---

# Phase gate (ESGLite redesign + PCF)

Read-only check of a phase in `docs/redesign/01-plan.md` (and the PCF phases in `docs/pcf/00-pcf-plan.md`), run against the `redesign/integration` heads of CetizionVerifica/ESG-lite_FE, ESG-lite and python_AI_service, never against PR descriptions.

## Usage
- `/phase-gate` checks the lowest phase that isn't fully done.
- `/phase-gate <0|1|2|3>` checks that redesign phase.
- `/phase-gate pcf` checks the PCF track (phase 0 method sign-off → phase 1 MVP exit check: pilot within ±0.5% of the golden spreadsheet).

## Steps
1. Fetch the three `redesign/integration` heads into a scratch checkout; note each head SHA and its CI state.
2. On the FE head run typecheck, unit tests and `lint:new` (commands in the repo's CLAUDE.md). Report pass/fail counts.
3. Count `isDark ?` outside src/theme: `grep -rno "isDark ?" src | grep -v ^src/theme/ | wc -l`, the number of files, and the top 7 files. Also any `isDark` mention outside src/theme.
4. For every module in the phase (use the module list in the phase table of 01-plan.md; split P03 into P03-A/B/C and F3 into F3-1/2/3), find its merged PRs (titles `[<ID> n/m]`, body `Completes: <ID>`, or older PRs by spec name) and check in the code:
   - Merged: which PRs.
   - Route switched: the new route is mounted (and whether only behind `VITE_NEW_UI`).
   - Old files deleted: the files the spec says it replaces are gone.
   - Definition of done (01-plan.md, 7 points): which are met, which not, with file paths. Check for hex/`isDark`/slate-* in the module folder, loading/empty/error states, a Playwright spec for the page, unit tests for moved logic.
5. Recheck every open blocker from the previous gate report first (latest `/mnt/project-files/reviews/phase*-gate-*.md` if readable; otherwise the baseline below) and mark each fixed / still open.
6. List what blocks the next milestone:
   - M0 Tokens + shell + DataTable live behind flag; Midal theme visible on an empty shell.
   - M1 Managers on new Overview + Approvals; contributors on My month + Add data; old manager/user pages deleted.
   - M2 Reports, targets, notifications, settings migrated.
   - M3 Superadmin console and setup migrated; `isDark` count = 0; old components deleted.
7. End with the module(s) `/next-module` should pick next to clear the blockers, in order.

## Output
One message: head SHAs + CI, test results, `isDark ?` count (and change since the last gate), a module table (Module | Merged | Route switched | Old files deleted | Definition of done), the previous-blocker recheck, the milestone blockers, and the next modules. If `/mnt/project-files/reviews/` exists, also save the report as `phase<n>-gate-<YYYY-MM-DD>.md` there (add `-2`, `-3` if the name is taken).

## Baseline (gate of 2026-10-09, phase 0)
`isDark ?` = 553 in 38 files (same as main). M0 blockers then: F3 PR 2/3 not pushed (only in `/mnt/project-files/f3-work/f3-pr2-pr3.bundle`); shell still on `src/features/shell/standins/` (Drawer, Menu, CommandPalette, appearance.ts, hex tokens.css); shell hard-codes look (Classic by day, Night in dark) instead of brand `defaultLook`; FE never calls B2 `/me/appearance` and stores appearance under two keys (`appearance`, `esglite.appearance`); no route uses DataTable; no Midal-on-shell test. Follow-up: Google Fonts still load for legacy users. P06 needs B4 trend + vs-LY fields.

## Rules
Read-only: never push, comment on, approve or merge anything. Don't fix what you find; `/next-module` does that.
