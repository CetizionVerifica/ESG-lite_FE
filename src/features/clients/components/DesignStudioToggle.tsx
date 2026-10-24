import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button, Toggle, cn, panel, useToast } from "../../../ui";
import { errorMessage, useUpdateCompany } from "../api";
import type { ClientRow } from "../logic";

/**
 * Overview → "Design Studio" (DS-0, D4). Bound to
 * `company.design_studio_enabled` (default off, Superadmin only). On: the
 * client's Admins and Managers design GHG reports, and sustainability reports
 * too while KPI tracking is on. Off: nothing about the studio is visible or
 * reachable; designs are kept. Turning it off asks first, in the page.
 */
export function DesignStudioToggle({ row }: { row: ClientRow }) {
  const update = useUpdateCompany();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const confirmRef = useRef<HTMLDivElement>(null);
  const on = row.design_studio_enabled === true;
  const kpiOn = row.kpi_tracking_enabled === true;

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  const save = (next: boolean) => {
    setError(null);
    update.mutate(
      { id: row.company_id, data: { design_studio_enabled: next } },
      {
        onSuccess: () => {
          setConfirming(false);
          void qc.invalidateQueries({ queryKey: ["studio", "status"] });
          toast(
            next
              ? { title: `Design Studio is on for ${row.name}. Their Admins and Managers will see it under Reports.`, tone: "good" }
              : { title: `Design Studio is off for ${row.name}. Their designs are kept.`, tone: "good" },
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

  let state = `Off. ${row.name}'s people don't see Design Studio.`;
  if (on) state = kpiOn ? `On. ${row.name} can design GHG and sustainability reports.` : `On. ${row.name} can design GHG reports. Sustainability reports also need KPI tracking.`;

  return (
    <section aria-labelledby="design-studio-title" className={`${panel} space-y-3 p-5`}>
      <div className="space-y-1">
        <h2 id="design-studio-title" className="text-base font-semibold text-ink">
          Design Studio
        </h2>
        <p className="text-sm text-muted">
          Let this client's Admins and Managers design GHG and sustainability reports from approved data, with templates, their brand and a PDF they can share.
        </p>
      </div>
      <Toggle
        label="Design Studio"
        hideLabel
        checked={on}
        onChange={onChange}
        disabled={update.isPending || confirming}
        error={error}
        inlineLabel={state}
      />
      {confirming && (
        <div
          ref={confirmRef}
          tabIndex={-1}
          role="group"
          aria-labelledby="design-studio-confirm"
          onKeyDown={(e) => {
            if (e.key === "Escape") setConfirming(false);
          }}
          className={cn("space-y-3 rounded-control border border-warn/30 bg-warn-soft p-3 outline-none")}
        >
          <p id="design-studio-confirm" className="text-sm text-ink">
            <span className="font-medium">Hide Design Studio for {row.name}?</span> Their designs are kept and come back if you turn it on again.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" size="sm" loading={update.isPending} onClick={() => save(false)}>
              Hide Design Studio
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
