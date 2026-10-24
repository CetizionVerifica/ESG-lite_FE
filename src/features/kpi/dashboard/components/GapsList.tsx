import { useState } from "react";
import { Link } from "react-router-dom";
import { BellRing, CheckCircle2 } from "lucide-react";
import { useAuth } from "../../../../context/AuthContext";
import type { FrameworkCode, KpiGap } from "../../../../lib/kpi/contracts";
import { FRAMEWORK_LABEL } from "../../../../lib/kpi/labels";
import { Button, EmptyState, cn, focusRing, panel, useToast } from "../../../../ui";
import { kpiErrorMessage, useRemind } from "../api";
import { gapLink, missingText } from "../logic";

const key = (g: KpiGap) => `${g.kpi_definition_id}:${g.site_id ?? "c"}`;

/**
 * KPI-10 · "What's missing": each gap with its site, the missing periods and
 * who owes it, with Remind (once a day per item, server-side) and Open.
 */
export function GapsList({ gaps, framework, siteName }: { gaps: KpiGap[]; framework: FrameworkCode | null; siteName: (id: number | null) => string }) {
  const { role } = useAuth();
  const { toast } = useToast();
  const remind = useRemind();
  const [sent, setSent] = useState<Set<string>>(new Set());

  const ask = (g: KpiGap) =>
    remind.mutate(
      { kpi: g.kpi_definition_id, site: g.site_id },
      {
        onSuccess: (r) => {
          setSent((s) => new Set(s).add(key(g)));
          const who = r.owner_name ?? g.owner_name ?? "The owner";
          toast(r.reminded ? { title: `Reminder sent to ${who}`, description: `${g.kpi_name}: ${missingText(g)}.`, tone: "good" } : { title: `${who} was already reminded today`, description: r.message ?? "One reminder a day per KPI and site." });
        },
        onError: (e) => toast({ title: "Couldn't send the reminder", description: kpiErrorMessage(e, "Try again in a moment."), tone: "bad" }),
      },
    );

  return (
    <section aria-labelledby="kpi-gaps-heading" className={cn(panel, "overflow-hidden")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4">
        <h2 id="kpi-gaps-heading" className="text-sm font-semibold text-ink">
          What's missing
        </h2>
        <span className="text-xs text-muted" data-testid="kpi-gaps-filter">
          {framework ? `${FRAMEWORK_LABEL[framework]} only` : "All frameworks"}
        </span>
      </div>
      {gaps.length === 0 ? (
        <EmptyState icon={CheckCircle2} compact title={framework ? `Nothing missing for ${FRAMEWORK_LABEL[framework]}.` : "Nothing missing. Every KPI is in for the year so far."} />
      ) : (
        <ul className="mt-2 divide-y divide-line" aria-label="What's missing">
          {gaps.map((g) => {
            const link = gapLink(g, role);
            const where = g.site_name ?? siteName(g.site_id);
            return (
              <li key={key(g)} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3" data-testid="kpi-gap">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{g.kpi_name}</p>
                  <p className="text-xs text-muted">
                    {where} · {missingText(g)}
                    {g.owner_name ? ` · owed by ${g.owner_name}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  {!g.pending && (
                    <Button
                      size="sm"
                      icon={<BellRing aria-hidden className="size-4" />}
                      disabled={sent.has(key(g))}
                      loading={remind.isPending && remind.variables?.kpi === g.kpi_definition_id && remind.variables?.site === g.site_id}
                      aria-label={`Remind ${g.owner_name ?? "the owner"} about ${g.kpi_name} at ${where}`}
                      onClick={() => ask(g)}
                    >
                      {sent.has(key(g)) ? "Reminded" : "Remind"}
                    </Button>
                  )}
                  {link && (
                    <Link to={link} aria-label={`Open ${g.kpi_name} at ${where}`} className={cn("inline-flex h-8 items-center rounded-control px-2.5 text-xs font-medium text-ink hover:bg-tint", focusRing)}>
                      Open
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
