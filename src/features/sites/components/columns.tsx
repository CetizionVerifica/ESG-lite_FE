import { ChevronRight } from "lucide-react";
import { Badge, type Column, cn, focusRing } from "../../../ui";
import { SCOPE_KEYS, SCOPE_LABEL, SCOPE_SHORT, type SiteRow, coverage, scopeCounts } from "../logic";

/** Table columns. People and coverage cells show "—" until (or unless) their data loads. */
export function siteColumns(opts: { peopleReady: boolean; configsReady: boolean; onOpen: (row: SiteRow) => void }): Column<SiteRow>[] {
  const dash = <span className="text-muted">—</span>;
  return [
    {
      id: "site",
      header: "Site",
      hideable: false,
      sortable: true,
      value: (r) => r.name,
      cell: (r) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium text-ink">{r.name}</span>
          <span className="block truncate text-xs text-muted">{r.address}</span>
        </span>
      ),
    },
    { id: "client", header: "Client", sortable: true, value: (r) => r.company?.name ?? "" },
    { id: "country", header: "Country", sortable: true, value: (r) => r.country?.name ?? "" },
    {
      id: "categories",
      header: "Categories",
      sortable: true,
      value: (r) => {
        const c = scopeCounts(r.categories ?? []);
        return SCOPE_KEYS.filter((k) => c[k]).map((k) => `${SCOPE_SHORT[k]} ${c[k]}`).join(" · ");
      },
      sortValue: (r) => r.categories?.length ?? 0,
      cell: (r) => {
        const c = scopeCounts(r.categories ?? []);
        const shown = SCOPE_KEYS.filter((k) => c[k]);
        if (!shown.length) return <span className="text-muted">None</span>;
        return (
          <span className="flex flex-wrap gap-1">
            {shown.map((k) => (
              <Badge key={k} tone={k === "other" ? "neutral" : "brand"}>
                <span className="sr-only">{SCOPE_LABEL[k]}: </span>
                <span aria-hidden>{SCOPE_SHORT[k]}</span>
                <span className="ml-1 font-num">{c[k]}</span>
              </Badge>
            ))}
          </span>
        );
      },
    },
    {
      id: "users",
      header: "Users",
      numeric: true,
      sortable: true,
      width: "6rem",
      value: (r) => (opts.peopleReady ? r.users.length : null),
      cell: opts.peopleReady ? undefined : () => dash,
    },
    {
      id: "managers",
      header: "Managers",
      numeric: true,
      sortable: true,
      width: "6rem",
      value: (r) => (opts.peopleReady ? r.managers.length : null),
      cell: opts.peopleReady ? undefined : () => dash,
    },
    {
      id: "coverage",
      header: "Config coverage",
      sortable: true,
      width: "10rem",
      value: (r) => {
        if (!opts.configsReady) return null;
        const c = coverage(r);
        return `${c.done}/${c.total}`;
      },
      sortValue: (r) => {
        const c = coverage(r);
        return opts.configsReady && c.total ? c.done / c.total : -1;
      },
      cell: (r) => {
        if (!opts.configsReady) return dash;
        const c = coverage(r);
        if (!c.total) return <span className="text-muted">No categories</span>;
        const full = c.done === c.total;
        return (
          <span className="flex items-center gap-2">
            <span className={cn("font-num text-sm", full ? "text-good" : "text-ink")}>
              {c.done}/{c.total}
            </span>
            <span
              role="meter"
              aria-label="Categories with a column config"
              aria-valuemin={0}
              aria-valuemax={c.total}
              aria-valuenow={c.done}
              className="h-1.5 w-12 overflow-hidden rounded-full bg-line"
            >
              <span className={cn("block h-full rounded-full", full ? "bg-good" : "bg-warn")} style={{ width: `${Math.round((c.done / c.total) * 100)}%` }} />
            </span>
          </span>
        );
      },
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
