import { MoreHorizontal } from "lucide-react";
import { Avatar, Badge, Button, type Column, Menu } from "../../../ui";
import { type CompanyUser, displayName, sitesOf } from "../logic";

export type RowActions = {
  edit: (u: CompanyUser) => void;
  resetLink: (u: CompanyUser) => void;
  remove: (u: CompanyUser) => void;
};

export function peopleColumns(actions: RowActions, canRemove: boolean): Column<CompanyUser>[] {
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
            <span className="block truncate font-medium text-ink">{displayName(u)}</span>
            <span className="block truncate text-xs text-muted">{u.email}</span>
          </span>
        </span>
      ),
    },
    {
      id: "role",
      header: "Role",
      sortable: true,
      width: "8rem",
      value: (u) => u.role,
      cell: (u) => <Badge tone={u.role === "Manager" ? "brand" : "neutral"}>{u.role}</Badge>,
    },
    {
      id: "sites",
      header: "Sites",
      sortable: true,
      value: (u) => sitesOf(u).map((s) => s.name).join(", "),
      cell: (u) => {
        const names = sitesOf(u).map((s) => s.name);
        return names.length ? <span className="text-ink">{names.join(", ")}</span> : <span className="text-warn">No site</span>;
      },
    },
    {
      id: "actions",
      header: "",
      hideable: false,
      width: "3rem",
      value: () => null,
      exportValue: () => null,
      cell: (u) => {
        const label = `Actions for ${displayName(u)}`;
        return (
          // The row opens Edit on click and Enter; the menu must not.
          <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
            <Menu
              label={label}
              items={[
                { label: "Edit", onSelect: () => actions.edit(u) },
                { label: "Send reset link", onSelect: () => actions.resetLink(u) },
                ...(canRemove ? [{ label: "Remove…", danger: true, onSelect: () => actions.remove(u) }] : []),
              ]}
              trigger={(t) => (
                <Button {...t} size="sm" variant="ghost" aria-label={label}>
                  <MoreHorizontal aria-hidden className="size-4" />
                </Button>
              )}
            />
          </span>
        );
      },
    },
  ];
}
