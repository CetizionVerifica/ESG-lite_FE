import { type Column, OverlapChip, StatusPill, formatNumber } from "../../../ui";
import { type ProductionRow, periodText } from "../logic";
import { type RowActions, RowMenu } from "./RowMenu";

export type { RowActions };

/** P05 table. Same columns and cells as P08, without site and reviewer columns (a contributor sees their own sites). */
export function productionColumns({
  overlaps,
  showSite,
  actions,
}: {
  overlaps: Map<number, string[]>;
  showSite: boolean;
  actions: RowActions;
}): Column<ProductionRow>[] {
  return [
    {
      id: "product",
      header: "Product",
      sortable: true,
      hideable: false,
      value: (r) => r.product?.name,
      cell: (r) => (
        <div className="min-w-0">
          <p className="font-medium text-ink">{r.product?.name ?? "—"}</p>
          {showSite && <p className="text-xs text-muted">{r.site?.name}</p>}
        </div>
      ),
    },
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
      id: "notes",
      header: "Notes",
      value: (r) => r.notes ?? "",
      cell: (r) => (r.notes?.trim() ? <span className="line-clamp-2 max-w-[16rem] text-sm">{r.notes}</span> : <span className="text-muted">—</span>),
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      value: (r) => r.status,
      cell: (r) => (
        <div className="space-y-1">
          <StatusPill status={r.status} size="sm" />
          {r.status === "rejected" && r.review_comment && <p className="max-w-[16rem] text-xs text-bad">{r.review_comment}</p>}
        </div>
      ),
      exportValue: (r) => `${r.status}${r.status === "rejected" && r.review_comment ? `: ${r.review_comment}` : ""}`,
    },
    {
      id: "actions",
      header: "Actions",
      hideable: false,
      value: () => null,
      exportValue: () => null,
      cell: (r) => <RowMenu row={r} actions={actions} />,
    },
  ];
}
