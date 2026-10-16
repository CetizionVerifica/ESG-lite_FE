import { useState } from "react";
import type { SoldProduct } from "../../../../services/scope3SoldProductsService";
import { Button, Drawer, MonthPicker, NumberField, Select, TextField } from "../../../../ui";
import { errorMessage, useAddSales } from "../api";

export type SaleDrawerProps = {
  products: SoldProduct[];
  companyId: number | null;
  /** "YYYY-MM" the month picker starts on. */
  defaultMonth: string;
  maxMonth: string;
  onClose: () => void;
  onSaved: (created: boolean) => void;
};

/** Add one month's sale of one product. The same product, month, unit and region replaces the quantity. */
export function SaleDrawer({ products, companyId, defaultMonth, maxMonth, onClose, onSaved }: SaleDrawerProps) {
  const [productId, setProductId] = useState<number | null>(products.length === 1 ? products[0].product_id : null);
  const [month, setMonth] = useState<string | null>(defaultMonth);
  const [quantity, setQuantity] = useState<number | null>(null);
  const [unit, setUnit] = useState(products.length === 1 ? products[0].unit : "");
  const [region, setRegion] = useState("");
  const [tried, setTried] = useState(false);
  const add = useAddSales(companyId);

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
    add.mutate([{ product_id: productId, period: month, quantity, unit: unit.trim(), region: region.trim() || null }], { onSuccess: (r) => onSaved(r.created > 0) });
  };

  const options = products.map((p) => ({ value: p.product_id, label: products.some((o) => o !== p && o.name === p.name) ? `${p.name} (${p.site_name})` : p.name }));

  return (
    <Drawer
      open
      onClose={onClose}
      size="sm"
      title="Add sale"
      subtitle="One product, one month"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-3">
          {add.isError && (
            <p role="alert" className="mr-auto text-sm text-bad">
              {errorMessage(add.error, "The sale wasn't saved. Try again.")}
            </p>
          )}
          <Button variant="ghost" onClick={onClose} disabled={add.isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onSave} loading={add.isPending}>
            Add sale
          </Button>
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
