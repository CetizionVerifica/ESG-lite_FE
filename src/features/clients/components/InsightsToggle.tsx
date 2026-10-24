import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Toggle, cn, panel, useToast } from "../../../ui";
import { errorMessage, useUpdateCompany } from "../api";
import type { ClientRow } from "../logic";

/**
 * Overview → "Insights" (IN-0, I2). Bound to `company.insights_enabled`
 * (default off, Superadmin only). On: the client's Managers and Admins see
 * one Insights page joining emissions, targets and (with KPI tracking) ESG
 * data. Off: nothing about Insights is visible or reachable; timeline events
 * are kept. Turning it off asks first, in the page.
 */
export function InsightsToggle({ row }: { row: ClientRow }) {
  const update = useUpdateCompany();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const confirmRef = useRef<HTMLDivElement>(null);
  const on = row.insights_enabled === true;
  const kpiOn = row.kpi_tracking_enabled === true;

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  const save = (next: boolean) => {
    setError(null);
    update.mutate(
      { id: row.company_id, data: { insights_enabled: next } },
      {
        onSuccess: () => {
          setConfirming(false);
          void qc.invalidateQueries({ queryKey: ["insights", "status"] });
          toast(
            next
              ? { title: `Insights is on for ${row.name}. Their Managers and Admins will see it under Overview.`, tone: "good" }
              : { title: `Insights is off for ${row.name}. Their timeline events are kept.`, tone: "good" },
          );
        },
        onError: (e) => setError(errorMessage(e, "The switch wasn't changed. Try again.")),
      },
    );
  };

  const onChange = (next: boolean) => {
    if (next) save(true);
    else setConfirming(true);
  };

  let state = `Off. ${row.name}'s people don't see Insights.`;
  if (on) state = kpiOn ? `On. ${row.name} sees emissions, targets and ESG data together.` : `On. ${row.name} sees emissions and targets. ESG panels also need KPI tracking.`;

  return (
    <section aria-labelledby="insights-title" className={`${panel} space-y-3 p-5`} data-testid="insights-toggle">
      <div className="space-y-1">
        <h2 id="insights-title" className="text-base font-semibold text-ink">
          Insights
        </h2>
        <p className="text-sm text-muted">
          One page that tells this client's story: whether emissions are on track, why they moved, how ready their ESG data is and what needs them next. Every number comes from approved data.
        </p>
      </div>
      <Toggle label="Insights" hideLabel checked={on} onChange={onChange} disabled={update.isPending || confirming} error={error} inlineLabel={state} />
      {confirming && (
        <div
          ref={confirmRef}
          tabIndex={-1}
          role="group"
          aria-labelledby="insights-confirm"
          onKeyDown={(e) => {
            if (e.key === "Escape") setConfirming(false);
          }}
          className={cn("space-y-3 rounded-control border border-warn/30 bg-warn-soft p-3 outline-none")}
        >
          <p id="insights-confirm" className="text-sm text-ink">
            <span className="font-medium">Hide Insights for {row.name}?</span> Their timeline events are kept and come back if you turn it on again.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" size="sm" loading={update.isPending} onClick={() => save(false)}>
              Hide Insights
            </Button>
            <Button variant="secondary" size="sm" disabled={update.isPending} onClick={() => setConfirming(false)}>
              Keep it on
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
