import { AlertTriangle, CheckCircle2, Info, type LucideIcon } from "lucide-react";
import { Button, EmptyState, SkeletonText, cn } from "../../../ui";
import type { Rule, RuleState } from "../logic";

const ICON: Record<RuleState, { icon: LucideIcon; className: string; label: string }> = {
  ok: { icon: CheckCircle2, className: "text-good", label: "Met" },
  warn: { icon: AlertTriangle, className: "text-warn", label: "Check" },
  info: { icon: Info, className: "text-info", label: "Note" },
};

/** The SBTi rules, each evaluated against the current setup. */
export function RulesCard(props: { rules: Rule[] | null; loading: boolean; error: string | null; onRetry: () => void; className?: string }) {
  const { rules, loading, error, onRetry, className } = props;
  return (
    <section aria-labelledby="sbti-rules" className={cn("rounded-card border border-line bg-panel p-4", className)}>
      <h2 id="sbti-rules" className="text-sm font-semibold text-ink">
        SBTi rules check
      </h2>
      <p className="mt-0.5 text-xs text-muted">Based on approved base-year emissions for the chosen sites.</p>
      <div className="mt-3">
        {loading ? (
          <SkeletonText lines={5} />
        ) : error ? (
          <EmptyState compact variant="error" title={error} action={<Button size="sm" onClick={onRetry}>Try again</Button>} />
        ) : rules ? (
          <ul className="space-y-3">
            {rules.map((r) => {
              const s = ICON[r.state];
              const Icon = s.icon;
              return (
                <li key={r.id} className="flex gap-2 text-sm" data-rule={r.id} data-state={r.state}>
                  <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", s.className)} />
                  <div className="min-w-0">
                    <p className="font-medium text-ink">
                      <span className="sr-only">{s.label}: </span>
                      {r.title}
                    </p>
                    <p className="text-xs text-muted">{r.detail}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
