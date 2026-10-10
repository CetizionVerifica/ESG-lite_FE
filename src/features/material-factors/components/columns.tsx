import { Badge, type Column } from "../../../ui";
import { type MaterialFactor, LICENCE_LABEL, formatFactor, geographyLabel, groupLabel, sourceLabel } from "../logic";
import { LicensedValue } from "./LicensedValue";

const licenceTone = { open: "neutral", supplier: "info", ecoinvent: "warn" } as const;

/** DataTable columns: Name | Group | Geography | Value | Unit | GWP set | Source + year | Licence | Used by. */
export function factorColumns(opts: { usageReady: boolean; owner?: (f: MaterialFactor) => string }): Column<MaterialFactor>[] {
  const cols: Column<MaterialFactor>[] = [
    {
      id: "name",
      header: "Name",
      hideable: false,
      sortable: true,
      value: (f) => f.name,
      cell: (f) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium text-ink">{f.name}</span>
          {(f.recycled_variant || opts.owner) && (
            <span className="block truncate text-xs text-muted">
              {[f.recycled_variant ? "Recycled (cut-off)" : null, opts.owner?.(f)].filter(Boolean).join(" · ")}
            </span>
          )}
        </span>
      ),
    },
    { id: "group", header: "Group", sortable: true, value: (f) => groupLabel(f.material_group) },
    { id: "geography", header: "Geography", sortable: true, value: (f) => geographyLabel(f.geography) },
    {
      id: "value",
      header: "Value",
      numeric: true,
      sortable: true,
      value: (f) => f.value_kgco2e,
      exportValue: (f) => (f.value_hidden ? "Licensed" : f.value_kgco2e),
      cell: (f) => (f.value_hidden ? <LicensedValue /> : formatFactor(f.value_kgco2e)),
    },
    { id: "unit", header: "Unit", sortable: true, width: "8rem", value: (f) => `kgCO₂e/${f.unit}` },
    { id: "gwp", header: "GWP set", sortable: true, width: "6rem", value: (f) => f.gwp_set },
    { id: "source", header: "Source", sortable: true, value: (f) => sourceLabel(f) || "—" },
    {
      id: "licence",
      header: "Licence",
      sortable: true,
      value: (f) => LICENCE_LABEL[f.licence],
      cell: (f) => <Badge tone={licenceTone[f.licence]}>{LICENCE_LABEL[f.licence]}</Badge>,
    },
    {
      id: "used",
      header: "Used by",
      numeric: true,
      sortable: true,
      width: "6rem",
      value: (f) => (opts.usageReady ? (f.used_by ?? 0) : null),
      cell: opts.usageReady ? undefined : () => <span className="text-muted">—</span>,
    },
  ];
  return cols;
}
