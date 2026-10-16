import { categoryLabel } from "../../../../lib/scope3/contracts";
import type { PlanBody, SkipReason, SoldProductsPlan } from "../../../../services/scope3SoldProductsService";
import { Badge, Button, Callout, Drawer, formatEmissions } from "../../../../ui";
import { errorMessage, useCommitPlan } from "../api";
import { commitKey } from "../logic";

const SKIP_LABEL: Record<SkipReason, string> = {
  missing_mass: "No mass per unit (Setup, Products)",
  missing_units: "Sales are in a mass unit and the product has no mass per unit",
  missing_use_profile: "No use profile: open the product and say how it is used",
  missing_lifetime_uses: "No lifetime uses: open the product and add them",
  already_imported: "Already imported for this year",
};

export type PlanDrawerProps = {
  body: PlanBody;
  /** The plan request, started by the page's button (a POST, so never from an effect). */
  result: SoldProductsPlan | undefined;
  pending: boolean;
  error: unknown;
  onRetry: () => void;
  siteName: string;
  onClose: () => void;
  onImported: (rows: number) => void;
};

/**
 * "Create Category 10 / 11 / 12 plan": the server builds the year's import plan
 * from the sales and product data; the engine calculates each row. Nothing is
 * saved until "Import".
 */
export function PlanDrawer({ body, result, pending, error, onRetry, siteName, onClose, onImported }: PlanDrawerProps) {
  const commit = useCommitPlan();
  const p = result?.plan ?? null;
  const onImport = () => {
    if (!p) return;
    commit.mutate({ planId: p.plan_id, version: p.version, key: commitKey(p.plan_id, p.version) }, { onSuccess: (c) => onImported(c.committed?.inserted ?? p.counts.ready) });
  };

  return (
    <Drawer
      open
      onClose={onClose}
      size="md"
      title={`Create Category ${body.ghg_category} plan`}
      subtitle={`${categoryLabel(body.ghg_category)} · ${siteName} · ${body.year_type} ${body.year}`}
      loading={pending}
      error={error ? errorMessage(error, "Couldn't make the plan. Try again.") : null}
      onRetry={onRetry}
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
          {p && p.counts.ready > 0 && (
            <Button variant="primary" onClick={onImport} loading={commit.isPending}>
              Import {p.counts.ready} {p.counts.ready === 1 ? "row" : "rows"} as Pending
            </Button>
          )}
        </div>
      }
    >
      {result && (
        <div className="space-y-5">
          {!p && (
            <Callout tone="warn" title="Nothing to plan for this year">
              {result.products_sold ? "Every product with sales was left out; see why below." : "No sales are recorded for this site and year. Add or import them first."}
            </Callout>
          )}
          {p && (
            <section aria-label="Plan preview" className="space-y-3" data-testid="plan-preview">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm text-muted" aria-live="polite">
                  {p.counts.ready} of {p.counts.rows} {p.counts.rows === 1 ? "row" : "rows"} ready · {result.products_sold} {result.products_sold === 1 ? "product" : "products"} sold
                </p>
                <p className="text-lg font-semibold text-ink" data-testid="plan-total">
                  {formatEmissions(p.totals.tco2e)}
                </p>
              </div>
              <ul className="divide-y divide-line rounded-control border border-line">
                {p.rows.map((r) => (
                  <li key={r.row_ref} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-sm" data-testid="plan-row">
                    <div className="min-w-0">
                      <div className="font-medium text-ink">{String(r.input.fields?.["Product name"] ?? r.input.fields?.["Product Name"] ?? "")}</div>
                      <div className="text-xs text-muted">{r.input.activity_name.replace("|", " · ")}</div>
                      {r.issues.map((i) => (
                        <p key={i.code + i.message} className={i.severity === "error" ? "text-xs text-bad" : "text-xs text-warn"}>
                          {i.message}
                        </p>
                      ))}
                    </div>
                    {r.state === "ready" && r.result ? (
                      <span className="font-num tabular-nums text-ink">{formatEmissions(r.result.total_tco2e)}</span>
                    ) : (
                      <Badge tone={r.state === "issue" ? "bad" : "neutral"}>{r.state === "issue" ? "Needs a fix" : "Skipped"}</Badge>
                    )}
                  </li>
                ))}
              </ul>
              {p.counts.issue > 0 && (
                <p className="text-xs text-muted">Rows that need a fix are left out of the import. Most need an emission factor on the site's {categoryLabel(body.ghg_category)}.</p>
              )}
            </section>
          )}
          {result.skipped.length > 0 && (
            <section aria-label="Left out" className="space-y-2">
              <h3 className="text-sm font-medium text-ink">Left out ({result.skipped.length})</h3>
              <ul className="space-y-1 text-sm">
                {result.skipped.map((s) => (
                  <li key={`${s.product_id}-${s.reason}`} className="flex flex-wrap justify-between gap-2">
                    <span className="text-ink">{s.product}</span>
                    <span className="text-muted">{SKIP_LABEL[s.reason]}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Drawer>
  );
}
