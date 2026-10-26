import { Pencil } from "lucide-react";
import { Badge, type Column, cn, focusRing } from "../../../ui";
import { factorTypeLabel } from "../../../lib/scope3/factor";
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
      cell: (r) =>
        !r.emission_category_name ? (
          dash
        ) : r.includes_wtt ? (
          // S3-7: a life-cycle factor that already sums in WTT, which Category 3 may count again. Same width as the plain name.
          <span className="flex max-w-[18rem] items-center gap-1.5">
            <span className="min-w-0 truncate" title={r.emission_category_name}>
              {r.emission_category_name}
            </span>
            <Badge tone="warn" className="shrink-0">WTT included</Badge>
          </span>
        ) : (
          <span className="block max-w-[18rem] truncate" title={r.emission_category_name}>{r.emission_category_name}</span>
        ),
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
    // S3-2 metadata: hidden by default (also for prefs saved before S3-2), offered in the column picker.
    { id: "type", header: "Type", defaultHidden: true, addedLater: true, value: (r) => (r.factor_type ? factorTypeLabel(r.factor_type) : ""), cell: (r) => (r.factor_type ? factorTypeLabel(r.factor_type) : dash) },
    { id: "gwp", header: "GWP", width: "5rem", defaultHidden: true, addedLater: true, value: (r) => r.gwp_set ?? "", cell: (r) => (r.gwp_set ? r.gwp_set : dash) },
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

const text = (v: string | null | undefined) => v ?? "";

/**
 * Columns of the factors export: every table column whatever the column picker
 * shows (Type and GWP always in), then the rest of the S3-2 metadata.
 */
export function factorExportColumns(table: Column<Factor>[]): Column<Factor>[] {
  const meta: Column<Factor>[] = [
    // Same header the simple-sheet import reads, so an exported sheet keeps T&D-loss pairings.
    { id: "global_category_name", header: "Global name", value: (r) => (r.global_category_name && r.global_category_name !== r.emission_category_name ? r.global_category_name : "") },
    { id: "geography", header: "Geography", value: (r) => text(r.geography) },
    { id: "dataset", header: "Dataset", value: (r) => text(r.dataset) },
    { id: "dataset_version", header: "Dataset version", value: (r) => text(r.dataset_version) },
    { id: "co2_kg", header: "CO₂ (kg)", numeric: true, value: (r) => factorNumber(r.co2_kg) },
    { id: "ch4_kg", header: "CH₄ (kg)", numeric: true, value: (r) => factorNumber(r.ch4_kg) },
    { id: "n2o_kg", header: "N₂O (kg)", numeric: true, value: (r) => factorNumber(r.n2o_kg) },
    { id: "other_kgco2e", header: "Other (kgCO₂e)", numeric: true, value: (r) => factorNumber(r.other_kgco2e) },
    { id: "biogenic_co2_kg", header: "Biogenic CO₂ (kg)", numeric: true, value: (r) => factorNumber(r.biogenic_co2_kg) },
    { id: "includes_wtt", header: "Includes WTT", value: (r) => (r.includes_wtt === true ? "Yes" : r.includes_wtt === false ? "No" : "") },
  ];
  return [...table.filter((c) => c.id !== "edit"), ...meta];
}
