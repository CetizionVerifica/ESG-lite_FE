import { MoreHorizontal } from "lucide-react";
import { Button, Menu, type MenuEntry } from "../../../ui";
import type { LedgerRow } from "../logic";

export type RowActions = {
  open: (row: LedgerRow) => void;
  approve: (row: LedgerRow) => void;
  reject: (row: LedgerRow) => void;
  remove: (row: LedgerRow) => void;
};

export function RowMenu({ row, pending, actions }: { row: LedgerRow; pending: boolean; actions: RowActions }) {
  const items: MenuEntry[] = [
    { label: "Open", onSelect: () => actions.open(row) },
    ...(pending
      ? [
          { label: "Approve", onSelect: () => actions.approve(row) },
          { label: "Reject…", onSelect: () => actions.reject(row) },
        ]
      : []),
    { kind: "separator" },
    { label: "Delete…", danger: true, onSelect: () => actions.remove(row) },
  ];
  return (
    // The row opens the drawer on click and Enter; the menu must not.
    <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <Menu
        label={`Actions for entry ${row.pk_id}`}
        items={items}
        trigger={(t) => (
          <Button {...t} size="sm" variant="ghost" aria-label={`Actions for entry ${row.pk_id}`}>
            <MoreHorizontal aria-hidden className="size-4" />
          </Button>
        )}
      />
    </span>
  );
}
