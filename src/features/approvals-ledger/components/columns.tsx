import type { EmissionStatus } from "../../../services/emissionService";
import { type Column, StatusPill, cn, formatDate, formatEmissions, formatNumber } from "../../../ui";
import { type RowActions, RowMenu } from "./RowMenu";
import { feraSubLabel, twinsTotal } from "../../../lib/scope3/fera";
import { type ColumnConfig, type LedgerRow, activityFields, activitySummary, quantityOf, rowPeriodLabel, scopeNumber } from "../logic";

const SCOPE_DOT: Record<1 | 2 | 3, string> = { 1: "bg-s1", 2: "bg-s2", 3: "bg-s3" };

export type { RowActions };

export function ledgerColumns({
  configOf,
  feraOf,
  statusOf,
  actions,
}: {
  configOf: (siteId: number, categoryId: number) => ColumnConfig | undefined;
  feraOf: Map<number, LedgerRow[]>;
  statusOf: (row: LedgerRow) => EmissionStatus;
  actions: RowActions;
}): Column<LedgerRow>[] {
  const fieldsOf = (r: LedgerRow) => activityFields(r, configOf(r.site?.site_id ?? 0, r.category?.category_id ?? 0));
  return [
    {
      id: "site",
      header: "Site",
      value: (r) => r.site?.name,
      sortable: true,
      cell: (r) => (
        <span title={r.site?.name} className="block max-w-[11rem] truncate">
          {r.site?.name ?? "—"}
        </span>
      ),
    },
    {
      id: "category",
      header: "Category",
      value: (r) => r.category?.category_name,
      sortable: true,
      cell: (r) => {
        const scope = scopeNumber(r.category?.scope);
        return (
          <span className="inline-flex max-w-[14rem] items-center gap-1.5">
            {scope && <span aria-hidden className={cn("size-2 shrink-0 rounded-full", SCOPE_DOT[scope])} />}
            <span title={r.category?.category_name} className="truncate">
              {r.category?.category_name ?? "—"}
            </span>
            {/* A FERA row of its own (FERA filter, or a twin waiting alone) says which part of Category 3 it is. */}
            {r.scope3_sub && <span className="shrink-0 text-xs text-muted">{feraSubLabel(r.scope3_sub).replace("Category 3 · ", "")}</span>}
            {scope && <span className="sr-only">Scope {scope}</span>}
          </span>
        );
      },
    },
    {
      id: "activity",
      header: "Key activity",
      value: (r) => activitySummary(fieldsOf(r)).text,
      cell: (r) => {
        const s = activitySummary(fieldsOf(r));
        return (
          <span className="flex max-w-[16rem] items-baseline gap-1.5">
            <span className="truncate">{s.text || "—"}</span>
            {s.more > 0 && <span className="shrink-0 text-xs text-muted">+{s.more} {s.more === 1 ? "field" : "fields"}</span>}
          </span>
        );
      },
    },
    {
      id: "quantity",
      header: "Quantity",
      numeric: true,
      value: (r) => quantityOf(fieldsOf(r)),
      cell: (r) => {
        const q = quantityOf(fieldsOf(r));
        return q === null ? "—" : `${formatNumber(q, 2)} ${r.activity_data_unit ?? ""}`.trim();
      },
    },
    {
      id: "tco2e",
      header: "tCO₂e",
      numeric: true,
      sortable: true,
      value: (r) => Number(r.total_emission),
      cell: (r) => {
        const fera = feraOf.get(r.pk_id);
        return (
          <span className="flex flex-col items-end leading-tight">
            <span>{formatNumber(Number(r.total_emission), 3)}</span>
            {fera && (
              <span className="text-xs text-muted" title={fera.map((f) => `${feraSubLabel(f.scope3_sub)}: ${formatEmissions(Number(f.total_emission))}`).join("\n")}>
                +{formatEmissions(twinsTotal(fera))} FERA
              </span>
            )}
          </span>
        );
      },
    },
    { id: "period", header: "Period", value: (r) => rowPeriodLabel(r), sortable: true },
    {
      id: "status",
      header: "Status",
      info: "status",
      value: (r) => statusOf(r),
      sortable: true,
      cell: (r) => <StatusPill status={statusOf(r)} size="sm" />,
    },
    {
      id: "submitted",
      header: "Submitted",
      value: (r) => r.created_at,
      sortable: true,
      cell: (r) => (
        <span className="inline-flex max-w-[14rem] gap-1 whitespace-nowrap">
          <span title={r.created_by?.name} className="truncate">
            {r.created_by?.name ?? "—"}
          </span>
          <span className="shrink-0 text-muted">· {formatDate(r.created_at)}</span>
        </span>
      ),
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
