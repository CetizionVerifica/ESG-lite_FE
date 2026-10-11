# F2 · App shell: top bar, navigation, page frame

> Blueprint spec. Replaces `src/components/Layout.tsx`, `Sidebar.tsx`, `TopBar.tsx`.
> Depends on F1 (tokens). Every page renders inside this shell.

## Problems today
- Icon-only sidebar that expands on hover (`Sidebar.tsx`), so labels are hidden until mouse-over and it is unusable on touch.
- Four flat link lists per role with duplicate icons (`FolderTree` used for EDE, SBTi, GHG).
- Superadmin has 16 flat links and no top bar; there's no search and no client context.
- Theme toggle and logout live at the bottom of the sidebar.

## New shell (desktop ≥ 1024px)
```
┌ top bar 52px (--t-chrome) ─────────────────────────────────────────────────────┐
│ [client logo] │ Overview  Data▾  Reports▾  Targets  Setup▾ │ ⌘K search │ 🔔 │ avatar▾ │
└──────────────────────────────────────────────────────────────────────────────────┘
│ page header: title · period/site context · primary action (no breadcrumb)     │
│ page body (max-width 1440, 24px gutters)                                       │
```
- Logo slot uses `logoOnDarkUrl` in Classic/Night, `logoUrl` in Light. Falls back to company name.
- Avatar menu: name, email, role, **Appearance** (Light / Dark / System), Settings, Sign out.
- Bell opens a notification popover (last 8, "Mark all read", "See all" → P13). SSE stream from `/notifications/stream` stays as today (`NotificationContext`).
- ⌘K / Ctrl+K command palette: jump to any page, site, category, emission factor; recent items.
- Tablet/mobile (< 1024px): top bar collapses to logo + hamburger; nav becomes a left drawer with labels.

## Navigation per role (labels are final copy)
| Role | Top-level items |
|---|---|
| **User** (contributor) | My month · Add data · My entries · Production |
| **Manager** | Overview · Data ▾ (Approvals, Emissions ledger, Production data) · Reports ▾ (GHG report, EDE report) · Targets (SBTi) · **Products (PCF)** · Team |
| **Admin** (company admin) | Users · (Settings in avatar menu) |
| **Superadmin** | Console · Clients ▾ (Companies, Onboard client, Brand themes) · Setup ▾ (Sites, Users, Countries, Categories, Units, Products) · Factors ▾ (Emission factors, Category mappings, Thresholds) · Capture ▾ (Columns, Column configs, Bulk upload) · Reports ▾ (GHG, EDE) |

Notifications and Settings move to the bell and avatar menu for every role.
Superadmin gets a **client switcher** in the page header that sets the company context (and theme preview) for Reports and Brand themes.

## Route map (old → new). Keep old paths as redirects for one release.
| Old path | New path | Page spec |
|---|---|---|
| `/login`, `/superadmin/login`, `/reset-password` | same | P01 |
| — | `/my-month` (User home) | P02 |
| `/data-entry` | `/data/new` | P03 |
| `/my-emissions` | `/data/mine` | P04 |
| `/production-data` | `/production` | P05 |
| `/manager-dashboard`, `/company/dashboard` | `/overview` | P06 |
| `/data-manage` | `/data/approvals` and `/data/ledger` | P07 |
| `/manage-production-data` | `/data/production` | P08 |
| `/manage-users` | `/team` | P09 |
| `/ghg-reports` | `/reports/ghg` | P10 |
| `/ede-reports` | `/reports/ede` | P11 |
| `/sbti-commitment` | `/targets` | P12 |
| — (new) | `/products/*` | PCF slot, specs in `docs/pcf/` (owned by the "Product carbon footprint plan" thread) |
| `/notifications` | `/notifications` | P13 |
| `/settings` | `/settings` | P14 |
| `/admin-company/users` | `/users` | P15 |
| `/superadmin`, `/admin/dashboard` | `/console` | P16 |
| `/companies`, `/companies/onboard` | `/clients`, `/clients/new` | P17 |
| `/brand-settings` | `/clients/:id/brand` | P18 |
| `/sites` … `/upload-data` | `/setup/*`, `/factors/*`, `/capture/*` | P19–P27 |

`RootRedirect` sends: User → `/my-month`, Manager → `/overview`, Admin → `/users`, Superadmin → `/console`.

## Page frame contract (every page)
- `<PageHeader title actions context />` — one primary button max, top right. No breadcrumb or eyebrow label above the title: the top nav already shows where you are.
- Context chips (Period, Site, Category) live in the header, not in a sidebar, and persist in the URL query.
- Loading = skeleton of the final layout, never a full-page spinner. Empty = `<EmptyState>` with one action.
- Errors = inline banner with retry; toasts only for completed actions.

## Acceptance
- No hover-to-reveal navigation. All nav reachable by keyboard (Tab, arrows in menus, Esc closes).
- Each role sees only its items; deep links to a forbidden route show a 403 page, not the login.
- Old paths redirect.
- Works at 1280, 1024, 768 and 390px wide.
