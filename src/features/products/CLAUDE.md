# P25 · Products

> Blueprint spec. Route `/setup/products` (alias `/products`). Role: **Superadmin**. Setup list pattern (see P19).
> Replaces `pages/ProductPage.tsx`.
> Note: PCF (product carbon footprint) is planned in a separate thread with specs under `docs/pcf/`. Products here are the production-data products used for intensity; keep the drawer extensible with a "Footprint (PCF)" tab slot that the PCF specs fill.

## Layout
```
PageHeader "Products"  chips: Client ▾ Site ▾ · search   action: Add product
DataTable: Product | Site | Default unit | Description | Production records | Last period | ⋯
Drawer tabs: Details (Name*, Site*, Default unit* (from units list), Description) · Production (recent records, read-only) · [Footprint (PCF) — slot]
```
## Rules
Site required with validation (today silent failure); site can be changed with warning; delete confirm lists production records.

## Legacy cleanup at M3

P25 shipped behind `VITE_NEW_UI=1` (ESG-lite #76, ESG-lite_FE #113). The flag-off app still uses the old page, so these stay until M3 switches the route for good. Then delete them in the same PR:
- `src/pages/ProductPage.tsx`
- the `products` route in `src/routes/AppRoutes.tsx`, and its `ProductPage` import
- the `Products` entry and the `products` mapping in `src/routes/legacyPages.tsx`
