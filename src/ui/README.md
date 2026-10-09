# src/ui

Shared UI components for the redesign. Spec: `CLAUDE.md` in this folder (copied from `docs/redesign/foundation/03-components/CLAUDE.md`).

- Import from `src/ui` (the `index.ts` barrel). Feature folders never import from each other.
- Token colours only (from `src/theme/`): no hex values, no `isDark`, no `slate-*` / `gray-*` classes.
  Radius: `rounded-control` for inputs/buttons, `rounded-card` for panels, `rounded-chip` for small chips.
- Every component handles loading, empty and error, is keyboard reachable and shows focus.
- Gallery: `/__ui` (dev only, `VITE_NEW_UI=1 npm run dev`), `?theme=light|dark|classic`.
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
