import { Badge, type Column, cn } from "../../../ui";
import { STATUS_LABEL, STATUS_TONE, type SupplierRequest, dueText, studyLabel, unitLabel, validityText, valueText } from "../logic";

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");

/** Supplier | Material | Footprint | Requested | Due | Status | Value | Validity (spec C06). */
export function requestColumns(): Column<SupplierRequest>[] {
  return [
    {
      id: "supplier",
      header: "Supplier",
      hideable: false,
      sortable: true,
      value: (r) => r.supplier_name ?? r.supplier_email,
      cell: (r) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium text-ink">{r.supplier_name ?? r.supplier_email}</span>
          {r.supplier_name && <span className="block truncate text-xs text-muted">{r.supplier_email}</span>}
        </span>
      ),
    },
    {
      id: "material",
      header: "Material",
      sortable: true,
      value: (r) => r.material,
      cell: (r) => (
        <span className="block min-w-0">
          <span className="block truncate text-ink">{r.material}</span>
          <span className="block truncate text-xs text-muted">per {unitLabel(r.unit)}</span>
        </span>
      ),
    },
    { id: "footprint", header: "Footprint", sortable: true, value: (r) => studyLabel(r) },
    { id: "requested", header: "Requested", sortable: true, width: "7rem", value: (r) => r.sent_at ?? r.created_at, cell: (r) => when(r.sent_at ?? r.created_at) },
    {
      id: "due",
      header: "Due",
      sortable: true,
      width: "7rem",
      value: (r) => r.due_date,
      cell: (r) => {
        const d = dueText(r);
        return <span className={cn(d.overdue && "text-bad")}>{d.text}</span>;
      },
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      width: "7rem",
      value: (r) => STATUS_LABEL[r.status],
      cell: (r) => <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>,
    },
    {
      id: "value",
      header: "Value",
      sortable: true,
      value: (r) => r.accepted?.value_kgco2e ?? r.reply?.value_kgco2e ?? null,
      exportValue: (r) => valueText(r).text,
      cell: (r) => {
        const v = valueText(r);
        return <span className={cn("font-num tabular-nums", v.pending ? "text-warn" : "text-ink")}>{v.text}</span>;
      },
    },
    {
      id: "validity",
      header: "Validity",
      sortable: true,
      width: "8rem",
      value: (r) => r.reply?.valid_to ?? null,
      exportValue: (r) => validityText(r).text,
      cell: (r) => {
        const v = validityText(r);
        return <span className={cn(v.expired && "text-bad")}>{v.text}</span>;
      },
    },
  ];
}
