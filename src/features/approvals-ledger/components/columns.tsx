import type { EmissionStatus } from "../../../services/emissionService";
import { type Column, CheckChip, ReadyChip, StatusPill, UncheckedChip, cn, formatDate, formatEmissions, formatNumber } from "../../../ui";
import { type CheckContext, factorYearFor, heldChip, isReady, readChecks } from "../../../lib/scope3/checks";
import { type RowActions, RowMenu } from "./RowMenu";
import { type ColumnConfig, type LedgerRow, activityFields, activitySummary, quantityOf, rowPeriodLabel, scopeNumber } from "../logic";

const SCOPE_DOT: Record<1 | 2 | 3, string> = { 1: "bg-s1", 2: "bg-s2", 3: "bg-s3" };

export type { RowActions };

export function ledgerColumns({
  configOf,
  feraOf,
  statusOf,
  actions,
  checks,
}: {
  configOf: (siteId: number, categoryId: number) => ColumnConfig | undefined;
  feraOf: Map<number, LedgerRow>;
  statusOf: (row: LedgerRow) => EmissionStatus;
  actions: RowActions;
  /** S3-15: add the "Why it's held" column, with these values for the copy. */
  checks?: CheckContext;
}): Column<LedgerRow>[] {
  const fieldsOf = (r: LedgerRow) => activityFields(r, configOf(r.site?.site_id ?? 0, r.category?.category_id ?? 0));
  const columns: Column<LedgerRow>[] = [
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
            {fera && <span className="text-xs text-muted">+{formatEmissions(Number(fera.total_emission))} FERA</span>}
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
  if (checks) {
    const at = columns.findIndex((c) => c.id === "activity") + 1;
    columns.splice(at, 0, heldColumn(checks));
  }
  return columns;
}

/** The factor year the "No factor for {year}" chip names (the entry's year − 1). */
const yearOf = (r: LedgerRow) => factorYearFor(r.date_of_reporting);

/** Reason chips per held row (word and icon), "Ready" when every check passed. */
function heldColumn(ctx: CheckContext): Column<LedgerRow> {
  const reasons = (r: LedgerRow) => readChecks(r.checks);
  return {
    id: "held",
    header: "Why it's held",
    wrap: true,
    value: (r) => {
      const c = reasons(r);
      if (!c) return "Not checked yet";
      return isReady(c) ? "Ready" : c.held.map((id) => heldChip(id, { ...ctx, year: yearOf(r) }).label).join(", ");
    },
    cell: (r) => {
      const c = reasons(r);
      if (c === undefined) return null;
      if (c === null) return <UncheckedChip />;
      if (isReady(c)) return <ReadyChip />;
      return (
        <span className="flex max-w-[18rem] flex-wrap gap-1" data-testid="held-reasons">
          {c.held.map((id) => {
            const chip = heldChip(id, { ...ctx, year: yearOf(r) });
            return <CheckChip key={id} label={chip.label} hint={chip.hint} icon={chip.icon} />;
          })}
        </span>
      );
    },
  };
}
