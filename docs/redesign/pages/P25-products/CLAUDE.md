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
