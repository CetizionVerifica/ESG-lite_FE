import { useState } from "react";
import type { SalesResult, SoldProduct } from "../../../../services/scope3SoldProductsService";
import { Button, Callout, Drawer, FileDrop, type FileDropItem } from "../../../../ui";
import { errorMessage, useAddSales } from "../api";
import { MAX_SALES, type ParsedSales, parseSales } from "../logic";

/** First sheet of a CSV or Excel file as rows of cells. xlsx is loaded only when needed. */
async function readTable(file: File): Promise<unknown[][]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
  const first = wb.SheetNames[0];
  return first ? XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[first], { header: 1, blankrows: false, defval: "", raw: true }) : [];
}

export type ImportDrawerProps = {
  products: SoldProduct[];
  siteId: number | null;
  companyId: number | null;
  onClose: () => void;
  onImported: (result: SalesResult) => void;
};

/** Import a sales sheet (the template's Product, Month, Quantity, Unit, Region). Rows with problems stop the import until fixed. */
export function ImportDrawer({ products, siteId, companyId, onClose, onImported }: ImportDrawerProps) {
  const [items, setItems] = useState<FileDropItem[]>([]);
  const [parsed, setParsed] = useState<ParsedSales | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const add = useAddSales(companyId);

  const onFile = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    add.reset();
    setItems([{ id: `${file.name}-${file.size}`, file }]);
    setReadError(null);
    try {
      setParsed(parseSales(await readTable(file), products, siteId));
    } catch {
      setParsed(null);
      setReadError("Couldn't read the file. Save it as CSV or Excel (.xlsx) and try again.");
    }
  };

  const ready = parsed && !parsed.missing.length && !parsed.errors.length && parsed.sales.length > 0 ? parsed.sales : null;

  return (
    <Drawer
      open
      onClose={onClose}
      size="md"
      title="Import sales"
      subtitle={`Up to ${MAX_SALES.toLocaleString("en")} rows: product, month, quantity, unit and region`}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-3">
          {add.isError && (
            <p role="alert" className="mr-auto text-sm text-bad">
              {errorMessage(add.error, "The sales weren't imported. Try again.")}
            </p>
          )}
          <Button variant="ghost" onClick={onClose} disabled={add.isPending}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!ready} onClick={() => ready && add.mutate(ready, { onSuccess: onImported })} loading={add.isPending}>
            {ready ? `Import ${ready.length.toLocaleString("en")} ${ready.length === 1 ? "sale" : "sales"}` : "Import sales"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <FileDrop
          label="Sales file"
          help="CSV or Excel. Product names must match your products; a sale already recorded for the same product, month, unit and region is replaced."
          accept={[".csv", ".xlsx", ".xls", "text/csv"]}
          maxSize={10 * 1024 * 1024}
          multiple={false}
          items={items}
          onAdd={(files) => void onFile(files)}
          onRemove={() => {
            setItems([]);
            setParsed(null);
            add.reset();
          }}
        />
        {readError && <Callout tone="warn">{readError}</Callout>}
        {parsed?.missing.length ? (
          <Callout tone="warn" title="The sheet is missing columns">
            Add {parsed.missing.join(", ")}, or start from the template.
          </Callout>
        ) : null}
        {parsed && parsed.errors.length > 0 && (
          <Callout tone="warn" title={`${parsed.errors.length} ${parsed.errors.length === 1 ? "problem" : "problems"} in the sheet`}>
            <ul className="list-disc pl-5">
              {parsed.errors.slice(0, 10).map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </Callout>
        )}
        {parsed && !parsed.missing.length && !parsed.errors.length && !parsed.sales.length && <Callout tone="warn">The sheet has no sales.</Callout>}
        {ready && (
          <p className="text-sm text-muted" aria-live="polite" data-testid="import-ready">
            {ready.length.toLocaleString("en")} {ready.length === 1 ? "sale" : "sales"} for {new Set(ready.map((s) => s.product_id)).size} {new Set(ready.map((s) => s.product_id)).size === 1 ? "product" : "products"} ready to import.
          </p>
        )}
      </div>
    </Drawer>
  );
}
