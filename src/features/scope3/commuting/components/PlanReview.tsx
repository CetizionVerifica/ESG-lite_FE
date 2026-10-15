import { Badge, Button, Callout, formatEmissions, formatNumber } from "../../../../ui";
import type { SurveyPlan } from "../../../../services/scope3CommutingService";

type Props = {
  result: SurveyPlan;
  importing: boolean;
  importError: string | null;
  onImport: () => void;
};

const SKIP_LABEL = { zero_emission: "No emissions (walking, cycling)", no_distance: "No distance" } as const;

/** The server's plan: one yearly Category 7 row per mode, calculated by the engine. Nothing is saved until Import. */
export function PlanReview({ result, importing, importError, onImport }: Props) {
  const p = result.plan;
  const s = result.summary;
  return (
    <section aria-label="Import plan" className="space-y-3" data-testid="plan-preview">
      {!p ? (
        <Callout tone="warn" title="Nothing to import">
          No mode in the survey has a distance with emissions.
        </Callout>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm text-muted" aria-live="polite">
              {p.counts.ready} of {p.counts.rows} {p.counts.rows === 1 ? "row" : "rows"} ready · {s.respondents} of {formatNumber(s.total_employees, 0)} employees surveyed ({formatNumber(s.coverage_pct, 1)} %)
            </p>
            <p className="text-lg font-semibold text-ink" data-testid="plan-total">
              {formatEmissions(p.totals.tco2e)}
            </p>
          </div>
          <ul className="divide-y divide-line rounded-control border border-line">
            {p.rows.map((r) => (
              <li key={r.row_ref} className="flex flex-wrap items-start justify-between gap-2 px-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="font-medium text-ink">{r.input.activity_name}</div>
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
          {p.counts.issue > 0 && <p className="text-xs text-muted">Rows that need a fix are left out. Use a mode the commuting form lists (for example Rail, Bus or Car) and create the plan again.</p>}
        </>
      )}
      {s.skipped.length > 0 && (
        <ul className="space-y-1 text-sm" aria-label="Modes without a row">
          {s.skipped.map((k) => (
            <li key={k.mode} className="flex flex-wrap justify-between gap-2">
              <span className="text-ink">{k.mode}</span>
              <span className="text-muted">{SKIP_LABEL[k.reason]}</span>
            </li>
          ))}
        </ul>
      )}
      {p && p.counts.ready > 0 && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {importError && (
            <p role="alert" className="mr-auto text-sm text-bad">
              {importError}
            </p>
          )}
          <Button variant="primary" onClick={onImport} loading={importing}>
            Import {p.counts.ready} {p.counts.ready === 1 ? "row" : "rows"} as Pending
          </Button>
        </div>
      )}
    </section>
  );
}
