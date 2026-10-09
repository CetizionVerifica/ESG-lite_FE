import { useState, type ReactNode } from "react";
import { FolderOpen, Sparkles } from "lucide-react";
import { Button, Callout, FileDrop, type FileDropItem } from "../../../ui";
import { readBill, rereadBill, type EntrySetup, type ExtractionResponse, type Invoice } from "../api";
import type { RowsDispatch } from "../hooks/useEntryRows";
import { billOutsidePeriod, billGroups, billRowsFrom, type BillMeta, type BillSource } from "../logic/bill";
import type { EntryPeriod } from "../logic/entry";
import { newRow, type FormModel } from "../logic/form";
import type { ModalRow } from "../types";
import { BillReview } from "../components/BillReview";
import { MyBillsDrawer } from "../components/MyBillsDrawer";

type Props = {
  rows: ModalRow[];
  dispatch: RowsDispatch;
  model: FormModel;
  setup: EntrySetup;
  siteId: number;
  categoryId: number;
  userId: number | null;
  period: EntryPeriod;
  renderRow: (row: ModalRow, index: number) => ReactNode;
};

const ACCEPT = ["application/pdf", "image/*"];
const MAX_SIZE = 10 * 1024 * 1024;
let uploads = 0;

/** Step 2 from bills: the AI reads each file into rows the user checks before using them. */
export function FromBill(p: Props) {
  const [items, setItems] = useState<FileDropItem[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [rereading, setRereading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ctx = { siteId: p.siteId, categoryId: p.categoryId, userId: p.userId, units: p.setup.units };
  const groups = billGroups(p.rows);

  const addRows = (response: ExtractionResponse, source: BillSource): boolean => {
    const rows = billRowsFrom(p.model, response, { source, units: p.setup.units, factors: p.setup.factors, firstId: 1 });
    if (rows.length > 0) p.dispatch({ type: "append", rows });
    return rows.length > 0;
  };

  const patch = (id: string, change: Partial<FileDropItem>) => setItems((list) => list.map((i) => (i.id === id ? { ...i, ...change } : i)));

  const read = async (files: File[]) => {
    const queued = files.map((file) => ({ id: `bill-${Date.now()}-${++uploads}`, file, status: "queued" as const }));
    setItems((list) => [...list, ...queued]);
    // One at a time: each read runs OCR and the model on the AI service.
    for (const item of queued) {
      patch(item.id, { status: "uploading" });
      try {
        const response = await readBill(item.file, ctx);
        const found = addRows(response, {
          invoiceId: response.invoice_id ?? null,
          uploadKey: item.id,
          fileName: item.file.name,
          fileType: item.file.type,
          url: response.cloudinary_url ?? null,
        });
        if (found) setItems((list) => list.filter((i) => i.id !== item.id));
        else patch(item.id, { status: "error", error: "No entries were found on this bill." });
      } catch (err) {
        patch(item.id, { status: "error", error: (err as Error).message });
      }
    }
  };

  const reuse = async (invoice: Invoice) => {
    setRereading(invoice.invoice_id);
    setError(null);
    try {
      const response = await rereadBill(invoice.invoice_id, ctx);
      const found = addRows(response, {
        invoiceId: invoice.invoice_id,
        uploadKey: `reuse-${invoice.invoice_id}-${++uploads}`,
        fileName: invoice.file_name,
        fileType: invoice.file_type,
        url: invoice.cloudinary_url,
      });
      if (found) setLibraryOpen(false);
      else setError(`No entries were found on ${invoice.file_name}.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRereading(null);
    }
  };

  const addItem = (bill: BillMeta) =>
    p.dispatch({ type: "append", rows: [{ ...newRow(p.model, 1), _bill: { ...bill, ai: [], confidence: null } }] });

  const busy = items.find((i) => i.status === "uploading");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <FileDrop
            label="Bills"
            help="PDF or photo of the bill, up to 10 MB. Nothing is saved until you check the rows."
            accept={ACCEPT}
            maxSize={MAX_SIZE}
            items={items}
            onAdd={(files) => void read(files)}
            onRemove={(id) => setItems((list) => list.filter((i) => i.id !== id))}
          />
        </div>
        <Button variant="secondary" icon={<FolderOpen className="size-4" />} onClick={() => setLibraryOpen(true)}>
          My bills
        </Button>
      </div>

      <p className="sr-only" aria-live="polite">
        {busy ? `Reading ${busy.file.name}` : ""}
      </p>
      {busy && (
        <p className="flex items-center gap-2 text-sm text-muted">
          <Sparkles aria-hidden className="size-4 animate-pulse text-brand-text" />
          Uploading and reading {busy.file.name}. This can take a little while for long bills.
        </p>
      )}
      {error && (
        <Callout tone="warn" onDismiss={() => setError(null)}>
          {error}
        </Callout>
      )}

      {groups.map(({ bill, rows }) => (
        <BillReview
          key={bill.key}
          bill={bill}
          rows={rows}
          outsidePeriod={billOutsidePeriod(bill.date, p.period)}
          renderRow={p.renderRow}
          onAddItem={() => addItem(bill)}
          onConfirm={() => p.dispatch({ type: "confirmBill", key: bill.key })}
          onRemove={() => p.dispatch({ type: "removeBill", key: bill.key })}
        />
      ))}

      <MyBillsDrawer
        open={libraryOpen}
        onClose={() => setLibraryOpen(false)}
        siteId={p.siteId}
        categoryId={p.categoryId}
        rereading={rereading}
        onReuse={(inv) => void reuse(inv)}
      />
    </div>
  );
}
