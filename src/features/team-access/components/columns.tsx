import type { ManagerUser } from "../../../services/managerService";
import { Avatar, Badge, Button, type Column } from "../../../ui";
import { type MonthStatus, accessCount, displayName } from "../logic";

/** Table columns. `siteIds` narrows the Sites and Categories cells to the site filter. */
export function teamColumns(opts: {
  siteIds: number[];
  month: Map<number, MonthStatus> | undefined;
  onManage: (u: ManagerUser) => void;
}): Column<ManagerUser>[] {
  const sitesOf = (u: ManagerUser) => (opts.siteIds.length ? u.sites.filter((s) => opts.siteIds.includes(s.site_id)) : u.sites);
  return [
    {
      id: "person",
      header: "Person",
      hideable: false,
      sortable: true,
      value: displayName,
      exportValue: (u) => `${displayName(u)} <${u.email}>`,
      cell: (u) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar size="sm" name={displayName(u)} />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="truncate font-medium text-ink">{displayName(u)}</span>
              {u.role && u.role !== "User" && <Badge>{u.role}</Badge>}
            </span>
            <span className="block truncate text-xs text-muted">{u.email}</span>
          </span>
        </span>
      ),
    },
    {
      id: "sites",
      header: "Sites",
      sortable: true,
      value: (u) => sitesOf(u).map((s) => s.site_name).join(", "),
    },
    {
      id: "categories",
      header: "Categories",
      sortable: true,
      width: "10rem",
      value: (u) => {
        const c = accessCount(u, opts.siteIds);
        return `${c.enabled} of ${c.total}`;
      },
      sortValue: (u) => {
        const c = accessCount(u, opts.siteIds);
        return c.total ? c.enabled / c.total : -1;
      },
      cell: (u) => {
        const c = accessCount(u, opts.siteIds);
        if (c.total === 0) return <span className="text-muted">None set up</span>;
        const pct = Math.round((c.enabled / c.total) * 100);
        return (
          <span className="flex items-center gap-2">
            <span className="font-num text-sm whitespace-nowrap text-ink">
              {c.enabled} of {c.total}
            </span>
            <span
              role="meter"
              aria-label="Categories enabled"
              aria-valuemin={0}
              aria-valuemax={c.total}
              aria-valuenow={c.enabled}
              className="h-1.5 w-16 overflow-hidden rounded-full bg-line"
            >
              <span className={`block h-full rounded-full ${c.enabled === c.total ? "bg-good" : "bg-warn"}`} style={{ width: `${pct}%` }} />
            </span>
          </span>
        );
      },
    },
    {
      id: "month",
      header: "This month",
      sortable: true,
      value: (u) => {
        const m = opts.month?.get(u.user_id);
        return m ? (m.status === "submitted" ? "Submitted" : "Missing") : "";
      },
      cell: (u) => {
        const m = opts.month?.get(u.user_id);
        if (!m) return <span className="text-muted">—</span>;
        return m.status === "submitted" ? (
          <span className="text-sm text-good">
            Submitted{" "}
            <span className="text-xs text-muted">
              · <span className="font-num">{m.count}</span> {m.count === 1 ? "entry" : "entries"}
            </span>
          </span>
        ) : (
          <span className="text-sm font-medium text-bad">Missing</span>
        );
      },
    },
    {
      id: "manage",
      header: "",
      hideable: false,
      value: () => null,
      exportValue: () => null,
      cell: (u) => (
        <Button
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            opts.onManage(u);
          }}
          aria-label={`Manage access for ${displayName(u)}`}
        >
          Manage
        </Button>
      ),
    },
  ];
}
