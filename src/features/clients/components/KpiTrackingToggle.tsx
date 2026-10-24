import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Toggle, cn, panel, useToast } from "../../../ui";
import { errorMessage, useUpdateCompany } from "../api";
import type { ClientRow } from "../logic";

/**
 * Overview → "KPI tracking" (KPI-1, D2, 05-ux S1). Bound to
 * `company.kpi_tracking_enabled` (default off, Superadmin only). On: the
 * client's Admins choose frameworks and KPIs, their users enter values. Off:
 * nothing KPI is visible or reachable for the client; the values are kept
 * (D3). Turning it off asks first, in the page, not in a browser dialog.
 */
export function KpiTrackingToggle({ row }: { row: ClientRow }) {
  const update = useUpdateCompany();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const confirmRef = useRef<HTMLDivElement>(null);
  const on = row.kpi_tracking_enabled === true;

  // Move focus to the question so keyboard and screen-reader users meet it.
  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  const save = (next: boolean) => {
    setError(null);
    update.mutate(
      { id: row.company_id, data: { kpi_tracking_enabled: next } },
      {
        onSuccess: () => {
          setConfirming(false);
          void qc.invalidateQueries({ queryKey: ["kpi", "status"] });
          toast(
            next
              ? { title: `KPI tracking is on for ${row.name}. Their Admins will see KPI setup.`, tone: "good" }
              : { title: `KPI tracking is off for ${row.name}. Their values are kept.`, tone: "good" },
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

  return (
    <section aria-labelledby="kpi-tracking-title" className={`${panel} space-y-3 p-5`}>
      <div className="space-y-1">
        <h2 id="kpi-tracking-title" className="text-base font-semibold text-ink">
          KPI tracking
        </h2>
        <p className="text-sm text-muted">
          Let this client track ESG KPIs for GRI, BRSR and CSRD (ESRS). Their Admins choose frameworks and KPIs; their users enter values beside their emission data.
        </p>
      </div>
      <Toggle
        label="KPI tracking"
        hideLabel
        checked={on}
        onChange={onChange}
        disabled={update.isPending || confirming}
        error={error}
        inlineLabel={on ? `On. ${row.name}'s people see KPI pages for their role.` : `Off. ${row.name}'s users don't see anything about KPIs.`}
      />
      {confirming && (
        <div
          ref={confirmRef}
          tabIndex={-1}
          role="group"
          aria-labelledby="kpi-tracking-confirm"
          onKeyDown={(e) => {
            if (e.key === "Escape") setConfirming(false);
          }}
          className={cn("space-y-3 rounded-control border border-warn/30 bg-warn-soft p-3 outline-none")}
        >
          <p id="kpi-tracking-confirm" className="text-sm text-ink">
            <span className="font-medium">Hide KPI tracking for {row.name}?</span> Their values are kept and come back if you turn it on again.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" size="sm" loading={update.isPending} onClick={() => save(false)}>
              Hide KPI tracking
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
