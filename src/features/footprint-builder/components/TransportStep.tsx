import { CircleAlert, Plus, Trash2 } from "lucide-react";
import { Button, Combobox, EmptyState, NumberField, Select, TextField, cn, panel } from "../../../ui";
import { type FactorBook, type Line, type PickerFactor, factorLabel, fmtKg, lineProblem, massInTonnes, priceLine } from "../logic";

type Props = {
  legs: Line[];
  materials: Line[];
  factors: PickerFactor[];
  /** tonne.km factors from the material library, used like the server does when a site has no freight factor. */
  libraryFactors: PickerFactor[];
  /** Legs whose mass follows their material (see linkedPayloads). */
  linked: ReadonlyMap<string, number>;
  factorsLoading: boolean;
  factorsError: boolean;
  book: FactorBook;
  siteName: string;
  onAdd: () => void;
  onChange: (key: string, patch: Partial<Line>) => void;
  onRemove: (line: Line) => void;
};

const MODES = [
  { value: "road", label: "Road" },
  { value: "sea", label: "Sea" },
  { value: "rail", label: "Rail" },
  { value: "air", label: "Air" },
];
const OTHER = "__other";
const cell = "px-2 py-2 align-top";

/** Step 3: one inbound leg per material, priced per tonne.km from the site's freight factors. */
export function TransportStep({ legs, materials, factors, libraryFactors, linked, factorsLoading, factorsError, book, siteName, onAdd, onChange, onRemove }: Props) {
  const names = [...new Set(materials.map((m) => m.name.trim()).filter(Boolean))];
  const named = (l: Line) => names.some((n) => n.toLowerCase() === l.name.trim().toLowerCase());
  // Site freight factors are emission_factor_id, library ones material_factor_id; the prefix keeps them apart.
  const options = [
    ...factors.map((f) => ({ value: `ef-${f.id}`, label: factorLabel(f) })),
    ...libraryFactors.map((f) => ({ value: `mf-${f.id}`, label: `${factorLabel(f)} · library` })),
  ];
  const factorValue = (l: Line) => (l.emission_factor_id != null ? `ef-${l.emission_factor_id}` : l.material_factor_id != null ? `mf-${l.material_factor_id}` : null);
  const pickFactor = (l: Line, v: string | null) => {
    const id = v ? Number(v.slice(3)) : null;
    onChange(l.key, { emission_factor_id: v?.startsWith("ef-") ? id : null, material_factor_id: v?.startsWith("mf-") ? id : null });
  };
  const pickMaterial = (l: Line, name: string | null) => {
    if (!name || name === OTHER) return onChange(l.key, { name: "" });
    const m = materials.find((x) => x.name.trim() === name);
    onChange(l.key, { name, payload_t: (m && massInTonnes(m.quantity, m.unit)) ?? l.payload_t, origin_country: l.origin_country ?? m?.origin_country ?? null });
  };

  return (
    <section aria-labelledby="transport-title" className={`${panel} space-y-4 p-4 sm:p-6`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="transport-title" className="text-base font-semibold text-ink">
            Inbound transport (A2)
          </h2>
          <p className="mt-1 text-sm text-muted">
            How each material reaches {siteName}. The mass follows the material's quantity in step 2.
          </p>
        </div>
        <Button variant="primary" icon={<Plus aria-hidden className="size-4" />} onClick={onAdd}>
          Add leg
        </Button>
      </div>

      {factorsError && <p className="text-sm text-bad">Couldn't load the site's freight factors. Reload to try again.</p>}
      {!factorsLoading && !factorsError && factors.length === 0 && (
        <p className="text-sm text-muted">
          This site has no freight factors per tonne.km yet{libraryFactors.length ? ", so only the material library's tonne.km factors are listed" : ""}. Ask your admin to add them in Emission factors.
        </p>
      )}

      {legs.length === 0 ? (
        <EmptyState compact title="No transport legs yet." description="Add a leg for each material shipped to the plant." action={<Button onClick={onAdd}>Add leg</Button>} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <caption className="sr-only">Transport legs</caption>
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>
                <th scope="col" className={cell}>Material</th>
                <th scope="col" className={cell}>Mode</th>
                <th scope="col" className={cell}>From</th>
                <th scope="col" className={cell}>Distance</th>
                <th scope="col" className={cell}>Mass</th>
                <th scope="col" className={cn(cell, "w-[30%]")}>Factor</th>
                <th scope="col" className={cn(cell, "text-right")}>kgCO₂e</th>
                <th scope="col" className={cell}><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {legs.map((l, i) => {
                const n = i + 1;
                const isNamed = named(l);
                const isLinked = linked.has(l.key);
                const priced = priceLine(l, book);
                const materialOptions = [...names.map((v) => ({ value: v, label: v })), { value: OTHER, label: "Other (type a name)" }];
                return (
                  <tr key={l.key} className="border-b border-line last:border-0">
                    <td className={cn(cell, "w-48")}>
                      <Select
                        label={`Material, leg ${n}`}
                        hideLabel
                        value={isNamed ? names.find((v) => v.toLowerCase() === l.name.trim().toLowerCase())! : OTHER}
                        options={materialOptions}
                        onChange={(v) => pickMaterial(l, v)}
                      />
                      {!isNamed && (
                        <TextField label={`Leg name, leg ${n}`} hideLabel className="mt-2" value={l.name} onChange={(v) => onChange(l.key, { name: v })} placeholder="What is carried" />
                      )}
                    </td>
                    <td className={cn(cell, "w-28")}>
                      <Select label={`Mode, leg ${n}`} hideLabel value={l.transport_mode ?? "road"} options={MODES} onChange={(v) => v && onChange(l.key, { transport_mode: v })} />
                    </td>
                    <td className={cn(cell, "w-28")}>
                      <TextField label={`From, leg ${n}`} hideLabel value={l.origin_country ?? ""} onChange={(v) => onChange(l.key, { origin_country: v || null })} placeholder="Origin" />
                    </td>
                    <td className={cn(cell, "w-32")}>
                      <NumberField label={`Distance, leg ${n}`} hideLabel unit="km" value={l.distance_km} min={0} onChange={(v) => onChange(l.key, { distance_km: v })} />
                    </td>
                    <td className={cn(cell, "w-32")}>
                      {isLinked ? (
                        <p className="pt-2 tabular-nums text-ink">{`${fmtKg(linked.get(l.key)!)} t`}</p>
                      ) : (
                        <NumberField label={`Mass, leg ${n}`} hideLabel unit="t" value={l.payload_t} min={0} onChange={(v) => onChange(l.key, { payload_t: v })} />
                      )}
                    </td>
                    <td className={cell}>
                      <Combobox
                        label={`Factor, leg ${n}`}
                        hideLabel
                        value={factorValue(l)}
                        options={options}
                        onChange={(v) => pickFactor(l, v)}
                        placeholder="Search freight factors…"
                        loading={factorsLoading}
                        emptyText="No tonne.km factors"
                      />
                    </td>
                    <td className={cn(cell, "pt-4 text-right tabular-nums")}>
                      {priced.kg !== null ? (
                        fmtKg(priced.kg)
                      ) : (
                        <span className="inline-flex items-center gap-1 text-left text-xs text-warn">
                          <CircleAlert aria-hidden className="size-3.5 shrink-0" />
                          {lineProblem(l) ?? priced.reason}
                        </span>
                      )}
                    </td>
                    <td className={cell}>
                      <Button size="sm" variant="ghost" aria-label={`Remove leg ${n}`} icon={<Trash2 aria-hidden className="size-4" />} onClick={() => onRemove(l)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
