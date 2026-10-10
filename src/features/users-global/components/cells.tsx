import { MoreHorizontal } from "lucide-react";
import { Button, Menu, Tooltip } from "../../../ui";
import type { UserRow } from "../logic";

export type RowActions = {
  edit: (row: UserRow) => void;
  reset: (row: UserRow) => void;
  remove: (row: UserRow) => void;
};

/** First item, then "+N" with the rest in a tooltip. */
export function Overflow({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <span className="text-muted">{empty}</span>;
  const rest = items.slice(1);
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="truncate">{items[0]}</span>
      {rest.length > 0 && (
        <Tooltip content={rest.join(", ")}>
          <span tabIndex={0} className="shrink-0 rounded-chip bg-tint px-1.5 text-xs font-num text-muted" aria-label={`and ${rest.join(", ")}`}>
            +{rest.length}
          </span>
        </Tooltip>
      )}
    </span>
  );
}

export function RowMenu({ row, actions }: { row: UserRow; actions: RowActions }) {
  const label = `Actions for ${row.displayName}`;
  return (
    // The row opens the drawer on click and Enter; the menu must not.
    <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <Menu
        label={label}
        items={[
          { label: "Edit", onSelect: () => actions.edit(row) },
          { label: "Send reset link", onSelect: () => actions.reset(row) },
          { kind: "separator" },
          { label: "Remove…", danger: true, onSelect: () => actions.remove(row) },
        ]}
        trigger={(t) => (
          <Button {...t} size="sm" variant="ghost" aria-label={label}>
            <MoreHorizontal aria-hidden className="size-4" />
          </Button>
        )}
      />
    </span>
  );
}
