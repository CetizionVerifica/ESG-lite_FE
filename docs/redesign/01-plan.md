# 01 · Modular redesign plan (Client Brand Themes on Ledger base)

Goal: rebuild the ESGLite UI on one token-based design system where PlanetPulse is the default look and each client gets a premade brand theme (Classic / Light / Night), without changing what the product does. Each module below has its own `CLAUDE.md` blueprint; a developer (or Claude) working on a module reads **only** F1–F3 + that module's spec + `00-entity-map.md`.

## How the work is cut
- **Foundation first, pages in parallel.** Nothing page-level starts until F1 tokens and F3's core components (DataTable, Drawer, PageHeader, Field set, StatusPill) are merged.
- **Strangler migration.** New pages live under `src/features/<module>/` and are switched on per route. Old pages stay until their replacement passes acceptance; old routes redirect.
- **One PR per spec section**, ≤ ~600 changed lines, behind a feature flag `VITE_NEW_UI=1` (or per-role flag) until the phase ships.
- **No backend change is required to start.** Items B1–B8 in the entity map are additive and can land in parallel; specs say which screens degrade gracefully without them.

## Phases and workstreams

| Phase | Workstream | Modules (specs) | Depends on | Size | Suggested owner |
|---|---|---|---|---|---|
| 0 | W0 Foundation | F1 theme tokens + engine, F2 app shell, F3 components | — | L | 2 FE (1 theming, 1 components) |
| 0 | W0-B Backend enablers | B1 brand fields, B2 appearance, B3 route guard (FE), B5 my-month, B4 overview aggregate | — | M | 1 BE |
| 1 | W1 Sign-in & brand | P01 Sign in, P18 Brand themes | F1, B1 | M | Theming dev |
| 1 | W2 Manager core | P06 Overview, P07 Approvals + Ledger, P08 Production review | F3, (B4, B6) | L | 2 FE |
| 1 | W3 Contributor core | P02 My month, P03 Add data (3 devs: context+manual rows / AI bill flow / distance+duplicates+review), P04 My entries, P05 Production | F3, (B5, B8) | XL | 3 FE |
| 2 | W4 Reports & targets | P10 GHG, P11 EDE, P12 Targets | F1 `pdfTheme`, F3 charts | L | 1–2 FE |
| 2 | W5 Everyone | P13 Notifications, P14 Settings, P15 Company users, P09 Team | F3 | M | 1 FE |
| 3 | W6 Superadmin setup | P16 Console, P17 Clients, P19 Sites, P20 Users, P21 Reference, P25 Products, P26 Thresholds | Setup list pattern (P19) | L | 1–2 FE |
| 3 | W7 Data plumbing | P22 Factors, P23 Mappings, P24 Capture setup, P27 Bulk upload | F3 Stepper, AI service | XL | 2 FE (+AI service dev for endpoints) |
| — | PCF slot | `/products/*` nav item and P25 "Footprint" tab | owned by the Product carbon footprint thread (`docs/pcf/`) | — | — |

Order inside a phase is free; phases 1 and 2 can overlap once W0 is merged. Phase 3 is internal-facing (PlanetPulse staff), so it can trail client-facing work.

## Definition of done (every module)
1. Matches its spec's layout and the screen in the previews artifact.
2. No hex colours or `isDark` in the module; renders correctly in PlanetPulse, Midal Classic, Midal Light, Midal Night.
3. Loading, empty and error states implemented; no `alert()` / `confirm()` / console-only errors.
4. Keyboard: all actions reachable; focus visible; dialogs trap focus and close on Esc.
5. Works at 1280 / 1024 / 768 / 390px.
6. Old route redirects; old files deleted in the same PR that switches the route.
7. Unit tests for any logic moved (calc, theme builder, period labels); Playwright smoke test for the page's main path.

## Shared conventions (put in `ESG-lite_FE/CLAUDE.md` when coding starts)
- Folder per module: `src/features/<module>/` with `Page.tsx`, `components/`, `hooks/`, `api.ts` (wraps existing `src/services/*`).
- Shared UI in `src/ui/`, theme in `src/theme/`. Pages never import from another feature folder; shared pieces move to `src/ui/`.
- Server state through one data hook layer (recommendation: TanStack Query) to replace ad-hoc `useEffect` fetching and sequential loops.
- URL holds filters/context (`?site=&period=`) so links are shareable.
- Copy: product name "ESGLite"; "tCO₂e"; sentence case; status words Pending / Approved / Rejected / Missing.

## Risks and how the plan handles them
| Risk | Mitigation |
|---|---|
| P03 data entry is 5,557 lines of subtle logic (FERA, per_method, unit conversion, mode lock) | Move `useEmissionCalculation` first with tests that snapshot today's outputs; UI rebuild only after tests are green |
| Client theme fails contrast (e.g. Chieron amber, Glochem red) | F1 contrast gate + status colours fixed + icons on status pills |
| Two PDF pipelines (client @react-pdf vs backend branded) | P10 makes backend branded PDF primary; quick PDF retired once monthly/quarterly covered |
| No role guard today | F2 adds guard in phase 0 (cheap, high value) |
| Superadmin pages light-only inside a dark rail | Fixed automatically by tokens; no per-page dark work |
| Scope creep (PCF, new features) | PCF has its own thread and specs; this plan only reserves nav + tab slots |

## Milestones (no dates; the team sets them)
- **M0** Tokens + shell + DataTable live behind flag; Midal theme visible on an empty shell.
- **M1** Managers on new Overview + Approvals; contributors on My month + Add data. Old manager/user pages deleted.
- **M2** Reports, targets, notifications, settings migrated.
- **M3** Superadmin console and setup migrated; `isDark` count = 0; old components deleted.
