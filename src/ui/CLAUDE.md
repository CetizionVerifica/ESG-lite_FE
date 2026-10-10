# F3 · Shared component library

> Blueprint spec. Build these once in `src/ui/`; page specs reference them by name.
> Depends on F1. Replaces `components/Table.tsx`, `Modal.tsx`, `Dropdown.tsx` and the many page-local copies.

Every component: token colours only, keyboard accessible, has loading/empty/error variants, documented with a story or a demo route (`/__ui`, dev only).

| Component | Purpose | Key props / behaviour |
|---|---|---|
| `PageHeader` | Title, breadcrumb, context chips, actions | `title`, `crumb[]`, `context` (period/site), `primaryAction`, `secondaryActions[]` |
| `ContextChips` | Period / Site / Category / Scope selectors | Synced to URL query; period supports Month, Quarter, CY, FY, custom |
| `KpiStrip` | One row of 3–5 figures in one panel | Primary KPI wider; delta with ▲▼ and fixed good/bad colour; unit in small text |
| `ScopeBar` | Stacked Scope 1/2/3 bar + legend | Uses `--t-s1/2/3` only |
| `DataTable` | All lists | Column defs, sort, sticky header, row selection, bulk-action bar, column picker, density toggle, server or client pagination, row click → `Drawer`, numbers right-aligned in mono, export CSV/XLSX |
| `FilterBar` | Search + filter chips above a table | Replaces `EmissionsFilterSidebar`; saved views (local) |
| `StatusPill` | pending / approved / rejected / missing / draft | Fixed status tokens + icon + label |
| `Drawer` | Right-side detail panel (480–720px) | Used for record detail, audit trail, edit forms |
| `Modal` | Confirmations and short forms only | Focus trap, Esc, destructive variant |
| `Stepper` | Multi-step flows (data entry, onboarding, bulk upload) | Steps, current, completed, can-jump rules |
| `Field` set | `TextField`, `NumberField` (unit suffix), `Select`, `Combobox` (searchable), `DateField`, `MonthPicker`, `YearPicker`, `Textarea`, `Toggle`, `ColourField` | Label, help, error, required marker; dependent options |
| `UnitInput` | Number + unit selector | Wraps today's `UnitSelector` + `utils/unitConversions.ts` |
| `FileDrop` | Drag-drop upload with progress | Types, size limit, multiple; preview for PDF/image |
| `DocumentViewer` | PDF/image preview | Wraps today's `DocumentViewerModal` (pdfjs) |
| `AuditTimeline` | Change history | Wraps `AuditTrailTimeline`; old → new values, reason, who, when |
| `ChartFrame` + `useChartTheme` | All ECharts | Title, unit, legend, empty state, "view as table" toggle, PNG export |
| `EmptyState` | Nothing to show | Icon, one sentence, one action |
| `Callout` | Insight or guidance box | Info / warn / brand tint |
| `Skeleton` | Loading placeholders | Table rows, KPI, chart |
| `Toast` | Completed actions | Undo where supported |
| `CommandPalette` | ⌘K | Registry of routes + entity search |
| `Avatar`, `Badge`, `Tabs`, `SegmentedControl`, `Tooltip`, `Menu` | Primitives | — |
| `PoweredBy` | "Powered by PlanetPulse ESGLite" mark | Sign-in, report cover, email footer |

## Number formatting (one util, `src/ui/format.ts`)
- Emissions: `tCO₂e` with thousands separators; never converted to `kgCO₂e` (below 1 t: up to 3 decimals, e.g. `0.71 tCO₂e`); 1 decimal for intensity.
- Deltas: `▼ 4.8%` good when lower; never red/green without the arrow.
- Dates: `Sep 2025`, `CY 2025`, `FY 2025-26` (respects `year_type`).

## Acceptance
- `components/Table.tsx`, `Modal.tsx`, `Dropdown.tsx` deleted once all pages migrate.
- Each component has light + dark + Midal Classic snapshots.
