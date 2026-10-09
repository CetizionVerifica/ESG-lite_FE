# P08 · Production review

> Blueprint spec. Route `/data/production` (alias `/manage-production-data`). Role: **Manager**.
> Replaces `pages/ManagerProductionDataPage.tsx` (688 lines).
> Depends on: F3 `DataTable`, `FilterBar`, `Drawer`, `AuditTimeline`, `UnitInput`. Shares the approval model of P07.

## Job to be done
"Check the production quantities that feed intensity, approve them, fix mistakes."

## Data
`productionDataService`: getProductionDataForManager({siteId,status,productId}), approveProductionData, rejectProductionData, bulkApproveProductionData, bulkRejectProductionData, managerUpdateProductionData. `productService.getProductsBySite`. AuditLog `entity_type = production_data`.

## Layout
```
PageHeader "Production data"  chips: Sites ▾ (multi)  Product ▾  Period ▾   actions: Export
FilterBar: Status chips · search
DataTable: ☐ | Site | Product | Quantity (mono) | Unit | Period "Jan 1 – Jan 31, 2025" | Submitted by | Status | ⋯
Bulk bar: Approve · Reject
Drawer: values, notes, intensity impact ("Adds 4,200 t to Sep; intensity 2.20 → 2.18"), history, Edit
```

## Rules
- Multi-site (today single site only). Select-all selects **pending only** for approve/reject.
- Edit (drawer): Quantity (`UnitInput`, unit from `Product.unit` list, not free text), Start, End, Notes, **Reason required** (today missing, inconsistent with emissions).
- Overlapping periods for the same product+site flagged with warn chip "Overlaps Feb 1–15".
- Pagination and export (today none).
- Same reject reason modal and undo toast as P07.

## States
Empty: "No production data for {filters}". No products on site: link to Superadmin contact text. Errors visible (today console only).

## Acceptance
Same keyboard and bulk behaviour as P07; loading state on action buttons; works across 3+ sites.
