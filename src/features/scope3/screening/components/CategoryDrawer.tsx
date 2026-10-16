import { useState } from "react";
import { Badge, Button, Callout, Combobox, Drawer, EMPTY_VALUE, NumberField, Select, TextField, cn, formatEmissions, formatNumber, panel } from "../../../../ui";
import { categoryLabel, type ScreeningBasis } from "../../../../lib/scope3/contracts";
import { ESTIMATE_NOTE, SCREENING_CURRENCIES, SECTOR_CONFIRM_BELOW, isMoneyBasis } from "../../../../lib/scope3/screening";
import type { ScreeningCategory, SectorSuggestion } from "../../../../services/scope3ScreeningService";
import { errorMessage, useSaveInputs, useSectorSearch, useSuggestSectors } from "../api";
import { type InputDraft, basesFor, basisLabel, draftFor, inputErrors, missingSectorHint, toInput } from "../logic";

export type CategoryDrawerProps = {
  category: ScreeningCategory;
  companyId: number | null;
  year: number;
  editable: boolean;
  canExtrapolate: boolean;
  onClose: () => void;
  onExtrapolate: () => void;
  onSaved: (message: string) => void;
};

const CURRENCY_OPTIONS = SCREENING_CURRENCIES.map((c) => ({ value: c, label: c }));

/** "Air transportation (NAICS 481000)" → "481000", the code the server stores. */
const codeOf = (name: string): string | null => /\(NAICS ([0-9A-Za-z]+)\)\s*$/.exec(name)?.[1] ?? null;

/**
 * One category's screening inputs (a rough spend, revenue or headcount figure
 * and its sector), the estimate each gives, "Suggest sector", and the way into
 * "Extrapolate…". Admin and Superadmin edit; others read.
 */
export function CategoryDrawer({ category: c, companyId, year, editable, canExtrapolate, onClose, onExtrapolate, onSaved }: CategoryDrawerProps) {
  const [draft, setDraft] = useState<InputDraft>(() => draftFor(c));
  const [tried, setTried] = useState(false);
  const [search, setSearch] = useState("");
  const [described, setDescribed] = useState("");
  const [suggested, setSuggested] = useState<SectorSuggestion[] | null>(null);
  const save = useSaveInputs(companyId, year);
  const suggest = useSuggestSectors(companyId);
  const money = isMoneyBasis(draft.basis);
  const sectors = useSectorSearch(search, editable && money);
  const errors = tried ? inputErrors(draft) : {};

  const set = (patch: Partial<InputDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const onBasis = (b: ScreeningBasis | null) => {
    if (!b) return;
    setDraft(draftFor(c, b));
    setSuggested(null);
    setTried(false);
  };
  const onSave = () => {
    setTried(true);
    if (Object.keys(inputErrors(draft)).length) return;
    save.mutate([toInput(c.n, draft)], { onSuccess: () => onSaved(`${basisLabel(draft.basis)} saved for ${categoryLabel(c.n)}`) });
  };
  const onSuggest = () => {
    if (!described.trim() || draft.amount === null || !draft.currency) return;
    suggest.mutate({ description: described.trim(), amount: draft.amount, currency: draft.currency }, { onSuccess: (r) => setSuggested(r.suggestions) });
  };

  const sectorOptions = [
    ...(draft.eeio_sector && draft.sector_name ? [{ value: draft.eeio_sector, label: draft.sector_name }] : []),
    ...(sectors.data ?? []).map((s) => ({ value: codeOf(s.name) ?? s.name, label: s.name })).filter((o) => o.value !== draft.eeio_sector),
  ];

  return (
    <Drawer
      open
      onClose={onClose}
      size="md"
      title={categoryLabel(c.n)}
      subtitle={`Screening ${year}`}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {save.isError && (
            <p role="alert" className="mr-auto text-sm text-bad">
              {errorMessage(save.error, "The figure wasn't saved. Try again.")}
            </p>
          )}
          {canExtrapolate && (
            <Button variant="ghost" onClick={onExtrapolate}>
              Extrapolate…
            </Button>
          )}
          {editable && (
            <Button variant="primary" onClick={onSave} loading={save.isPending}>
              Save figure
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        <section aria-label="Saved figures" className="space-y-2">
          <h3 className="text-sm font-medium text-ink">Saved figures</h3>
          {c.inputs.length === 0 ? (
            <p className="text-sm text-muted">No figures yet. Add a spend figure to estimate this category.</p>
          ) : (
            <ul className="space-y-2">
              {c.inputs.map((i) => (
                <li key={i.basis} className={cn(panel, "space-y-1 p-3 text-sm")} data-testid={`input-${i.basis}`}>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-ink">{basisLabel(i.basis)}</span>
                    <span className="font-mono tabular-nums text-ink">
                      {formatNumber(i.amount, i.amount % 1 ? 2 : 0)} {i.currency ?? ""}
                    </span>
                  </div>
                  {i.sector && <p className="text-xs text-muted">{i.sector.name}</p>}
                  <p className="text-xs">
                    {i.estimate_tco2e !== null ? (
                      <>
                        <span className="font-mono tabular-nums text-ink">{formatEmissions(i.estimate_tco2e)}</span>
                        <span className="text-muted"> · {ESTIMATE_NOTE}</span>
                      </>
                    ) : (
                      <span className="text-muted">{i.estimate_note ?? EMPTY_VALUE}</span>
                    )}
                  </p>
                  {i.fx && i.fx.currency !== i.fx.to && (
                    <p className="text-xs text-muted">
                      1 {i.fx.currency} = {formatNumber(i.fx.rate, 6)} {i.fx.to} on {i.fx.as_of}
                    </p>
                  )}
                  {i.warnings.map((w) => (
                    <p key={w} className="text-xs text-warn">
                      {w}
                    </p>
                  ))}
                  {i.note && <p className="text-xs text-muted">{i.note}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        {editable ? (
          <section aria-label="Add or change a figure" className="space-y-3">
            <h3 className="text-sm font-medium text-ink">Add or change a figure</h3>
            <Select<ScreeningBasis>
              label="Basis"
              value={draft.basis}
              options={basesFor(c.n).map((b) => ({ value: b, label: basisLabel(b) }))}
              onChange={onBasis}
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <NumberField
                label={draft.basis === "headcount" ? "Employees" : "Amount"}
                value={draft.amount}
                onChange={(v) => set({ amount: v })}
                min={0}
                error={errors.amount}
                unit={draft.basis === "mass_sold" ? "t" : undefined}
              />
              {money && (
                <Select<string> label="Currency" value={draft.currency} options={CURRENCY_OPTIONS} onChange={(v) => set({ currency: v })} error={errors.currency} />
              )}
            </div>
            {draft.basis === "headcount" && (
              <p className="text-xs text-muted">Estimated as every employee driving an average car, 15 km each way, 230 days a year. Run the commuting survey for a real figure.</p>
            )}
            {money && (
              <>
                <Combobox<string>
                  label="Sector"
                  help={missingSectorHint(draft) ?? "Spend-based factor from the USEEIO library."}
                  value={draft.eeio_sector}
                  options={sectorOptions}
                  onSearch={setSearch}
                  onChange={(v) => set({ eeio_sector: v, sector_name: sectorOptions.find((o) => o.value === v)?.label ?? null })}
                  placeholder="Search sectors…"
                  emptyText={search.trim().length < 2 ? "Type 2 letters or more" : sectors.isLoading ? "Searching…" : "No sectors match"}
                />
                <div className="space-y-2 rounded-control border border-line p-3">
                  <TextField label="What was bought" help="Only this text and the amount are used to suggest a sector." value={described} onChange={setDescribed} />
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={onSuggest}
                    loading={suggest.isPending}
                    disabled={!described.trim() || draft.amount === null || !draft.currency}
                  >
                    Suggest sector
                  </Button>
                  {suggest.isError && <p role="alert" className="text-xs text-bad">{errorMessage(suggest.error, "Couldn't suggest a sector. Pick one from the list.")}</p>}
                  {suggested && suggested.length === 0 && <p className="text-xs text-muted">No suggestion. Pick a sector from the list.</p>}
                  {suggested && suggested.length > 0 && (
                    <ul className="space-y-1" aria-label="Suggested sectors">
                      {suggested.map((s) => (
                        <li key={s.code} className="flex flex-wrap items-center gap-2">
                          <Button size="sm" variant="ghost" onClick={() => set({ eeio_sector: s.code, sector_name: s.name })} aria-pressed={draft.eeio_sector === s.code}>
                            {s.name}
                          </Button>
                          <Badge tone={s.confidence >= SECTOR_CONFIRM_BELOW ? "good" : "warn"}>{s.confidence} %</Badge>
                          {s.needs_confirmation && <span className="text-xs text-warn">Check before you use it</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
            <TextField label="Note" value={draft.note} onChange={(v) => set({ note: v })} maxLength={2000} />
          </section>
        ) : (
          <Callout tone="info">You can read the screening figures. An Admin or Superadmin changes them.</Callout>
        )}
      </div>
    </Drawer>
  );
}
