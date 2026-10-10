import { ChevronRight } from "lucide-react";
import { type Column, cn, focusRing, formatMonth } from "../../../ui";
import type { Product } from "../logic";

/** Table columns. Count and period show "—" on a backend without them. */
export function productColumns(opts: { onOpen: (row: Product) => void }): Column<Product>[] {
  return [
    {
      id: "product",
      header: "Product",
      hideable: false,
      sortable: true,
      value: (r) => r.name,
      cell: (r) => <span className="block truncate font-medium text-ink">{r.name}</span>,
    },
    {
      id: "site",
      header: "Site",
      sortable: true,
      value: (r) => r.site?.name ?? "",
      exportValue: (r) => [r.site?.name, r.site?.company?.name].filter(Boolean).join(" · "),
      cell: (r) =>
        r.site ? (
          <span className="block min-w-0">
            <span className="block truncate text-ink">{r.site.name}</span>
            {r.site.company?.name && <span className="block truncate text-xs text-muted">{r.site.company.name}</span>}
          </span>
        ) : (
          <span className="text-muted">No site</span>
        ),
    },
    { id: "unit", header: "Default unit", sortable: true, width: "8rem", value: (r) => r.unit ?? "" },
    {
      id: "description",
      header: "Description",
      value: (r) => r.description ?? "",
      cell: (r) => (r.description ? <span className="line-clamp-2 text-sm text-muted">{r.description}</span> : <span className="text-muted">—</span>),
    },
    {
      id: "records",
      header: "Production records",
      numeric: true,
      sortable: true,
      width: "9rem",
      value: (r) => r.production_count ?? null,
    },
    {
      id: "last",
      header: "Last period",
      sortable: true,
      width: "8rem",
      value: (r) => (r.last_period_end ? formatMonth(r.last_period_end) : null),
      sortValue: (r) => r.last_period_end ?? "",
      cell: (r) => (r.last_period_end ? <span className="font-num">{formatMonth(r.last_period_end)}</span> : <span className="text-muted">None yet</span>),
    },
    {
      id: "open",
      header: "",
      hideable: false,
      width: "3rem",
      value: () => null,
      exportValue: () => null,
      cell: (r) => (
        <button
          type="button"
          aria-label={`Edit ${r.name}`}
          onClick={(e) => {
            e.stopPropagation();
            opts.onOpen(r);
          }}
          className={cn("rounded-control p-1 text-muted hover:bg-tint hover:text-ink", focusRing)}
        >
          <ChevronRight aria-hidden className="size-4" />
        </button>
      ),
    },
  ];
}
