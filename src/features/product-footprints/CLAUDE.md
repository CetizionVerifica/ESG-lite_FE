# C01 · Product footprints (portfolio)

> Blueprint spec. Route `/products`. Role: **Manager** (Superadmin via client switcher).
> Depends on: F1 tokens, F2 shell (new top-level nav item **Products**), F3 (`PageHeader`, `KpiStrip`, `DataTable`, `StatusPill`, `EmptyState`, `Callout`), E1 `GET /pcf/studies`, `/pcf/reconciliation`.

## Job to be done
"Which of our products have a footprint a customer can use, which are out of date, and which product should we do next?"

## Layout (desktop)
```
PageHeader: crumb "{Company} · Products"  title "Product footprints"   context: [Site ▾] [Year ▾]
            primary: "New footprint"
┌ KpiStrip ───────────────────────────────────────────────────────────────────────┐
│ Products footprinted 4 of 6 │ Production covered 92% │ Plant energy allocated 96% │ Primary data share 38% │
└──────────────────────────────────────────────────────────────────────────────────┘
DataTable: Product | Declared unit | kgCO₂e per unit | vs previous | Stage bar (A1/A2/A3) | Primary data | Status | Updated
Callout (right or below): "Bahrain plant energy is 96% allocated. AAAC conductor has no footprint yet."
```

## Sections
1. **KpiStrip**: products with an approved/published footprint ÷ products with approved production; production covered (by volume); reconciliation % (E1 `/pcf/reconciliation`); emission-weighted primary data share.
2. **Table**: one row per product (latest version). Stage bar is a 60px mini stacked bar using stage tokens. Status pill: Draft, In review, Approved, Published, **Out of date** (stale, warn tint, with icon). Rows without a study show "No footprint" and a "Start" link. Row click → C03.
3. **Filters**: status chips, site, PCR tag. Search by product name.
4. **Bulk actions** (selected rows): export CSV, export PACT JSON (published only).

## States
- No products in Setup: `EmptyState` "Add products in Setup first" (Superadmin) or "Ask your admin to add products" (Manager).
- No approved production for the year: callout explaining that A3 needs approved production data, link to P08.

## Acceptance
- Matches screen "Portfolio" in the Product Footprints previews artifact in PlanetPulse, Midal Classic and Midal Night.
- Every KPI links to the filtered table that produced it.
