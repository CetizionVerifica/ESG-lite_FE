import { Avatar, Badge, type BadgeTone, type Column, timeAgo } from "../../../ui";
import { type UserRow, lastActive } from "../logic";
import { Overflow, type RowActions, RowMenu } from "./cells";

const ROLE_TONE: Record<string, BadgeTone> = { Superadmin: "brand", Admin: "brand", Manager: "neutral", User: "neutral" };

/** Table columns. Categories only mean something for data-entry users and managers. */
export function userColumns(actions: RowActions): Column<UserRow>[] {
  return [
    {
      id: "person",
      header: "Person",
      hideable: false,
      sortable: true,
      value: (r) => r.displayName,
      exportValue: (r) => `${r.displayName} <${r.email}>`,
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar size="sm" name={r.displayName} />
          <span className="min-w-0">
            <span className="block truncate font-medium text-ink">{r.displayName}</span>
            <span className="block truncate text-xs text-muted">{r.email}</span>
          </span>
        </span>
      ),
    },
    {
      id: "client",
      header: "Client",
      sortable: true,
      value: (r) => r.clients.map((c) => c.name).join(", "),
      cell: (r) => <Overflow items={r.clients.map((c) => c.name)} empty={r.role === "Superadmin" ? "All clients" : "None"} />,
    },
    {
      id: "role",
      header: "Role",
      sortable: true,
      width: "8rem",
      value: (r) => r.role,
      cell: (r) => <Badge tone={ROLE_TONE[r.role] ?? "neutral"}>{r.role}</Badge>,
    },
    {
      id: "sites",
      header: "Sites",
      sortable: true,
      value: (r) => r.siteList.map((s) => s.name).join(", "),
      sortValue: (r) => r.siteList.length,
      cell: (r) => <Overflow items={r.siteList.map((s) => s.name)} empty={r.role === "Superadmin" ? "All sites" : "None"} />,
    },
    {
      id: "categories",
      header: "Categories",
      numeric: true,
      sortable: true,
      width: "7rem",
      value: (r) => (r.role === "User" || r.role === "Manager" ? (r.categories?.length ?? null) : null),
      cell: (r) =>
        r.role === "User" || r.role === "Manager" ? (
          r.categories ? (
            <span className="font-num">{r.categories.length}</span>
          ) : (
            <span className="text-muted">—</span>
          )
        ) : (
          <span className="text-muted">All</span>
        ),
    },
    {
      id: "last-active",
      header: "Last active",
      sortable: true,
      width: "8rem",
      value: (r) => {
        const v = lastActive(r);
        return v === null ? null : v === "never" ? "Never" : v;
      },
      sortValue: (r) => (r.last_login_at ? new Date(r.last_login_at).getTime() : 0),
      cell: (r) => {
        const v = lastActive(r);
        if (v === null) return <span className="text-muted">—</span>;
        if (v === "never") return <span className="text-muted">Never</span>;
        return <span title={new Date(v).toLocaleString()}>{timeAgo(v)}</span>;
      },
    },
    {
      id: "actions",
      header: "",
      hideable: false,
      width: "3.5rem",
      value: () => null,
      exportValue: () => null,
      cell: (r) => <RowMenu row={r} actions={actions} />,
    },
  ];
}
