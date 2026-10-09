# src/ui

Shared UI components for the redesign (DataTable, Drawer, PageHeader, Field set, StatusPill, ...).
Spec: `docs/redesign/foundation/03-components/CLAUDE.md`.

- Feature folders import shared pieces from here, never from each other.
- Token colours only (from `src/theme/`): no hex values, no `isDark`, no `slate-*` / `gray-*` classes.
- Export each component from `index.ts`.
