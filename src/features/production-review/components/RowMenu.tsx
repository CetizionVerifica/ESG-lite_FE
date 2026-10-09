import { MoreHorizontal } from "lucide-react";
import { Button, Menu, type MenuEntry } from "../../../ui";
import type { ProductionRow } from "../logic";

export type RowActions = {
  open: (row: ProductionRow) => void;
  approve: (row: ProductionRow) => void;
  reject: (row: ProductionRow) => void;
  edit: (row: ProductionRow) => void;
};

export function RowMenu({ row, pending, actions }: { row: ProductionRow; pending: boolean; actions: RowActions }) {
  const items: MenuEntry[] = [
    { label: "Open", onSelect: () => actions.open(row) },
    ...(pending
      ? [
          { label: "Approve", onSelect: () => actions.approve(row) },
          { label: "Reject…", onSelect: () => actions.reject(row) },
        ]
      : []),
    { label: "Edit", onSelect: () => actions.edit(row) },
  ];
  const label = `Actions for ${row.product?.name ?? "record"} ${row.production_id}`;
  return (
    // The row opens the drawer on click and Enter; the menu must not.
    <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <Menu
        label={label}
        items={items}
        trigger={(t) => (
          <Button {...t} size="sm" variant="ghost" aria-label={label}>
            <MoreHorizontal aria-hidden className="size-4" />
          </Button>
        )}
      />
    </span>
  );
}
