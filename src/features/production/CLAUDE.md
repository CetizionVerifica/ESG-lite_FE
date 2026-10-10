# P05 · Production (contributor)

> Blueprint spec. Route `/production` (alias `/production-data`). Role: **User**.
> Replaces `pages/ProductionDataPage.tsx` (511) and `ProductionDataBulkUpload.tsx` (733).
> Depends on: F3 `DataTable`, `Drawer`, `UnitInput`, `Stepper`, `FileDrop`.

## Job to be done
"Log how much each product line made this period so intensity is right."

## Data
`productionDataService` (getProductionDataBySite, create, update, delete, bulkCreateProductionData); `productService.getProductsBySite`.

## Layout
```
PageHeader "Production"  chips: Site ▾ Period ▾   actions: Upload sheet · Add production (primary)
Per-product cards row: Product · last period quantity · status of this month (To do / Pending / Approved)
DataTable: Product | Quantity (mono) | Unit | Period | Notes | Status (+reason) | ⋯ (Edit/Delete if not approved, History)
Drawer "Add production": Product, Quantity (UnitInput, units from Product.unit), Period (month picker; custom range option), Notes
```

## Upload sheet (Stepper in a wide drawer)
1. Upload: FileDrop `.xlsx/.xls/.csv` ≤ 5MB, **Download template**. Date formats as today (DD-MM-YYYY, MM-YYYY, "March 2027", ISO, Excel serial; month+year columns).
2. Review: chips Total / Valid / Needs fix / Excluded; editable grid with per-row errors; excluded table with reasons ("Product X isn't assigned to your site").
3. Result: created / failed rows with reasons; "Upload another".

## Rules
- Hide internal ID column. Delete has a confirm modal. Every error visible (today console only).
- Overlap warning for same product and overlapping period.
- No products on site: empty state "No products are set up for {site}. Ask your admin to add them."

## Acceptance
Every failure path shows a message; template download works; same table as P08.
