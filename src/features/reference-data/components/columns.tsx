import { ChevronRight } from "lucide-react";
import { type Column, cn, focusRing } from "../../../ui";

export const dash = <span className="text-muted">—</span>;

/** Right-hand chevron that opens the row's drawer. */
export function openColumn<T>(label: (row: T) => string, onOpen: (row: T) => void): Column<T> {
  return {
    id: "open",
    header: "",
    hideable: false,
    width: "3rem",
    value: () => null,
    exportValue: () => null,
    cell: (r) => (
      <button
        type="button"
        aria-label={`Edit ${label(r)}`}
        onClick={(e) => {
          e.stopPropagation();
          onOpen(r);
        }}
        className={cn("rounded-control p-1 text-muted hover:bg-tint hover:text-ink", focusRing)}
      >
        <ChevronRight aria-hidden className="size-4" />
      </button>
    ),
  };
}
