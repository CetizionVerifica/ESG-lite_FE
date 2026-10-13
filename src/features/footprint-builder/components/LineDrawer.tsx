import { Link } from "react-router-dom";
import { Combobox, Drawer, NumberField, Select, TextField, askSupplierLink, cn, focusRing } from "../../../ui";
import { type Line, type PickerFactor, factorLabel, lineProblem } from "../logic";

type Props = {
  line: Line | null;
  factors: PickerFactor[];
  /** The study the line belongs to, for the C06 "Ask the supplier" link. */
  studyId: number;
  onChange: (key: string, patch: Partial<Line>) => void;
  onClose: () => void;
};

const DQR = [
  { value: 1, label: "1 · Very good" },
  { value: 2, label: "2 · Fair" },
  { value: 3, label: "3 · Poor" },
];

/** The fields a line row has no room for. Edits apply as typed, like the row. */
export function LineDrawer({ line, factors, studyId, onChange, onClose }: Props) {
  const set = (patch: Partial<Line>) => line && onChange(line.key, patch);
  const recycled = factors.filter((f) => f.recycled).map((f) => ({ value: f.id, label: factorLabel(f) }));
  const problem = line ? lineProblem(line) : null;
  return (
    <Drawer open={!!line} onClose={onClose} title={line?.name || "Line details"} subtitle={problem ?? "Saved with the footprint as you type."} size="sm">
      {line && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="Origin" value={line.origin_country ?? ""} onChange={(v) => set({ origin_country: v || null })} placeholder="Country, e.g. BH" />
            <TextField label="Supplier" value={line.supplier_name ?? ""} onChange={(v) => set({ supplier_name: v || null })} />
          </div>
          <Select
            label="Data type"
            value={line.data_type}
            options={[
              { value: "primary", label: "Primary (measured or supplier-specific)" },
              { value: "secondary", label: "Secondary (database factor)" },
            ]}
            onChange={(v) => v && set({ data_type: v })}
          />
          <NumberField
            label="Supplier's footprint"
            unit={`kgCO₂e per ${line.unit}`}
            value={line.supplier_pcf_kgco2e}
            min={0}
            onChange={(v) => set({ supplier_pcf_kgco2e: v, ...(v != null ? { data_type: "primary" as const } : {}) })}
            help="From the supplier's own declaration. Replaces the factor for this line."
          />
          {line.pcf_input_id != null && line.supplier_pcf_kgco2e == null && (
            <p className="text-sm text-muted">
              Don't have it?{" "}
              <Link to={askSupplierLink(studyId, line.pcf_input_id)} className={cn("rounded-chip font-medium text-brand-text underline underline-offset-2", focusRing)}>
                Ask the supplier
              </Link>{" "}
              for their declaration; once accepted it fills this field.
            </p>
          )}
          {line.stage === "A1" && line.recycled_share_pct > 0 && line.supplier_pcf_kgco2e == null && (
            <Combobox
              label="Recycled factor"
              value={line.recycled_material_factor_id}
              options={recycled}
              onChange={(v) => set({ recycled_material_factor_id: v })}
              placeholder="Search recycled factors…"
              emptyText="No recycled factors in the library"
              help={`Used for the ${line.recycled_share_pct}% recycled share (cut-off approach).`}
            />
          )}
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-ink">Data quality (1 best, 3 worst)</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              <Select label="Technology" value={line.dqr_technology} options={DQR} onChange={(v) => v && set({ dqr_technology: v })} />
              <Select label="Geography" value={line.dqr_geography} options={DQR} onChange={(v) => v && set({ dqr_geography: v })} />
              <Select label="Time" value={line.dqr_time} options={DQR} onChange={(v) => v && set({ dqr_time: v })} />
            </div>
          </fieldset>
        </div>
      )}
    </Drawer>
  );
}
