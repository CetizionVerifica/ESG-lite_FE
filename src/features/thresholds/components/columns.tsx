import { Badge, Button, type Column, formatDate } from "../../../ui";
import { DEFAULT_THRESHOLD, type ThresholdRow, effectiveValue, formatPct } from "../logic";

/** Client | Threshold % | Updated | Edit. Clients on the default show "Default 5%" and a Set action. */
export function thresholdColumns(opts: { onOpen: (row: ThresholdRow) => void }): Column<ThresholdRow>[] {
  return [
    {
      id: "client",
      header: "Client",
      hideable: false,
      sortable: true,
      value: (r) => r.name,
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium text-ink">{r.name}</span>
          {!r.active && <Badge tone="neutral">Inactive</Badge>}
        </span>
      ),
    },
    {
      id: "threshold",
      header: "Threshold %",
      numeric: true,
      sortable: true,
      width: "9rem",
      value: (r) => effectiveValue(r),
      exportValue: (r) => r.threshold?.value ?? null,
      cell: (r) =>
        r.threshold ? (
          <span className="font-num text-ink">{formatPct(r.threshold.value)}</span>
        ) : (
          <span className="text-muted">Default {DEFAULT_THRESHOLD}%</span>
        ),
    },
    {
      id: "updated",
      header: "Updated",
      sortable: true,
      width: "9rem",
      value: (r) => r.threshold?.updated_at ?? null,
      cell: (r) => (r.threshold?.updated_at ? formatDate(r.threshold.updated_at) : <span className="text-muted">—</span>),
      exportValue: (r) => (r.threshold?.updated_at ? formatDate(r.threshold.updated_at) : null),
    },
    {
      id: "edit",
      header: "",
      hideable: false,
      width: "5rem",
      value: () => null,
      exportValue: () => null,
      cell: (r) => (
        <Button
          size="sm"
          variant="ghost"
          aria-label={`${r.threshold ? "Edit" : "Set"} threshold for ${r.name}`}
          onClick={(e) => {
            e.stopPropagation();
            opts.onOpen(r);
          }}
        >
          {r.threshold ? "Edit" : "Set"}
        </Button>
      ),
    },
  ];
}
