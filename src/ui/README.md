# src/ui

Shared UI components for the redesign. Spec: `CLAUDE.md` in this folder (copied from `docs/redesign/foundation/03-components/CLAUDE.md`).

- Import from `src/ui` (the `index.ts` barrel). Feature folders never import from each other.
- Token colours only (from `src/theme/`): no hex values, no `isDark`, no `slate-*` / `gray-*` classes.
  Radius: `rounded-control` for inputs/buttons, `rounded-card` for panels, `rounded-chip` for small chips.
- Every component handles loading, empty and error, is keyboard reachable and shows focus.
- Gallery: `/__ui` (dev only, `npm run dev`), `?theme=light|dark|classic`.
  Snapshots of it: `npm run test:ui-snapshots` (opt-in, PNGs in `e2e/ui/__snapshots__`).
- Add a demo section to `demo/` and a snapshot entry in `e2e/ui/components.spec.ts` for every new component.

## What's here

| Piece | File | Notes |
|---|---|---|
| Number, delta and date text | `format.ts` | `formatEmissions` (t → kg below 1 t), `emissionsParts`, `formatIntensity`, `formatDelta` (arrow + tone), `formatMonth`, `formatDate`, `formatReportingYear` |
| Reporting periods | `period.ts` | `?period=` values `2025-09`, `2025-Q3`, `CY2025`, `FY2025` (start year), `2025-01-01_2025-06-30`; `periodLabel`, `periodRange(p, fyStartMonth)` |
| `Button` | `Button.tsx` | primary / secondary / ghost / danger, `loading` |
| `StatusPill` | `StatusPill.tsx` | pending / approved / rejected / missing / draft: icon + label, fixed status colours |
| `EmptyState` | `EmptyState.tsx` | one sentence, one action; `variant="error"` for failures |
| `Skeleton` | `Skeleton.tsx` | `SkeletonText`, `SkeletonTableRows`, `SkeletonKpi`, `SkeletonChart` |
| `Modal` | `Modal.tsx` | confirmations and short forms; focus trap, Esc, `tone="destructive"`, `error` |
| `Drawer` | `Drawer.tsx` | right panel 480/600/720px; `loading`, `error` + `onRetry`, sticky `footer` |
| Field set | `fields/` | `TextField`, `NumberField` (unit suffix), `Select`, `Combobox`, `DateField`, `MonthPicker`, `YearPicker`, `Textarea`, `Toggle`, `ColourField`; all take `label`, `help`, `error`, `required`, `loading`, `disabled` |
| `Popover` | `Popover.tsx` | anchored panel for chip editors and pickers; Esc returns focus to the trigger |
| `PageHeader` | `PageHeader.tsx` | `title`, `crumb[]`, `description`, `context`, `primaryAction`, `secondaryActions[]`, `loading` |
| `ContextChips` | `ContextChips.tsx` | Period (Month / Quarter / CY / FY / custom, with ‹ › stepping), Site (multi), Category, Scope; synced to `?period=&site=&category=&scope=` |
| `useContextParams` | `hooks/useContextParams.ts` | read/write the same URL context in a page: `const [ctx, update] = useContextParams(defaults)` |
| `DataTable` | `table/` | column defs, sort (client or `onSortChange` for server), sticky header, selection + bulk bar, column picker + density (persisted with `storageKey`), client or server pagination, `onRowClick` (Enter too) → open a `Drawer`, numeric columns right-aligned mono, CSV/XLSX export (formula-safe CSV) |
| `FilterBar` | `FilterBar.tsx`, `filterLogic.ts` | search (debounced) + filter chips (multi or single choice), Clear all, saved views in this browser (`storageKey`); keep the value in the URL with `useFilterParams(["status", "site"])` (`?q=&status=pending,approved`) |
| `KpiStrip` | `KpiStrip.tsx` | 3–5 figures in one panel; `primary` is wider; `onSelect` + `selected` make a figure a filter toggle; `format: "emissions"` picks t/kg; delta ▲▼ with fixed good/bad colour; loading/error |
| `ScopeBar` | `ScopeBar.tsx` | stacked Scope 1/2/3 bar + legend from `--t-s1/2/3` only; loading/empty |
| `ChartFrame` | `ChartFrame.tsx` | wraps ECharts with `useChartTheme()`; title + unit, Chart/Table toggle, PNG export, loading/empty/error. Pass `option={(t) => …}` to use `t.scopes.s1` etc. |
| `Callout` | `Callout.tsx` | info / warn / brand tint; optional action and dismiss |
| `Toast` | `Toast.tsx`, `toastStore.ts` | `ToastProvider` is mounted in `main.tsx`; `const { toast } = useToast(); toast({ title, tone, action: { label: "Undo", onClick } })` |
| `Tabs`, `TabPanel` | `Tabs.tsx` | ARIA tabs, arrow keys/Home/End, counts |
| `SegmentedControl` | `SegmentedControl.tsx` | radiogroup with roving focus |
| `Tooltip` | `Tooltip.tsx` | hover + focus, Esc hides; short hints only |
| `Menu` | `Menu.tsx` | action menu: arrows, Enter, Esc returns focus; `danger`, radio (`checked`) and `current` items, separators and headings |
| `Avatar`, `Badge` | `Avatar.tsx`, `Badge.tsx` | initials fallback; neutral/brand/info/good/warn/bad badges |
| `Stepper` | `Stepper.tsx` | steps, `current`, `completed`, `canJump` rule (default: done steps + the next open one); "Step 2 of 3" on phones |
| `UnitInput` | `UnitInput.tsx`, `unitMatch.ts` | number + unit; same rules as UserDataEntry's `UnitSelector` (`utils/unitConversions`): mismatch error, or "Convert to kWh" when a factor exists |
| `FileDrop` | `FileDrop.tsx`, `fileRules.ts` | drag-drop or "Choose files"; `accept`, `maxSize`, `multiple`, `maxFiles`; per-file progress/error; image thumbnails; `onPreview` for PDF/image |
| `DocumentViewer` | `DocumentViewer.tsx`, `documentKind.ts` | full-screen preview (image, PDF, video, audio, Office via Office Online), ‹ › and arrow keys, download; `fromEmissionDocument(doc)` adapts documentService records |
| `AuditTimeline` | `AuditTimeline.tsx`, `auditFormat.ts` | who / when / action / old → new / reason; `EntityAuditTimeline` fetches `/user/audit-logs` with TanStack Query |
| `CommandPalette` | `CommandPalette.tsx`, `paletteFilter.ts` | ⌘K dialog; same props as the shell's stand-in (`commands`, `recent`, `onRun`) plus `results` / `onQueryChange` for entity search |
| `DynamicField` | `DynamicField.tsx` | one ColumnConfig column (dependent select, number or text) from a `FormModel` in `src/lib/emissions`; used by Add data and the My entries edit drawer |
| Review kit | `RejectReasonModal.tsx`, `review.ts`, `hooks/useUndoableApprove.ts`, `hooks/useRowKeys.ts` | shared by the approval lists (P07, P08): reject dialog with required reason + suggested reasons (`noun` for "record"), approve with an 8 s undo window (`UNDO_MS`), J/K/A/R/Space row keys |
| `PoweredBy` | `PoweredBy.tsx` | "Powered by PlanetPulse ESGLite"; `onDark` on cover/brand fills; `POWERED_BY_TEXT` for emails and PDFs |

The legacy `components/DocumentViewerModal.tsx`, `AuditTrailTimeline.tsx` and `pages/UserDataEntry/components/UnitSelector.tsx` stay until their last page migrates; the new versions reuse their services and conversion rules but not their markup (it is hard-coded to `isDark` and slate/gray colours).
