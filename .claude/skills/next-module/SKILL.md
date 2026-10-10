---
name: next-module
description: Pick the next unblocked module of the ESGLite redesign or PCF plan from live repo state and build it end to end (spec, plan, code, tests, draft PR into redesign/integration).
---

# Next module (ESGLite redesign + PCF)

Executes the plan in `docs/redesign/01-plan.md` and `docs/pcf/00-pcf-plan.md` one work package at a time, so nobody has to write or paste a build prompt. Each run picks one module, builds it, and opens draft PR(s) into `redesign/integration`. It never merges.

Repos: CetizionVerifica/ESG-lite_FE (FE), CetizionVerifica/ESG-lite (BE), CetizionVerifica/python_AI_service (AI). Base branch in all three: `redesign/integration` (never `main`).

## Usage
- `/next-module` picks the next unblocked module on the redesign track and builds it.
- `/next-module pcf` does the same on the PCF track.
- `/next-module <ID>` builds or resumes that module (e.g. `P07`, `F3-2`, `E1`, `C02`), even if another would come first; still refuses if a dependency is unmet, saying which.
- `/next-module --dry-run` (combinable with the above) only reports the queue: done, in progress, next unblocked, blocked and why. No code.

Several people (or sessions) can run it at once: an open PR claims its module, and the claim is opened before any code is written (Step 4a.0), so each run gets a different one.

## Conventions this skill relies on (and enforces)
- Every PR title starts with the module ID in brackets, with the part number when a module needs several PRs: `[P07 2/4] Ledger tab`, `[E1 1/5] PCF entities + migrations`, `[M0-SHELL] Swap shell stand-ins`.
- The PR that finishes a module has the line `Completes: <ID>` in its body. A module is **done** when that PR is merged.
- Branch: the session's designated branch if the environment mandates one; otherwise `redesign/<id>-<slug>` (lower case).

## Step 1 · Read live state (always fresh, never from memory)
1. For each repo, list PRs with base `redesign/integration`: open ones (state + draft) and merged ones. Parse `[ID n/m]` from titles and `Completes: ID` from bodies.
2. Merge that with the **baseline** below (work that predates the title convention). The live PR state wins wherever it says more.
3. Also check the FE `redesign/integration` head for facts the gates depend on: `ls src/ui` (which F3 components exist), `ls src/features/shell/standins` (gone = M0-SHELL done), and whether `src/routes` switches each page route.
4. A module is **in progress** if it has an open PR (or a pushed `redesign/<id>-*` branch with commits newer than 24 h and no PR). Skip it unless its ID was passed explicitly, in which case resume it (Step 4b).

### Baseline as of 2026-10-09 (gate report)
Done: Prompt 0 repo setup (FE #61, BE #48, AI #17); data-safety CI (BE #49, AI #18, FE #62); F1 (#63 #65 #67 #68); F3-1 core (#64); F3-2 display components + FilterBar (#70); F2 shell + B3 guard (#66); B1 #50, B2 #51, B5 #52, B4 #53, B6 #54, B7 #55, B8 #56 (BE) and AI #19.
Not done: everything else in the catalogue. F3-3 was claimed by FE #71 on 2026-10-09; its WIP also exists in `/mnt/project-files/f3-work/f3-pr2-pr3.bundle` (commit "wip pr3" on branch `local/f3-pr2`).

## Step 2 · Pick the module
Walk the catalogue for the chosen track **in order** and take the first module that is not done, not in progress, and whose `Needs` are all done. Show the choice in three lines: what's done, what you're picking and why, what it unblocks. If nothing is unblocked, list what each candidate waits on (usually a PR awaiting review/merge) and stop.

Phase rule: no phase 1 page starts until every phase 0 / M0 row is done, unless the user passed its ID explicitly (then warn once and continue).

### Catalogue · redesign track (in order)
| ID | Repo | Spec (in repo) | Needs | What to build |
|---|---|---|---|---|
| F3-2 | FE | docs/redesign/foundation/03-components/CLAUDE.md | F3-1 | KpiStrip, ScopeBar, ChartFrame (+useChartTheme), Callout, Toast, Tabs, SegmentedControl, Tooltip, Menu, Avatar, Badge, FilterBar. If `/mnt/project-files/f3-work/f3-pr2-pr3.bundle` is readable, fetch `local/f3-pr2` from it and start from those commits (review them, squash the "wip" commits); otherwise build from the spec |
| F3-3 | FE | same | F3-2 | Stepper, UnitInput (wraps UnitSelector + utils/unitConversions.ts), FileDrop, DocumentViewer, AuditTimeline, CommandPalette, PoweredBy. Same bundle rule |
| M0-SHELL | FE | docs/redesign/foundation/02-app-shell/CLAUDE.md + 01-theme-tokens | F3-3 | Delete `src/features/shell/standins/` and use src/ui Drawer/Menu/CommandPalette + src/theme; take `look` from `useTheme()` (brand `defaultLook`), not day=Classic/dark=Night; one appearance key, loaded from and saved to B2 `/me/appearance` with localStorage only as cache; Playwright e2e that mocks `/brands/mine` with a Midal brand and checks the flagged shell renders it in Classic/Light/Night |
| B4-TREND | BE | docs/redesign/00-entity-map.md (B4) + docs/redesign/pages/P06-overview/CLAUDE.md | — | Add the 6-month trend and vs-last-year fields P06 needs to `GET /manager/overview`, additive only, with a golden test |
| P01 | FE | docs/redesign/pages/P01-sign-in/CLAUDE.md | M0-SHELL | Client theme before login + PoweredBy. Inventory Login.tsx, AdminLogin.tsx, ResetPassword.tsx first |
| P18 | FE | docs/redesign/pages/P18-brand-themes/CLAUDE.md | P01 | Live Classic/Light/Night preview via buildTheme, contrast warnings, save to Brand; Company Admin view-only; fix brand flash on reload. Inventory BrandSettings.tsx |
| P03-A | FE | docs/redesign/pages/P03-add-data/CLAUDE.md | M0-SHELL | FIRST move useEmissionCalculation (FERA, per_method, unit conversion, mode lock) to pure functions in src/features/add-data/hooks/ with snapshot tests of TODAY's outputs (≥3 site×category, incl. a yearly-mode site and an FY site), green on old code then on moved code with zero diffs; show the test list before moving. Then Stepper shell + manual rows from ColumnConfig with live tCO₂e. Don't touch AI bill flow or distance/duplicates |
| P07 | FE | docs/redesign/pages/P07-approvals-ledger/CLAUDE.md | M0-SHELL | Inventory every action/filter/modal/edge case of pages/Manager/index.tsx and Manager/EmissionsTable.tsx as a PR checklist. DataTable + Drawer + AuditTimeline + DocumentViewer; B6 sort/search, B7 export. Split: Approvals tab, Ledger tab, record Drawer, export |
| P06 | FE | docs/redesign/pages/P06-overview/CLAUDE.md | M0-SHELL, B4-TREND | B4 via one TanStack Query hook; reserved PCF KPI cell behind a prop rendering nothing. Replaces pages/ManagerDashboard/* + SubmissionStatusWidget.tsx |
| P02 | FE | docs/redesign/pages/P02-my-month/CLAUDE.md | M0-SHELL | User home on B5; each row deep-links to /data/new?site=&category=&period= |
| P08 | FE | docs/redesign/pages/P08-production-review/CLAUDE.md | P07 | P07's approval patterns via src/ui, never imported from P07's folder |
| P04 | FE | docs/redesign/pages/P04-my-entries/CLAUDE.md | M0-SHELL | DataTable + Drawer, B6 |
| P05 | FE | docs/redesign/pages/P05-production/CLAUDE.md | P04 | |
| P03-B | FE | P03 spec, "Start from a bill" | P03-A | Reuse A's rows + calc hooks so bill rows get the same validation, period mode and FERA (fixes today's skipped validation / ignored yearly mode); DocumentViewer split view, AI chip + confidence, <60% warn tint, B8 evidence link; nothing AI-filled saved without confirmation |
| P03-C | FE | P03 spec, distance/duplicates/review | P03-A, P03-B | Then switch /data-entry → /data/new and delete pages/UserDataEntry/* + UserDataEntryPage.tsx |
| P10 | FE | docs/redesign/pages/P10-ghg-report/CLAUDE.md | phase 1 done | Backend branded PDF primary with pdfTheme(brand); delete dead GhgReportCharts.tsx first; compare report numbers old vs new on one company+period in the PR; keep pdfTheme/@react-pdf setup in src/theme or src/ui (C05 reuses it) |
| P11 | FE | docs/redesign/pages/P11-ede-report/CLAUDE.md | P10 | Drop wizard step; verify figures vs old page |
| P12 | FE | docs/redesign/pages/P12-targets-sbti/CLAUDE.md | P10 | Same |
| P13 | FE | docs/redesign/pages/P13-notifications/CLAUDE.md | phase 1 done | |
| P14 | FE | docs/redesign/pages/P14-settings/CLAUDE.md | M0-SHELL | Appearance persisted via B2 |
| P15 | FE | docs/redesign/pages/P15-company-users/CLAUDE.md | phase 1 done | |
| P09 | FE | docs/redesign/pages/P09-team-access/CLAUDE.md | phase 1 done | |
| P19 | FE | docs/redesign/pages/P19-sites/CLAUDE.md | phase 2 done | Extract a reusable SetupListPage (list + Drawer form) into src/ui |
| P20, P21, P26, P17, P16 | FE | their docs/redesign/pages/ specs | P19 | One run each, using SetupListPage. Superadmin = always PlanetPulse theme |
| P25 | FE | docs/redesign/pages/P25-products/CLAUDE.md | P19 | Add "Declared unit" field (docs/pcf) and an empty "Footprint (PCF)" tab slot |
| P22, P23, P24, P27 | FE | their specs | phase 2 done | Stepper + FileDrop; call only existing python_AI_service endpoints, list missing ones. P24: move P03's DynamicField to src/ui first. P27: never show a password (legacy UploadPage shows a default one) |
| M3-CLEANUP | FE | 01-plan.md M3 | all pages | `isDark ?` → 0 outside src/theme; delete Layout, Sidebar, TopBar, Table, Modal, Dropdown, context/ThemeContext.tsx; drop Google Fonts from index.html; remove VITE_NEW_UI gating |

### Catalogue · PCF track (in order)
| ID | Repo | Spec | Needs | What to build |
|---|---|---|---|---|
| PCF-0 | none (docs) | docs/pcf/00-pcf-plan.md | — | Method note (every §2 default with a sign-off line; §7 open decisions as questions) + golden spreadsheet (.xlsx) computing the pilot (Midal EC-grade wire rod 9.5 mm, Bahrain, 1 kg) exactly as computePcf will: A1 with recycled split, A2 tonne.km, A3 allocated from plant S1+S2, packaging, waste, cut-off, primary data share, DQR. Clearly marked placeholder numbers, never presented as Midal data. Save under `/mnt/project-files/pcf/phase0/` if that folder exists, and as a PR adding `docs/pcf/phase0/` to ESG-lite. Done when merged |
| E1 | BE | docs/pcf/foundation/E1-data-and-engine/CLAUDE.md | PCF-0 | 5 PRs: entities+migrations; pure computePcf with stage tests + golden test ±0.5% + byte-identical regeneration from factor_snapshot; API routes (User role 403 on /pcf/*, approver ≠ creator); allocation-preview + reconciliation; staleness hook + owner notification. Never reuse a result as a CBAM figure |
| C04 | FE (+BE) | docs/pcf/pages/C04-material-factors/CLAUDE.md | E1, M0-SHELL | Superadmin "Factors ▾ Material factors" + Manager view; manual + Excel import; hide raw values when licence = ecoinvent |
| C01 | FE | docs/pcf/pages/C01-product-footprints/CLAUDE.md | E1, M0-SHELL | |
| C02 | FE | docs/pcf/pages/C02-footprint-builder/CLAUDE.md | C04, C01 | Stepper builder, autosave PUT /inputs, factor picker from C04, live A3 from allocation-preview, Calculate blocked while any AI line <60% is unconfirmed |
| C03 | FE | docs/pcf/pages/C03-footprint-result/CLAUDE.md | C02 | Detail, hotspots, versions, staleness banner |
| C05 | FE (+BE) | docs/pcf/pages/C05-declaration-export/CLAUDE.md | C03, P10 | PDF on P10's pdfTheme + cover gradient; CSV; PACT v3 JSON (phase 2) validated against the schema; DRAFT watermark unless approved/published |
| E2 | AI | docs/pcf/foundation/E2-ai-assist/CLAUDE.md | E1 | /v1/pcf/parse-bom, match-factors, material-factors/parse-excel; confidence + reason on every suggestion; unconvertible unit = warning; raw file stored as evidence. Then wire C02 "Import BOM" + C04 Import in a separate FE PR |
| C06 | FE+BE+AI | docs/pcf/pages/C06-supplier-requests/CLAUDE.md | E2, C02 | Dev mail sink only; ask before any real email |

All PCF FE pages: under `/products/*` behind VITE_NEW_UI, stage colours `--t-series-1…5` in fixed order (A1 materials, A2 transport, A3 energy, A3 packaging, A3 waste). Acceptance for the track: the Midal pilot entered end to end gives the golden spreadsheet's number.

## Step 3 · Ask only what can't be defaulted
Some modules need an input only the user has (PCF-0: real Midal BOM/plant data → use placeholders; E1 golden test → the PCF-0 spreadsheet; E2 → 3 sample BOM files). Look in the repo and `/mnt/project-files/` first; if missing, proceed with clearly marked placeholders and list what's needed in the PR. Never stop the run for it.

## Step 4a · Build the module
0. **Claim before you build.** Re-list open PRs into `redesign/integration` for this module's ID right now (another session may have claimed it since Step 1). If one exists, stop and go back to Step 2. Otherwise make the claim the very first thing you push: branch, add one real commit (for a page, the spec copied to `src/features/<module>/CLAUDE.md`; otherwise `docs/plan-claims/<ID>.md` with your plan), push, and open the draft PR titled `[<ID> 1/m] <name>` with the plan in its body. Only then write code. If, after opening, you see a second open PR for the same ID, the older PR keeps the module: close yours with a comment linking it and pick the next module.
1. `git fetch origin redesign/integration` and branch from it (see Conventions).
2. Read only: the repo's `CLAUDE.md`, `docs/redesign/01-plan.md`, `docs/redesign/00-entity-map.md`, the F1–F3 foundation specs, and the module's spec (+ `docs/pcf/00-pcf-plan.md` for PCF). For a page, copy its spec to `src/features/<module>/CLAUDE.md` first.
3. For a page that replaces old screens: before coding, write the inventory of what the old files do (actions, filters, modals, edge cases) that the spec keeps or drops. It goes in the PR body as a checklist.
4. Write a short plan (files to add/change/delete; PR split ≤ ~600 changed lines each), show it, then continue without waiting. If the spec is ambiguous or contradicts the code, pick the safer default, note it in the PR, and continue.
5. If a component the page needs is missing from `src/ui`, add it there in its own small PR first (`[<ID> 0/m] Add <Component> to src/ui`).
6. Build, applying the **Rules** below, pushing to the claimed draft PR.

## Step 4b · Resume (module already has an open PR or branch)
Read `src/features/<module>/CLAUDE.md`, the open PRs and their checklists, and CI. Say in three lines what's done, left and blocked, then do the next unchecked item. Fix red CI first.

## Rules (definition of done; apply to every module)
- Read only the files listed in 4a.2; don't read other page specs.
- New UI in `src/features/<module>/` (Page.tsx, components/, hooks/, api.ts wrapping existing src/services/*). Shared UI only from `src/ui/`, theme from `src/theme/`. Never import from another feature folder.
- Token colours only: no hex values, no `isDark`, no slate-*/gray-* Tailwind colours in new code.
- Server state via TanStack Query hooks; filters and context (`?site=&period=`) in the URL.
- FE routes: a page registers itself in its own `src/features/<module>/routes.tsx` (`export const pages: ModulePages = { <shell route id>: <Page /> }`, Page lazy-loaded); see `src/features/README.md`. Never edit `src/routes/newUiRoutes.tsx` or `src/routes/legacyPages.tsx` for a page, so parallel PRs don't conflict.
- Behind `VITE_NEW_UI` until the phase ships. The old route redirects to the new one; delete the old files in the PR that switches the route.
- Done = matches spec + previews; renders in PlanetPulse, Midal Classic, Midal Light, Midal Night; loading/empty/error states (no alert()/confirm()); keyboard reachable, Esc closes dialogs; works at 1280/1024/768/390px; unit tests for moved logic; one Playwright smoke test for the main path.
- Don't change backend behaviour unless the module is a backend item (B*, E*). Never invent API fields: degrade as the spec says and list the missing field in the PR.
- Backend: schema changes ship as idempotent `migrate:*` scripts; additive only. Data-safety CI must pass; a destructive line needs a `data-loss-reviewed: <reason>` comment plus (BE/AI) the `data-loss-reviewed` label, and only with the user's OK. A deliberate calculation change needs `UPDATE_SNAPSHOT=1` and the moved figures listed in the PR. Never add secrets to CI.
- Run lint, typecheck and tests (commands are in the repo's CLAUDE.md) before every push.
- PR body: Before/After paragraphs, the inventory checklist (pages), the definition-of-done checklist, any degraded/missing API fields, and `Completes: <ID>` on the module's last PR.

## Step 5 · Finish the run
1. Drive each PR to green CI (fix and re-push; never skip tests or kick CI with empty commits).
2. Report: module built, PR links, what's left for the module (if multi-part), anything the user must provide or decide, and the next module `/next-module` would pick now.
3. Suggest `/review-prs <PR link>` for an independent review before merging. Merging is the user's call; never merge or approve.
