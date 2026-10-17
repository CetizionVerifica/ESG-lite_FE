import { useState } from "react";
import { Button, Callout, Modal, NumberField, SegmentedControl, Select, formatEmissions, formatNumber } from "../../../../ui";
import { PROXY_BASIS_LABELS, type YearType, categoryLabel } from "../../../../lib/scope3/contracts";
import type { Extrapolation, ScreeningCategory, ScreeningSite } from "../../../../services/scope3ScreeningService";
import { errorCode, errorMessage, useExtrapolate, usePreviewExtrapolation } from "../api";
import { type ExtrapolateDraft, extrapolateBody, extrapolateError } from "../logic";

export type ExtrapolateModalProps = {
  category: ScreeningCategory;
  companyId: number | null;
  year: number;
  yearType: YearType;
  sites: ScreeningSite[];
  onClose: () => void;
  onCreated: (message: string) => void;
};

const BASIS_HELP = {
  coverage: "Your approved rows at this site cover part of the activity (for example 85 % of purchases). The rest is scaled up from them.",
  intensity: "This site has no rows. Its output × the emissions per unit of output at your other sites gives the estimate.",
} as const;

/**
 * "Extrapolate…": fills a known gap with one Pending, estimated row. The
 * server shows the formula, the sources and the total first (a dry run); the
 * row is created only after that, and always waits for review.
 */
export function ExtrapolateModal({ category: c, companyId, year, yearType, sites, onClose, onCreated }: ExtrapolateModalProps) {
  const options = sites.filter((s) => s.ghg_categories.includes(c.n));
  const [draft, setDraft] = useState<ExtrapolateDraft>({ site_id: options[0]?.site_id ?? null, basis: "coverage", coverage_pct: null });
  const [preview, setPreview] = useState<Extrapolation | null>(null);
  const [tried, setTried] = useState(false);
  const previewing = usePreviewExtrapolation(companyId);
  const create = useExtrapolate(companyId);
  const err = tried ? extrapolateError(draft) : null;
  const failure = previewing.error ?? create.error;

  const set = (patch: Partial<ExtrapolateDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setPreview(null);
    previewing.reset();
    create.reset();
  };
  const onPreview = () => {
    setTried(true);
    if (extrapolateError(draft)) return;
    previewing.mutate(extrapolateBody(c.n, year, yearType, draft), { onSuccess: setPreview });
  };
  const onCreate = () =>
    create.mutate(extrapolateBody(c.n, year, yearType, draft), {
      onSuccess: (r) => onCreated(`Extrapolated row of ${formatEmissions(r.total_tco2e)} added as Pending`),
    });

  const failureText =
    failure &&
    (errorCode(failure) === "DUPLICATE_EXISTING"
      ? "An extrapolated row for this category, site, year and basis is already waiting for review. Approve or reject it first."
      : errorMessage(failure, "Couldn't extrapolate. Try again."));

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={`Extrapolate ${categoryLabel(c.n)}`}
      description={`${yearType} ${year}. The row is an estimate: Pending, secondary data, and labelled with its basis in reports.`}
      primaryAction={preview ? { label: "Create Pending row", onClick: onCreate, loading: create.isPending } : { label: "Show the calculation", onClick: onPreview, loading: previewing.isPending }}
      error={failureText || undefined}
    >
      {options.length === 0 ? (
        <Callout tone="warn">None of your sites has a category mapped to {categoryLabel(c.n)}.</Callout>
      ) : (
        <div className="space-y-4">
          <Select<number>
            label="Site"
            value={draft.site_id}
            options={options.map((s) => ({ value: s.site_id, label: s.name }))}
            onChange={(v) => set({ site_id: v })}
            error={err && !draft.site_id ? err : undefined}
          />
          <SegmentedControl<"coverage" | "intensity">
            label="Basis"
            value={draft.basis}
            options={[
              { value: "coverage", label: "Coverage %" },
              { value: "intensity", label: "Intensity" },
            ]}
            onChange={(b) => set({ basis: b })}
          />
          <p className="text-sm text-muted">{BASIS_HELP[draft.basis]}</p>
          {draft.basis === "coverage" && (
            <NumberField
              label="Share your recorded rows cover"
              unit="%"
              min={1}
              max={99}
              value={draft.coverage_pct}
              onChange={(v) => set({ coverage_pct: v })}
              error={err && draft.site_id ? err : undefined}
            />
          )}
          {preview && (
            <section className="space-y-1.5 rounded-control border border-line p-3 text-sm" aria-label="Calculation" data-testid="extrapolation-preview">
              <p className="font-medium text-ink">{PROXY_BASIS_LABELS[preview.basis]}</p>
              <p className="font-mono text-xs text-ink">{preview.formula}</p>
              <p className="text-muted">
                From {formatNumber(preview.sources.rows)} approved {preview.sources.rows === 1 ? "row" : "rows"} ({formatNumber(preview.sources.kg, 0)} kgCO₂e)
                {preview.production && `; output ${formatNumber(preview.production.source)} ${preview.production.unit} with data, ${formatNumber(preview.production.missing)} ${preview.production.unit} without`}.
              </p>
              <p className="text-ink">
                Estimate: <span className="font-mono tabular-nums" data-testid="extrapolation-total">{formatEmissions(preview.total_tco2e)}</span>
              </p>
              <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>
                Change
              </Button>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
