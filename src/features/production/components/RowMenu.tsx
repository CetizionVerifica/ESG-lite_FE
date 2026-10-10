import { MoreHorizontal } from "lucide-react";
import { Button, Menu, type MenuEntry } from "../../../ui";
import { type ProductionRow, canChange, periodText } from "../logic";

export type RowActions = {
  open: (row: ProductionRow) => void;
  edit: (row: ProductionRow) => void;
  remove: (row: ProductionRow) => void;
};

export function RowMenu({ row, actions }: { row: ProductionRow; actions: RowActions }) {
  const items: MenuEntry[] = [
    ...(canChange(row)
      ? [
          { label: row.status === "rejected" ? "Fix and resubmit" : "Edit", onSelect: () => actions.edit(row) },
          { label: "Delete…", danger: true, onSelect: () => actions.remove(row) },
        ]
      : []),
    { label: "History", onSelect: () => actions.open(row) },
  ];
  const label = `Actions for ${row.product?.name ?? "record"}, ${periodText(row.start_date, row.end_date)}`;
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
