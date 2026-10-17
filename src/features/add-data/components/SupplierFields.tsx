import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { type HybridLineKind, ROW_METHOD_COLUMN, pickFacility } from "../../../lib/emissions/emissionCalc";
import { methodLabel } from "../../../lib/scope3/labels";
import { SPEND_METHOD } from "../../../lib/scope3/spend";
import type { SupplierDetail, SupplierListItem } from "../../../services/scope3SuppliersService";
import { Badge, Button, Combobox, NumberField, Select, TextField, cn, formatNumber, panel } from "../../../ui";
import type { ModalRow } from "../types";
import { type DraftLine, HYBRID_LINE_KINDS, LINE_KIND_LABEL, NO_FIGURE_HINT, figureFor, linesOf, supplierIdOf, supplierMethodOf } from "../logic/supplier";

const NEW = -1;
type CalcChoice = "average" | "supplier_specific" | "hybrid" | "spend_based";

const fmt = (n: number) => formatNumber(n, n % 1 ? Math.min(6, String(n).split(".")[1]?.length ?? 2) : 0);

export type SupplierFieldsProps = {
  row: ModalRow;
  /** 1 or 2: the method labels follow the category's own wording. */
  ghg: number;
  suppliers: SupplierListItem[];
  loadingSuppliers: boolean;
  /** The chosen supplier's figures and facility data, once loaded. */
  detail: SupplierDetail | undefined;
  /** Whoever enters data may add a supplier by name here (ESG-lite POST /suppliers); its figures stay with Managers and above. */
  canCreate: boolean;
  /**
   * SE-1 / simple-entry §8 (default (a)): a contributor gets the Supplier field only. The figure,
   * facility and hybrid lines show only with `showCalcDetail` (Managers and above, or a company set
   * to full detail).
   */
  showCalcDetail?: boolean;
  /** "Calculated from" shows only with `showCalcDetail` on a form without S3-3 method cards (one picker per row). */
  showMethodChoice?: boolean;
  onCreate: (name: string) => Promise<number>;
  createError: string | null;
  reportingYear: number;
  /** The activity names of this site and category: the factors hybrid lines can use. */
  factorNames: string[];
  onPatch: (patch: Partial<ModalRow>) => void;
};

/**
 * S3-6: who the goods came from, and whether the row is calculated from the
 * supplier's own figure or from its energy and materials. The figures shown
 * are the ones the engine will pick; the total stays the server's.
 */
export function SupplierFields(p: SupplierFieldsProps) {
  const { row, detail } = p;
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const supplierId = supplierIdOf(row);
  const method = supplierMethodOf(row);
  // S3-5's spend form reads the same "@method" key.
  const choice: CalcChoice = method ?? (row[ROW_METHOD_COLUMN] === SPEND_METHOD ? "spend_based" : "average");
  const name = detail?.supplier.name ?? p.suppliers.find((s) => s.supplier_id === supplierId)?.name ?? "";

  const trimmed = query.trim();
  const exists = p.suppliers.some((s) => s.name.toLowerCase() === trimmed.toLowerCase());
  const options = [
    ...p.suppliers.map((s) => ({ value: s.supplier_id, label: s.name })),
    ...(p.canCreate && trimmed && !exists ? [{ value: NEW, label: `Add “${trimmed}” as a supplier` }] : []),
  ];

  const pickSupplier = async (v: number | null) => {
    if (v === NEW) {
      setCreating(true);
      try {
        const id = await p.onCreate(trimmed);
        p.onPatch({ _supplier_id: id, _supplier_factor_id: undefined });
        setQuery("");
      } catch {
        // createError shows the server's reason under the field.
      } finally {
        setCreating(false);
      }
      return;
    }
    p.onPatch({ _supplier_id: v ?? undefined, _supplier_factor_id: undefined });
  };

  const choices: { value: CalcChoice; label: string }[] = [
    { value: "average", label: methodLabel("average_data", p.ghg) },
    { value: "supplier_specific", label: methodLabel("supplier_specific", p.ghg) },
    { value: "hybrid", label: methodLabel("hybrid", p.ghg) },
    { value: "spend_based", label: methodLabel("spend_based", p.ghg) },
  ];

  return (
    <div className={cn(panel, "space-y-3 p-3")} aria-label="Supplier">
      <div className="grid gap-3 sm:grid-cols-2">
        <Combobox<number>
          label="Supplier"
          value={supplierId}
          onChange={(v) => void pickSupplier(v)}
          options={options}
          onSearch={setQuery}
          placeholder={p.loadingSuppliers ? "Loading suppliers…" : "Search suppliers"}
          emptyText={p.canCreate ? "Type a name to add a supplier" : "No supplier with that name"}
          loading={creating}
          help={p.createError ?? "Who the goods came from."}
          error={p.createError ?? undefined}
        />
        {p.showMethodChoice && (
          <Select<CalcChoice>
            label="Calculated from"
            value={choice}
            options={choices}
            onChange={(v) => p.onPatch({ [ROW_METHOD_COLUMN]: v && v !== "average" ? v : undefined, _supplier_factor_id: undefined })}
          />
        )}
      </div>

      {method && !supplierId && <p className="text-sm text-muted">{p.showCalcDetail ? "Choose the supplier to use its figures." : "Choose the supplier."}</p>}
      {p.showCalcDetail && method && supplierId && !detail && <p className="text-sm text-muted">Loading the supplier's figures…</p>}
      {p.showCalcDetail && method === "supplier_specific" && detail && <OwnFigure row={row} detail={detail} name={name} reportingYear={p.reportingYear} onPatch={p.onPatch} />}
      {p.showCalcDetail && method === "hybrid" && detail && <Hybrid row={row} detail={detail} reportingYear={p.reportingYear} factorNames={p.factorNames} onPatch={p.onPatch} />}
    </div>
  );
}

function OwnFigure({ row, detail, name, reportingYear, onPatch }: { row: ModalRow; detail: SupplierDetail; name: string; reportingYear: number; onPatch: (patch: Partial<ModalRow>) => void }) {
  const { figure, message } = figureFor(row, detail, reportingYear);
  const usable = detail.factors.filter((f) => f.reference_year <= reportingYear);
  return (
    <div className="space-y-2">
      {figure ? (
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink" data-testid="supplier-figure">
          <Badge tone="good">Supplier figure</Badge>
          {name}, {figure.item}, {fmt(figure.kgco2e_per_unit)} kgCO₂e/{figure.unit}, {figure.reference_year}
        </p>
      ) : (
        <p className="text-sm text-warn" data-testid="supplier-figure-hint">
          {message ?? NO_FIGURE_HINT}
        </p>
      )}
      {usable.length > 1 && (
        <Select<number>
          className="sm:max-w-md"
          label="Supplier figure"
          value={figure?.supplier_factor_id ?? null}
          placeholder="Choose the figure"
          options={usable.map((f) => ({ value: f.supplier_factor_id, label: `${f.item}, ${fmt(f.kgco2e_per_unit)} kgCO₂e/${f.unit}, ${f.reference_year}` }))}
          onChange={(v) => onPatch({ _supplier_factor_id: v ?? undefined })}
        />
      )}
    </div>
  );
}

const KIND_OPTIONS = HYBRID_LINE_KINDS.map((k) => ({ value: k, label: LINE_KIND_LABEL[k] }));

function Hybrid({ row, detail, reportingYear, factorNames, onPatch }: { row: ModalRow; detail: SupplierDetail; reportingYear: number; factorNames: string[]; onPatch: (patch: Partial<ModalRow>) => void }) {
  const lines = linesOf(row);
  const facility = pickFacility(detail.facility_data, reportingYear);
  const usesEnergy = lines.some((l) => l.kind === "energy");
  const setLines = (next: DraftLine[]) => onPatch({ _inputs: next });
  const setLine = (i: number, patch: Partial<DraftLine>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const nameOptions = factorNames.map((n) => ({ value: n, label: n }));

  return (
    <div className="space-y-3">
      <div className="text-sm">
        <p className="font-medium text-ink">Supplier's Scope 1 and 2</p>
        {usesEnergy ? (
          <p className="text-muted">From the supplier's energy lines below.</p>
        ) : facility ? (
          <p className="text-ink" data-testid="supplier-facility">
            {facility.year} facility: {fmt(facility.scope12_tco2e)} tCO₂e for {fmt(facility.output_qty)} {facility.output_unit}, allocated {facility.allocation_key === "economic" ? "by what you paid" : "by what you bought"}
          </p>
        ) : (
          <p className="text-warn">No facility data from this supplier for this year. Add it on the Suppliers page, or add its energy use as lines.</p>
        )}
      </div>
      {!usesEnergy && facility?.allocation_key === "economic" && (
        <NumberField
          className="sm:max-w-xs"
          label="Paid for these goods"
          unit={facility.output_unit}
          value={row._purchased_value === undefined || row._purchased_value === "" ? null : Number(row._purchased_value)}
          onChange={(v) => onPatch({ _purchased_value: v === null ? undefined : String(v) })}
          min={0}
        />
      )}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink">Materials, transport and waste</legend>
        {lines.length === 0 && <p className="text-xs text-muted">Add the supplier's inputs for these goods, each with the factor it is multiplied by.</p>}
        {lines.map((l, i) => (
          <div key={i} className="grid items-end gap-2 sm:grid-cols-[9rem_1fr_7rem_6rem_auto]">
            <Select<HybridLineKind> label="Kind" value={l.kind} options={KIND_OPTIONS} onChange={(v) => v && setLine(i, { kind: v })} />
            <Select<string> label="Factor" value={l.name || null} options={nameOptions} placeholder="Choose a factor" onChange={(v) => setLine(i, { name: v ?? "" })} />
            <TextField label="Quantity" inputMode="decimal" value={l.quantity} onChange={(v) => setLine(i, { quantity: v })} />
            <TextField label="Unit" value={l.unit} onChange={(v) => setLine(i, { unit: v })} maxLength={20} />
            <Button variant="ghost" size="sm" icon={<Trash2 className="size-4" />} aria-label={`Remove line ${i + 1}`} onClick={() => setLines(lines.filter((_, j) => j !== i))} />
          </div>
        ))}
        <Button variant="secondary" size="sm" icon={<Plus className="size-4" />} onClick={() => setLines([...lines, { kind: "material", name: "", quantity: "", unit: "kg" }])}>
          Add line
        </Button>
      </fieldset>
    </div>
  );
}
