import type { ReactNode } from "react";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Callout, cn, formatDate, formatNumber, panel } from "../../../ui";
import type { BillMeta } from "../logic/bill";
import type { ModalRow } from "../types";
import { BillPreview } from "./BillPreview";

type Props = {
  bill: BillMeta;
  rows: ModalRow[];
  /** The bill's date outside the page's period, in words. */
  dateNote: string | null;
  renderRow: (row: ModalRow, index: number) => ReactNode;
  onAddItem: () => void;
  onConfirm: () => void;
  onRemove: () => void;
};

/** One bill: the file on the left, what the AI read from it on the right, checked by the user before use. */
export function BillReview({ bill, rows, dateNote, renderRow, onAddItem, onConfirm, onRemove }: Props) {
  const facts = [
    bill.number && `No. ${bill.number}`,
    bill.date && formatDate(bill.date),
    bill.amount != null && `${formatNumber(bill.amount, 2)}${bill.currency ? ` ${bill.currency}` : ""}`,
  ].filter(Boolean);
  const title = bill.vendor || bill.fileName;

  return (
    <section aria-label={`Bill ${title}`} className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <BillPreview file={bill.url ? { name: bill.fileName, url: bill.url, type: bill.fileType } : null} />

      <div className="space-y-3">
        <header className={cn(panel, "flex flex-wrap items-start justify-between gap-3 p-4")}>
          <div className="min-w-0">
            <h3 className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
              {title}
              {bill.confirmed ? (
                <Badge tone="good" className="gap-0.5">
                  <CheckCircle2 aria-hidden className="size-3" /> Checked
                </Badge>
              ) : (
                <Badge tone="warn">Check before use</Badge>
              )}
            </h3>
            <p className="mt-0.5 text-xs text-muted">{facts.length ? facts.join(" · ") : bill.fileName}</p>
          </div>
          <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" />} onClick={onRemove}>
            Remove bill
          </Button>
        </header>

        {bill.warnings.length > 0 && (
          <Callout tone="warn" title="The AI flagged this bill">
            <ul className="list-disc space-y-0.5 pl-4">
              {bill.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </Callout>
        )}
        {dateNote && <Callout tone="info">{dateNote}</Callout>}

        {rows.map((row, i) => renderRow(row, i))}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button size="sm" variant="secondary" icon={<Plus className="size-4" />} onClick={onAddItem}>
            Add item from this bill
          </Button>
          {!bill.confirmed && (
            <Button variant="primary" onClick={onConfirm}>
              Use {rows.length === 1 ? "this row" : `these ${rows.length} rows`}
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
