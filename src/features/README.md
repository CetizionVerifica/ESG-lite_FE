# src/features

One folder per redesigned module, e.g. `src/features/my-month/`:

```
src/features/<module>/
  CLAUDE.md     copied from docs/redesign/pages/<Pxx-...>/ or docs/pcf/pages/<Cxx-...>/ when work starts
  Page.tsx
  components/
  hooks/        TanStack Query hooks
  api.ts        wraps the existing src/services/*
```

- Never import from another feature folder; move shared pieces to `src/ui/`.
- Register the module's routes in `src/routes/newUiRoutes.tsx`; they mount only when `VITE_NEW_UI=1`.
