import { CircleAlert, SlidersHorizontal, Sparkles, Trash2 } from "lucide-react";
import { Badge, Button, Combobox, NumberField, Select, TextField, cn } from "../../../ui";
import { type FactorBook, type Line, type PickerFactor, factorLabel, fmtKg, lineProblem, needsConfirm, priceLine, unitOptions } from "../logic";

type Props = {
  /** Accessible name of the table, e.g. "Materials". */
  caption: string;
  lines: Line[];
  factors: PickerFactor[];
  factorsLoading: boolean;
  book: FactorBook;
  unitLabel: string;
  /** Show the recycled share column (materials only). */
  recycled?: boolean;
  onChange: (key: string, patch: Partial<Line>) => void;
  onRemove: (line: Line) => void;
  onDetails: (line: Line) => void;
};

const cell = "px-2 py-2 align-top";

/** Editable lines of one stage (A1, packaging or waste): one row per line, extra fields in a Drawer. */
export function LineTable({ caption, lines, factors, factorsLoading, book, unitLabel, recycled, onChange, onRemove, onDetails }: Props) {
  const options = factors.filter((f) => !f.recycled).map((f) => ({ value: f.id, label: factorLabel(f) }));
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="border-b border-line text-left text-xs text-muted">
          <tr>
            <th scope="col" className={cell}>Name</th>
            <th scope="col" className={cell}>Qty per {unitLabel}</th>
            <th scope="col" className={cell}>Unit</th>
            {recycled && <th scope="col" className={cell}>Recycled %</th>}
            <th scope="col" className={cn(cell, "w-[32%]")}>Factor</th>
            <th scope="col" className={cn(cell, "text-right")}>kgCO₂e</th>
            <th scope="col" className={cell}><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const n = i + 1;
            const priced = priceLine(l, book);
            const problem = lineProblem(l);
            const confirm = needsConfirm(l);
            return (
              <tr key={l.key} className={cn("border-b border-line last:border-0", confirm && "bg-warn-soft")}>
                <td className={cell}>
                  <TextField label={`Name, row ${n}`} hideLabel value={l.name} onChange={(v) => onChange(l.key, { name: v })} placeholder="e.g. Aluminium ingot" />
                  {l.ai_suggested && (
                    <div className="mt-1 flex items-center gap-2">
                      <Badge tone={confirm ? "warn" : "neutral"} className="gap-1">
                        <Sparkles aria-hidden className="size-3" /> AI {l.ai_confidence == null ? "" : `${Math.round(l.ai_confidence * 100)}%`}
                      </Badge>
                      {confirm && (
                        <Button size="sm" variant="ghost" onClick={() => onChange(l.key, { ai_suggested: false })}>
                          Confirm
                        </Button>
                      )}
                    </div>
                  )}
                </td>
                <td className={cn(cell, "w-28")}>
                  <NumberField label={`Quantity, row ${n}`} hideLabel value={l.quantity} min={0} onChange={(v) => onChange(l.key, { quantity: v })} />
                </td>
                <td className={cn(cell, "w-24")}>
                  <Select label={`Unit, row ${n}`} hideLabel value={l.unit} options={unitOptions(l.unit)} onChange={(v) => v && onChange(l.key, { unit: v })} />
                </td>
                {recycled && (
                  <td className={cn(cell, "w-24")}>
                    <NumberField
                      label={`Recycled share, row ${n}`}
                      hideLabel
                      value={l.recycled_share_pct}
                      min={0}
                      max={100}
                      unit="%"
                      onChange={(v) => onChange(l.key, { recycled_share_pct: v ?? 0 })}
                    />
                  </td>
                )}
                <td className={cell}>
                  {l.supplier_pcf_kgco2e != null ? (
                    <p className="pt-2 text-sm text-ink">Supplier footprint: {fmtKg(l.supplier_pcf_kgco2e)} kg per {l.unit}</p>
                  ) : (
                    <Combobox
                      label={`Factor, row ${n}`}
                      hideLabel
                      value={l.material_factor_id}
                      options={options}
                      onChange={(v) => onChange(l.key, { material_factor_id: v })}
                      placeholder="Search factors…"
                      loading={factorsLoading}
                    />
                  )}
                </td>
                <td className={cn(cell, "pt-4 text-right tabular-nums")}>
                  {priced.kg !== null ? (
                    fmtKg(priced.kg)
                  ) : (
                    <span className="inline-flex items-center gap-1 text-left text-xs text-warn">
                      <CircleAlert aria-hidden className="size-3.5 shrink-0" />
                      {problem ?? priced.reason}
                    </span>
                  )}
                </td>
                <td className={cn(cell, "whitespace-nowrap")}>
                  <Button size="sm" variant="ghost" aria-label={`More fields, row ${n}`} icon={<SlidersHorizontal aria-hidden className="size-4" />} onClick={() => onDetails(l)} />
                  <Button size="sm" variant="ghost" aria-label={`Remove row ${n}`} icon={<Trash2 aria-hidden className="size-4" />} onClick={() => onRemove(l)} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
