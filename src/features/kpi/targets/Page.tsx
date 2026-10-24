import { useState } from "react";
import { Link } from "react-router-dom";
import { Pencil, Plus, Target, Trash2 } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import type { KpiTargetWithProgress } from "../../../lib/kpi/contracts";
import { KpiNotAvailable } from "../../../lib/kpi/KpiNotAvailable";
import { isKpiTrackingOff } from "../../../lib/kpi/switch";
import { formatWithUnit } from "../../../lib/kpi/units";
import { Button, EmptyState, Modal, PageHeader, SkeletonText, cn, focusRing, panel, useToast } from "../../../ui";
import { useKpiLookup } from "../components/lookup";
import { Sparkline } from "../components/Sparkline";
import { TargetProgress } from "../components/TargetProgress";
import { kpiErrorMessage, useTargetActions, useTargets } from "./api";
import { TargetDrawer } from "./components/TargetDrawer";
import { statusOf, targetText } from "./logic";

/** Admins (and a Superadmin for a client) set targets; Managers read them. */
const WRITERS = ["Admin", "Superadmin"];

/**
 * KPI-9 `/kpi/targets`: a target per KPI ("cut water withdrawal 20 % by 2030
 * from 2024") with a progress bar, a status and a sparkline. Progress is the
 * server's; the page only shows it.
 */
export default function TargetsPage() {
  const { role } = useAuth();
  const { toast } = useToast();
  const canWrite = !!role && WRITERS.includes(role);
  const targets = useTargets();
  const { lookup, isLoading } = useKpiLookup();
  const { remove } = useTargetActions();
  const [editing, setEditing] = useState<KpiTargetWithProgress | "new" | null>(null);
  const [deleting, setDeleting] = useState<KpiTargetWithProgress | null>(null);

  if (targets.error && isKpiTrackingOff(targets.error)) return (
      <div className="space-y-6 py-6">
        <PageHeader title="KPI targets" />
        <KpiNotAvailable />
      </div>
    );

  const nameOf = (t: KpiTargetWithProgress) => t.kpi_name ?? lookup.definition(t.kpi_definition_id)?.name ?? `KPI ${t.kpi_definition_id}`;
  const unitOf = (t: KpiTargetWithProgress) => t.unit ?? lookup.definition(t.kpi_definition_id)?.canonical_unit ?? null;
  const list = [...(targets.data ?? [])].sort((a, b) => nameOf(a).localeCompare(nameOf(b)));

  return (
    <div className="space-y-6 py-6">
      <PageHeader
        title="KPI targets"
        description="Where each KPI should get to, and how far along it is. Progress uses approved values only."
        primaryAction={canWrite ? { label: "Set a target", icon: <Plus aria-hidden className="size-4" />, onClick: () => setEditing("new") } : undefined}
      />

      {targets.isPending || isLoading ? (
        <section className={cn(panel, "p-5")} aria-busy>
          <SkeletonText lines={6} />
        </section>
      ) : targets.error ? (
        <section className={panel}>
          <EmptyState variant="error" title={kpiErrorMessage(targets.error, "Couldn't load the targets.")} action={<Button onClick={() => void targets.refetch()}>Try again</Button>} />
        </section>
      ) : list.length === 0 ? (
        <section className={panel}>
          <EmptyState
            icon={Target}
            title="No targets yet."
            description={canWrite ? "Set one for any KPI, for example: cut water withdrawn 20 % by 2030 from 2024." : "Your admin sets targets. They show here and on the KPI dashboard."}
            action={canWrite ? <Button variant="primary" onClick={() => setEditing("new")}>Set a target</Button> : undefined}
          />
        </section>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2" aria-label="Targets">
          {list.map((t) => {
            const unit = unitOf(t);
            const name = nameOf(t);
            return (
              <li key={t.id} className={cn(panel, "space-y-3 p-4")} data-testid="kpi-target">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-ink">{name}</h2>
                    <p className="text-xs text-muted">{t.site_id ? (t.site_name ?? lookup.siteName(t.site_id)) : "Whole company"}</p>
                  </div>
                  {canWrite && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" icon={<Pencil aria-hidden className="size-4" />} aria-label={`Edit the target for ${name}`} onClick={() => setEditing(t)}>
                        Edit
                      </Button>
                      <Button size="sm" variant="ghost" icon={<Trash2 aria-hidden className="size-4" />} aria-label={`Delete the target for ${name}`} onClick={() => setDeleting(t)} />
                    </div>
                  )}
                </div>
                <TargetProgress label={targetText(t)} pct={t.progress_pct} status={statusOf(t)} />
                <dl className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="text-muted">Baseline {t.baseline_year}</dt>
                    <dd className="font-num text-ink">{formatWithUnit(t.baseline_value, unit)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">{t.current_year ? `Now (${t.current_year})` : "Now"}</dt>
                    <dd className="font-num text-ink">{formatWithUnit(t.current_value, unit)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">Target {t.target_year}</dt>
                    <dd className="font-num text-ink">{formatWithUnit(t.target_value, unit)}</dd>
                  </div>
                </dl>
                {t.series && t.series.length > 1 && <Sparkline name={name} unit={unit} points={t.series.map((p) => ({ label: String(p.year), value: p.value }))} />}
                {t.note && <p className="text-xs text-muted">{t.note}</p>}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-sm text-muted">
        Progress also shows on the{" "}
        <Link to="/kpi/dashboard" className={cn("rounded-chip text-brand-text underline", focusRing)}>
          KPI dashboard
        </Link>
        .
      </p>

      {editing && <TargetDrawer target={editing === "new" ? null : editing} lookup={lookup} onClose={() => setEditing(null)} onSaved={(title) => toast({ title, tone: "good" })} />}
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        tone="destructive"
        title={deleting ? `Delete the target for ${nameOf(deleting)}?` : "Delete target"}
        description="The KPI and its values stay. Only the target and its progress go."
        error={remove.isError ? kpiErrorMessage(remove.error, "Couldn't delete it. Try again.") : null}
        primaryAction={{
          label: "Delete target",
          loading: remove.isPending,
          onClick: () =>
            deleting &&
            remove.mutate(deleting.id, {
              onSuccess: () => {
                setDeleting(null);
                toast({ title: "Target deleted" });
              },
            }),
        }}
      />
    </div>
  );
}
