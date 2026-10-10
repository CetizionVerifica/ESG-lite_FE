import type { ProductionDataStatus } from "../../../services/productionDataService";
import { type Column, OverlapChip, StatusPill, formatDate, formatNumber } from "../../../ui";
import { type ProductionRow, periodText } from "../logic";
import { type RowActions, RowMenu } from "./RowMenu";

export type { RowActions };

export function productionColumns({
  statusOf,
  overlaps,
  actions,
}: {
  statusOf: (row: ProductionRow) => ProductionDataStatus;
  overlaps: Map<number, string[]>;
  actions: RowActions;
}): Column<ProductionRow>[] {
  return [
    { id: "site", header: "Site", value: (r) => r.site?.name, sortable: true },
    { id: "product", header: "Product", value: (r) => r.product?.name, sortable: true },
    { id: "quantity", header: "Quantity", numeric: true, sortable: true, value: (r) => Number(r.quantity), cell: (r) => formatNumber(Number(r.quantity), 2) },
    { id: "unit", header: "Unit", value: (r) => r.unit },
    {
      id: "period",
      header: "Period",
      sortable: true,
      value: (r) => periodText(r.start_date, r.end_date),
      sortValue: (r) => r.start_date,
      cell: (r) => {
        const o = overlaps.get(r.production_id);
        return (
          <span className="flex flex-wrap items-center gap-1.5">
            <span className="whitespace-nowrap">{periodText(r.start_date, r.end_date)}</span>
            {o && <OverlapChip ranges={o} />}
          </span>
        );
      },
      exportValue: (r) => {
        const o = overlaps.get(r.production_id);
        return `${periodText(r.start_date, r.end_date)}${o ? ` (overlaps ${o.join(", ")})` : ""}`;
      },
    },
    {
      id: "submitted",
      header: "Submitted by",
      sortable: true,
      value: (r) => r.created_by?.name,
      sortValue: (r) => r.created_at,
      cell: (r) => (
        <span className="whitespace-nowrap">
          {r.created_by?.name ?? "—"} <span className="text-muted">· {formatDate(r.created_at)}</span>
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      value: (r) => statusOf(r),
      cell: (r) => <StatusPill status={statusOf(r)} size="sm" />,
      exportValue: (r) => `${statusOf(r)}${r.status === "rejected" && r.review_comment ? `: ${r.review_comment}` : ""}`,
    },
    {
      id: "actions",
      header: "Actions",
      hideable: false,
      value: () => null,
      exportValue: () => null,
      cell: (r) => <RowMenu row={r} pending={statusOf(r) === "pending"} actions={actions} />,
    },
  ];
}
