import { useState } from "react";
import { INVESTMENT_TYPES, INVESTMENT_TYPE_LABEL, type InvestmentType } from "../../../../lib/scope3/assets";
import type { Investment } from "../../../../services/scope3AssetsService";
import { Button, Callout, Drawer, NumberField, SegmentedControl, Select, TextField } from "../../../../ui";
import { errorMessage, useSaveInvestment } from "../api";
import { BASIS_LABEL, CURRENCIES, type InvestmentBasis, type InvestmentDraft, draftErrors, draftFrom, emptyDraft, toBody } from "../logic";

const TYPE_OPTIONS = INVESTMENT_TYPES.map((t) => ({ value: t, label: INVESTMENT_TYPE_LABEL[t] }));
const BASIS_OPTIONS = (["reported", "revenue"] as const).map((b) => ({ value: b, label: b === "reported" ? "Reported emissions" : "Revenue and sector" }));
const CURRENCY_OPTIONS = CURRENCIES.map((c) => ({ value: c, label: c }));

export type InvestmentDrawerProps = {
  open: boolean;
  /** The investment being edited; null adds a new one. */
  investment: Investment | null;
  companyId: number | null;
  defaultYear: number;
  editable: boolean;
  onClose: () => void;
  onSaved: (name: string, created: boolean) => void;
};

/** Add or edit one investment. Mounted per opened row, so the form starts from that row. */
export function InvestmentDrawer({ open, investment, companyId, defaultYear, editable, onClose, onSaved }: InvestmentDrawerProps) {
  const [draft, setDraft] = useState<InvestmentDraft>(() => (investment ? draftFrom(investment) : emptyDraft(defaultYear)));
  const [tried, setTried] = useState(false);
  const save = useSaveInvestment(companyId);
  const errors = draftErrors(draft);
  const shown = tried ? errors : {};
  const set = (patch: Partial<InvestmentDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const equity = draft.type === "equity";

  const onSave = () => {
    setTried(true);
    if (Object.keys(errors).length) return;
    save.mutate(
      { id: investment?.id ?? null, body: toBody(draft, investment) },
      { onSuccess: () => onSaved(draft.investee.trim(), !investment) },
    );
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="sm"
      title={investment ? investment.investee : "Add investment"}
      subtitle={investment ? `${INVESTMENT_TYPE_LABEL[investment.type]} · ${investment.year}` : "Investments register"}
      footer={
        editable ? (
          <div className="flex flex-wrap items-center justify-end gap-3">
            {save.isError && (
              <p role="alert" className="mr-auto text-sm text-bad">
                {errorMessage(save.error, "The investment wasn't saved. Try again.")}
              </p>
            )}
            <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
              Cancel
            </Button>
            <Button variant="primary" onClick={onSave} loading={save.isPending}>
              {investment ? "Save changes" : "Add investment"}
            </Button>
          </div>
        ) : undefined
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (editable) onSave();
        }}
      >
        <fieldset disabled={!editable} className="space-y-4">
          <TextField label="Investee" value={draft.investee} onChange={(v) => set({ investee: v })} required error={shown.investee} maxLength={200} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select<InvestmentType> label="Type" value={draft.type} options={TYPE_OPTIONS} onChange={(v) => v && set({ type: v })} />
            <NumberField
              label="Share of equity"
              unit="%"
              value={draft.share_pct}
              onChange={(v) => set({ share_pct: v })}
              min={0}
              max={100}
              step={0.01}
              required
              error={shown.share_pct}
            />
          </div>
          {!equity && (
            <Callout tone="info">Debt and project finance are listed but not calculated yet. Only equity investments go into the plan.</Callout>
          )}
          {equity && (
            <div className="space-y-3">
              <SegmentedControl<InvestmentBasis> label="How it is calculated" options={BASIS_OPTIONS} value={draft.basis} onChange={(b) => set({ basis: b })} size="sm" />
              <p className="text-xs text-muted">{BASIS_LABEL[draft.basis]}: {draft.basis === "reported" ? "investee Scope 1+2 × your share." : "revenue × the sector's spend factor × your share."}</p>
              {draft.basis === "reported" ? (
                <NumberField
                  label="Investee Scope 1+2"
                  unit="tCO₂e"
                  value={draft.investee_scope12_tco2e}
                  onChange={(v) => set({ investee_scope12_tco2e: v })}
                  min={0}
                  required
                  error={shown.investee_scope12_tco2e}
                />
              ) : (
                <>
                  <div className="grid gap-4 sm:grid-cols-[1fr_7rem]">
                    <NumberField label="Investee revenue" value={draft.revenue} onChange={(v) => set({ revenue: v })} min={0} required error={shown.revenue} />
                    <Select<string> label="Currency" value={draft.currency} options={CURRENCY_OPTIONS} onChange={(v) => v && set({ currency: v })} />
                  </div>
                  <TextField
                    label="Sector"
                    help="The spend factor's name for this sector, as set up on the site's Category 15."
                    value={draft.eeio_sector}
                    onChange={(v) => set({ eeio_sector: v })}
                    required
                    error={shown.eeio_sector}
                    maxLength={100}
                  />
                  {investment?.sector_split && (
                    <p className="text-xs text-muted">
                      This investment has a revenue split over {Object.keys(investment.sector_split).length} sectors; it is kept as saved.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField label="Reporting year" value={draft.year} onChange={(v) => set({ year: v })} min={2000} max={2100} step={1} required error={shown.year} />
            <TextField label="Source" value={draft.source} onChange={(v) => set({ source: v })} placeholder="e.g. investee's annual report" maxLength={200} />
          </div>
        </fieldset>
        {/* Enter in a field submits; the visible buttons are in the drawer footer. */}
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" />
      </form>
    </Drawer>
  );
}
