import { ChevronRight } from "lucide-react";
import type { Brand } from "../../../services/brandService";
import { Link } from "react-router-dom";
import { type Column, cn, focusRing } from "../../../ui";
import type { ClientRow } from "../logic";
import { ClientLogo, StatusBadge, ThemeSwatch } from "./bits";

/** Table columns. Sites / Users show "—" until (or unless) their data loads. */
export function clientColumns(opts: { sitesReady: boolean; usersReady: boolean; brands: Map<number, Brand> }): Column<ClientRow>[] {
  const dash = <span className="text-muted">—</span>;
  return [
    {
      id: "client",
      header: "Client",
      hideable: false,
      sortable: true,
      value: (r) => r.name,
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <ClientLogo name={r.name} url={opts.brands.get(r.company_id)?.logoUrl} />
          <span className="min-w-0">
            <span className="block truncate font-medium text-ink">{r.name}</span>
            <span className="block truncate text-xs text-muted">{r.contact_person || r.email || ""}</span>
          </span>
        </span>
      ),
    },
    { id: "industry", header: "Industry", sortable: true, value: (r) => r.industry ?? "" },
    { id: "region", header: "Region", sortable: true, value: (r) => r.region ?? "" },
    {
      id: "sites",
      header: "Sites",
      numeric: true,
      decimals: 0,
      sortable: true,
      value: (r) => (opts.sitesReady ? r.sites.length : null),
      cell: (r) => (opts.sitesReady ? r.sites.length : dash),
    },
    {
      id: "users",
      header: "Users",
      numeric: true,
      decimals: 0,
      sortable: true,
      value: (r) => (opts.usersReady && opts.sitesReady ? r.users.length : null),
      cell: (r) => (opts.usersReady && opts.sitesReady ? r.users.length : dash),
    },
    { id: "status", header: "Status", sortable: true, value: (r) => (r.active ? "Active" : "Inactive"), cell: (r) => <StatusBadge active={r.active} /> },
    {
      id: "theme",
      header: "Theme",
      value: (r) => (opts.brands.get(r.company_id) ? "Custom" : "PlanetPulse"),
      cell: (r) => <ThemeSwatch brand={opts.brands.get(r.company_id)} />,
    },
    {
      id: "open",
      header: "",
      hideable: false,
      value: () => null,
      exportValue: () => null,
      width: "3rem",
      cell: (r) => (
        <Link
          to={`/clients/${r.company_id}`}
          aria-label={`Open ${r.name}`}
          onClick={(e) => e.stopPropagation()}
          className={cn("inline-flex rounded-control p-1 text-muted hover:bg-tint hover:text-ink", focusRing)}
        >
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      ),
    },
  ];
}
