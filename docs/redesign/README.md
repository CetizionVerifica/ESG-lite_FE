# ESGLite redesign blueprint (Client Brand Themes)

Planning only. No code in ESG-lite_FE, ESG-lite or python_AI_service has been changed.

| File | What it is |
|---|---|
| `00-entity-map.md` | Every entity in the backend and AI service, how they relate, which pages use them, proposed backend additions, and the old-screen → new-page table |
| `01-plan.md` | Phases, workstreams, owners, definition of done, risks |
| `foundation/01-theme-tokens/CLAUDE.md` | F1 design tokens and the client theme engine (PlanetPulse default, Classic/Light/Night per client) |
| `foundation/02-app-shell/CLAUDE.md` | F2 top bar, role navigation, route map, page frame |
| `foundation/03-components/CLAUDE.md` | F3 shared component library |
| `pages/P01…P27/CLAUDE.md` | One blueprint per page |

Pages:
P01 Sign in · P02 My month · P03 Add data · P04 My entries · P05 Production · P06 Overview · P07 Approvals + Ledger · P08 Production review · P09 Team · P10 GHG report · P11 EDE report · P12 Targets (SBTi) · P13 Notifications · P14 Settings · P15 Company users · P16 Console · P17 Clients · P18 Brand themes · P19 Sites · P20 Users · P21 Reference data · P22 Emission factors · P23 Category mappings · P24 Capture setup · P25 Products · P26 Thresholds · P27 Bulk upload.

PCF (product carbon footprint) is planned separately under `docs/pcf/`; this blueprint reserves its nav slot (`/products/*`) and a tab in P25.

When coding starts, copy a module's `CLAUDE.md` into the matching `src/features/<module>/` folder in ESG-lite_FE so Claude Code loads it automatically when working there.
