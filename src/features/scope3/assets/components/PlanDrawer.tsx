import { useState } from "react";
import { PLAN_SKIP_LABEL } from "../../../../lib/scope3/assets";
import type { Investment, InvestmentsPlan } from "../../../../services/scope3AssetsService";
import { Badge, Button, Callout, Drawer, NumberField, SegmentedControl, Select, YearPicker, formatEmissions } from "../../../../ui";
import { errorMessage, useAssetSites, useCommitPlan, usePlanInvestments } from "../api";
import { commitKey, planSummary } from "../logic";

type YearType = "CY" | "FY";
const YEAR_TYPE_OPTIONS = [
  { value: "CY" as const, label: "Calendar year" },
  { value: "FY" as const, label: "Financial year" },
];

export type PlanDrawerProps = {
  open: boolean;
  companyId: number | null;
  investments: Investment[];
  defaultYear: number;
  threshold: number | null;
  onClose: () => void;
  onImported: (rows: number) => void;
};

/**
 * "Create Category 15 plan": one yearly row per equity investment on the
 * site the caller picks. The server makes an import plan and the engine
 * calculates each row; nothing is saved until "Import".
 */
export function PlanDrawer({ open, companyId, investments, defaultYear, threshold, onClose, onImported }: PlanDrawerProps) {
  const sites = useAssetSites(companyId, open);
  const plan = usePlanInvestments(companyId);
  const commit = useCommitPlan();
  const [siteId, setSiteId] = useState<number | null>(null);
  const [year, setYear] = useState<number | null>(defaultYear);
  const [yearType, setYearType] = useState<YearType>("CY");
  const [thresholdPct, setThresholdPct] = useState<number | null>(threshold);
  const [tried, setTried] = useState(false);

  const siteOptions = (sites.data?.sites ?? []).map((s) => ({ value: s.site_id, label: s.name }));
  const effectiveSite = siteId ?? (siteOptions.length === 1 ? siteOptions[0].value : null);
  const result: InvestmentsPlan | undefined = plan.data;
  const investeeOf = (ref: string): string => {
    const hit = result?.planned.find((p) => p.row_refs.includes(ref));
    return investments.find((i) => i.id === hit?.investment_id)?.investee ?? ref;
  };

  const reset = () => {
    plan.reset();
    commit.reset();
  };

  const onPreview = () => {
    setTried(true);
    if (effectiveSite === null || year === null) return;
    commit.reset();
    plan.mutate({ site_id: effectiveSite, year, year_type: yearType, ...(thresholdPct ? { threshold_pct: thresholdPct } : {}) });
  };

  const p = result?.plan ?? null;
  const onImport = () => {
    if (!p) return;
    commit.mutate({ planId: p.plan_id, version: p.version, key: commitKey(p.plan_id, p.version) }, { onSuccess: (c) => onImported(c.committed?.inserted ?? p.counts.ready) });
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="md"
      title="Create Category 15 plan"
      subtitle="One yearly row per equity investment, calculated by ESGLite"
      error={sites.isError ? errorMessage(sites.error, "Couldn't load your sites.") : null}
      onRetry={() => sites.refetch()}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-3">
          {commit.isError && (
            <p role="alert" className="mr-auto text-sm text-bad">
              {errorMessage(commit.error, "The rows weren't imported. Try again.")}
            </p>
          )}
          <Button variant="ghost" onClick={onClose} disabled={commit.isPending}>
            Cancel
          </Button>
          {p && p.counts.ready > 0 ? (
            <Button variant="primary" onClick={onImport} loading={commit.isPending}>
              Import {p.counts.ready} {p.counts.ready === 1 ? "row" : "rows"} as Pending
            </Button>
          ) : (
            <Button variant="primary" onClick={onPreview} loading={plan.isPending}>
              Preview plan
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select<number>
            label="Site"
            help="Company-level rows need a home site with Category 15."
            value={effectiveSite}
            options={siteOptions}
            onChange={(v) => {
              setSiteId(v);
              reset();
            }}
            placeholder="Choose a site"
            loading={sites.isLoading}
            required
            error={tried && effectiveSite === null ? "Choose the site the rows go to." : undefined}
          />
          <YearPicker
            label="Reporting year"
            value={year}
            onChange={(v) => {
              setYear(v);
              reset();
            }}
            yearType={yearType}
            from={2018}
            to={new Date().getFullYear() + 1}
            required
            error={tried && year === null ? "Choose the year." : undefined}
          />
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <SegmentedControl<YearType>
            label="Year type"
            options={YEAR_TYPE_OPTIONS}
            value={yearType}
            onChange={(v) => {
              setYearType(v);
              reset();
            }}
            size="sm"
          />
          <NumberField
            className="w-44"
            label="Threshold"
            help="Smaller stakes are listed, not planned."
            unit="%"
            value={thresholdPct}
            onChange={(v) => {
              setThresholdPct(v);
              reset();
            }}
            min={0}
            max={100}
            step={0.1}
          />
        </div>

        {plan.isError && (
          <p role="alert" className="text-sm text-bad">
            Couldn't make the plan. {errorMessage(plan.error, "Try again.")}
          </p>
        )}

        {result && !p && (
          <Callout tone="warn" title="Nothing to plan for this year">
            {result.skipped.length
              ? "Every investment for this year was left out; see why below."
              : "There are no investments for this year. Add them to the register first."}
          </Callout>
        )}

        {p && (
          <section aria-label="Plan preview" className="space-y-3" data-testid="plan-preview">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm text-muted" aria-live="polite">
                {planSummary(p)}
              </p>
              <p className="text-lg font-semibold text-ink" data-testid="plan-total">
                {formatEmissions(p.totals.tco2e)}
              </p>
            </div>
            <ul className="divide-y divide-line rounded-control border border-line">
              {p.rows.map((r) => (
                <li key={r.row_ref} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium text-ink">{investeeOf(r.row_ref)}</div>
                    <div className="text-xs text-muted">{r.input.activity_name}</div>
                    {r.issues.map((i) => (
                      <p key={i.code + i.message} className={i.severity === "error" ? "text-xs text-bad" : "text-xs text-warn"}>
                        {i.message}
                      </p>
                    ))}
                  </div>
                  {r.state === "ready" && r.result ? (
                    <span className="font-mono tabular-nums text-ink">{formatEmissions(r.result.total_tco2e)}</span>
                  ) : (
                    <Badge tone={r.state === "issue" ? "bad" : "neutral"}>{r.state === "issue" ? "Needs a fix" : "Skipped"}</Badge>
                  )}
                </li>
              ))}
            </ul>
            {p.counts.issue > 0 && <p className="text-xs text-muted">Rows that need a fix are left out of the import. Fix the investment or the site's Category 15 setup and preview again.</p>}
          </section>
        )}

        {result && result.skipped.length > 0 && (
          <section aria-label="Left out" className="space-y-2">
            <h3 className="text-sm font-medium text-ink">Left out ({result.skipped.length})</h3>
            <ul className="space-y-1 text-sm">
              {result.skipped.map((s) => (
                <li key={s.investment_id} className="flex flex-wrap justify-between gap-2">
                  <span className="text-ink">{s.investee}</span>
                  <span className="text-muted">{PLAN_SKIP_LABEL[s.reason]}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </Drawer>
  );
}
