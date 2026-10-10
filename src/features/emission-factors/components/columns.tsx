import { Pencil } from "lucide-react";
import { type Column, cn, focusRing } from "../../../ui";
import { type Batch, type Factor, batchLabel, factorNumber, formatFactor } from "../logic";

const dash = <span className="text-muted">—</span>;

/** Factors tab columns. Sorting is the server's (year, newest first), so no column sorts. */
export function factorColumns(opts: { batches: Batch[] | undefined; onEdit: (row: Factor) => void }): Column<Factor>[] {
  return [
    { id: "site", header: "Site", value: (r) => r.site?.name ?? "" },
    { id: "category", header: "Category", value: (r) => r.category?.category_name ?? "" },
    {
      id: "name",
      header: "Emission category name",
      value: (r) => r.emission_category_name ?? "",
      cell: (r) => (r.emission_category_name ? <span className="block max-w-[18rem] truncate" title={r.emission_category_name}>{r.emission_category_name}</span> : dash),
    },
    { id: "year", header: "Year", width: "5rem", value: (r) => r.year, cell: (r) => <span className="font-num">{r.year}</span> },
    {
      id: "factor",
      header: "Factor",
      numeric: true,
      width: "8rem",
      value: (r) => factorNumber(r.factor_value),
      cell: (r) => <span className="font-num">{formatFactor(r.factor_value)}</span>,
    },
    { id: "unit", header: "Unit", width: "7rem", value: (r) => r.denominator_unit ?? "", cell: (r) => (r.denominator_unit ? r.denominator_unit : dash) },
    {
      id: "source",
      header: "Source",
      value: (r) => r.source ?? "",
      cell: (r) => (r.source ? <span className="block max-w-[14rem] truncate" title={r.source}>{r.source}</span> : dash),
    },
    {
      id: "batch",
      header: "Import batch",
      value: (r) => batchLabel(r.upload_batch_id, opts.batches),
      cell: (r) => <span className={cn(!r.upload_batch_id && "text-muted")}>{batchLabel(r.upload_batch_id, opts.batches)}</span>,
    },
    {
      id: "edit",
      header: "",
      hideable: false,
      width: "3rem",
      value: () => null,
      exportValue: () => null,
      cell: (r) => (
        <button
          type="button"
          aria-label={`Edit ${[r.site?.name, r.category?.category_name, r.year].filter(Boolean).join(", ")}`}
          onClick={(e) => {
            e.stopPropagation();
            opts.onEdit(r);
          }}
          className={cn("rounded-control p-1 text-muted hover:bg-tint hover:text-ink", focusRing)}
        >
          <Pencil aria-hidden className="size-4" />
        </button>
      ),
    },
  ];
}
