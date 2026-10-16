import { useState } from "react";
import type { Sale, SoldProduct } from "../../../../services/scope3SoldProductsService";
import { Button, Drawer, MonthPicker, NumberField, Select, TextField } from "../../../../ui";
import { errorMessage, useAddSales, useDeleteSale, useEditSale } from "../api";

export type SaleDrawerProps = {
  products: SoldProduct[];
  companyId: number | null;
  /** "YYYY-MM" the month picker starts on. */
  defaultMonth: string;
  maxMonth: string;
  /** A recorded sale to correct or remove; without it the drawer adds a new one. */
  sale?: Sale | null;
  onClose: () => void;
  onSaved: (outcome: "added" | "updated" | "removed") => void;
};

/**
 * Add one month's sale of one product (the same product, month, unit and region replaces the quantity),
 * or correct or remove a recorded one so a typo is never counted twice.
 */
export function SaleDrawer({ products, companyId, defaultMonth, maxMonth, sale, onClose, onSaved }: SaleDrawerProps) {
  const editing = !!sale;
  const only = products.length === 1 ? products[0] : null;
  const [productId, setProductId] = useState<number | null>(sale?.product_id ?? only?.product_id ?? null);
  const [month, setMonth] = useState<string | null>(sale ? sale.period.slice(0, 7) : defaultMonth);
  const [quantity, setQuantity] = useState<number | null>(sale?.quantity ?? null);
  const [unit, setUnit] = useState(sale?.unit ?? only?.unit ?? "");
  const [region, setRegion] = useState(sale?.region ?? "");
  const [tried, setTried] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const add = useAddSales(companyId);
  const edit = useEditSale(companyId);
  const remove = useDeleteSale(companyId);
  const busy = add.isPending || edit.isPending || remove.isPending;
  const failed = add.isError ? add.error : edit.isError ? edit.error : remove.isError ? remove.error : null;

  const errors = {
    product: productId === null ? "Choose a product." : undefined,
    month: month === null ? "Choose the month." : undefined,
    quantity: !quantity || quantity <= 0 ? "Enter a quantity above 0." : undefined,
    unit: !unit.trim() ? "Enter a unit." : undefined,
  };
  const valid = !Object.values(errors).some(Boolean);

  const onSave = () => {
    setTried(true);
    if (!valid || productId === null || month === null || !quantity) return;
    const fields = { period: month, quantity, unit: unit.trim(), region: region.trim() || null };
    if (sale) edit.mutate({ id: sale.id, body: fields }, { onSuccess: () => onSaved("updated") });
    else add.mutate([{ product_id: productId, ...fields }], { onSuccess: (r) => onSaved(r.created > 0 ? "added" : "updated") });
  };

  const options = products.map((p) => ({ value: p.product_id, label: products.some((o) => o !== p && o.name === p.name) ? `${p.name} (${p.site_name})` : p.name }));

  return (
    <Drawer
      open
      onClose={onClose}
      size="sm"
      title={editing ? "Edit sale" : "Add sale"}
      subtitle={editing ? sale.product : "One product, one month"}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-3">
          {failed && (
            <p role="alert" className="mr-auto text-sm text-bad">
              {errorMessage(failed, remove.isError ? "The sale wasn't removed. Try again." : "The sale wasn't saved. Try again.")}
            </p>
          )}
          {editing && !confirmRemove && (
            <Button variant="ghost" onClick={() => setConfirmRemove(true)} disabled={busy} className="mr-auto">
              Remove sale
            </Button>
          )}
          {editing && confirmRemove ? (
            <>
              <p className="mr-auto text-sm text-ink">Remove this sale? Rows already imported from it stay until they are rejected.</p>
              <Button variant="ghost" onClick={() => setConfirmRemove(false)} disabled={busy}>
                Keep it
              </Button>
              <Button variant="danger" onClick={() => remove.mutate(sale.id, { onSuccess: () => onSaved("removed") })} loading={remove.isPending}>
                Remove
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={onClose} disabled={busy}>
                Cancel
              </Button>
              <Button variant="primary" onClick={onSave} loading={add.isPending || edit.isPending}>
                {editing ? "Save sale" : "Add sale"}
              </Button>
            </>
          )}
        </div>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        <Select<number>
          label="Product"
          value={productId}
          options={options}
          onChange={(v) => {
            setProductId(v);
            const p = products.find((x) => x.product_id === v);
            if (p && !unit.trim()) setUnit(p.unit);
          }}
          placeholder="Choose a product"
          emptyText="No products on your sites"
          required
          disabled={editing}
          help={editing ? "To change the product, remove this sale and add a new one." : undefined}
          error={tried ? errors.product : undefined}
        />
        <MonthPicker label="Month" value={month} onChange={setMonth} min="2015-01" max={maxMonth} required error={tried ? errors.month : undefined} />
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField label="Quantity" value={quantity} onChange={setQuantity} min={0} required error={tried ? errors.quantity : undefined} />
          <TextField label="Unit" help="The product's unit, or kg or t." value={unit} onChange={setUnit} maxLength={50} required error={tried ? errors.unit : undefined} />
        </div>
        <TextField label="Region" value={region} onChange={setRegion} maxLength={100} placeholder="e.g. India" />
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" />
      </form>
    </Drawer>
  );
}
