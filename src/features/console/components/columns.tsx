import { ChevronRight } from "lucide-react";
import { Avatar, Badge, type Column } from "../../../ui";
import { type ClientRow, setupPercent } from "../logic";
import { SetupBar, ThemeSwatch } from "./cells";

/** `month`: the summary loaded, so the "This month" column has data. */
export function clientColumns(opts: { month: boolean } = { month: false }): Column<ClientRow>[] {
  const month: Column<ClientRow>[] = opts.month
    ? [
        {
          id: "month",
          header: "This month",
          sortable: true,
          width: "9rem",
          value: (r) => (r.month ? `${r.month.entries} entries, ${r.month.pending} pending` : ""),
          sortValue: (r) => r.month?.entries ?? -1,
          cell: (r) =>
            r.month ? (
              <span className="flex flex-col leading-tight">
                <span className="font-num text-ink">{r.month.entries}</span>
                <span className="text-xs text-muted">{r.month.pending ? `${r.month.pending} pending` : "none pending"}</span>
              </span>
            ) : (
              <span className="text-muted">—</span>
            ),
        },
      ]
    : [];
  return [
    {
      id: "client",
      header: "Client",
      hideable: false,
      sortable: true,
      value: (r) => r.name,
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar size="sm" name={r.name} src={r.brand?.logoUrl} />
          <span className="truncate font-medium text-ink">{r.name}</span>
          {!r.active && <Badge>Inactive</Badge>}
        </span>
      ),
    },
    { id: "sites", header: "Sites", numeric: true, sortable: true, width: "6rem", value: (r) => r.sites },
    { id: "users", header: "Users", numeric: true, sortable: true, width: "6rem", value: (r) => r.users },
    {
      id: "setup",
      header: "Setup",
      sortable: true,
      width: "10rem",
      value: (r) => (setupPercent(r) === null ? "" : `${setupPercent(r)}%`),
      // Inactive clients sink to the bottom of the default (least complete first) sort.
      sortValue: (r) => (r.active ? (r.completeness ?? -1) : 2),
      cell: (r) => <SetupBar row={r} />,
    },
    ...month,
    {
      id: "theme",
      header: "Theme",
      width: "6rem",
      value: (r) => (r.brand?.updatedAt ? `${r.brand.primary} ${r.brand.accent}` : "Default"),
      cell: (r) => <ThemeSwatch row={r} />,
    },
    {
      id: "open",
      header: "",
      hideable: false,
      width: "2.5rem",
      value: () => "",
      exportValue: () => null,
      cell: () => <ChevronRight aria-hidden className="size-4 text-muted" />,
    },
  ];
}
