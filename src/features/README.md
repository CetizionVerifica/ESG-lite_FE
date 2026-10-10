# src/features

One folder per redesigned module, e.g. `src/features/my-month/`:

```
src/features/<module>/
  CLAUDE.md     copied from docs/redesign/pages/<Pxx-...>/ or docs/pcf/pages/<Cxx-...>/ when work starts
  Page.tsx
  routes.tsx    the module's shell pages: export const pages: ModulePages
  components/
  hooks/        TanStack Query hooks
  api.ts        wraps the existing src/services/*
```

- Never import from another feature folder; move shared pieces to `src/ui/`.
- Register the module's pages in its own `routes.tsx`, keyed by shell route id from `src/features/shell/routeMap.ts`, e.g.
  `export const pages: ModulePages = { sites: <Page /> }` with `const Page = lazy(() => import("./Page"))`.
  `src/routes/newUiRoutes.tsx` picks every `routes.tsx` up by glob and it overrides the route's entry in
  `src/routes/legacyPages.tsx`, so a page PR edits neither file. They mount only when `VITE_NEW_UI=1`.
