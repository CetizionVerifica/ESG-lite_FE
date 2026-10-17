import { ExternalLink } from "lucide-react";
import { REQUIREMENT_LABEL } from "../../../../lib/kpi/labels";
import type { KpiFramework } from "../../../../lib/kpi/contracts";
import { Badge, EmptyState, SegmentedControl, cn, focusRing, panel } from "../../../../ui";
import { type Library, coverageText, frameworkCoverage } from "../logic";

/**
 * KPI-2 · Disclosures of one framework version, grouped by section, with how
 * many a KPI answers ("E1 Climate change · 2 of 4 mapped"). Unmapped
 * disclosures are marked so the Superadmin sees what's missing.
 */
export function DisclosuresView({
  library,
  frameworkId,
  onFramework,
  onOpenKpi,
}: {
  library: Library;
  frameworkId: number | null;
  onFramework: (id: number) => void;
  onOpenKpi: (id: number) => void;
}) {
  const frameworks = library.frameworks;
  if (!frameworks.length) return <EmptyState title="No frameworks in the library yet." description="Frameworks are added by the library seed or a KPI-0 follow-up." />;
  const framework: KpiFramework = frameworks.find((f) => f.id === frameworkId) ?? frameworks[0];
  const c = frameworkCoverage(framework, library);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl<string>
          label="Framework version"
          value={String(framework.id)}
          onChange={(v) => onFramework(Number(v))}
          options={frameworks.map((f) => ({ value: String(f.id), label: f.version }))}
        />
        <p className="text-sm text-muted">
          <span className="font-medium text-ink">{framework.name}</span> · {c.mapped} of {c.total} disclosures have a KPI ·{" "}
          <a href={framework.source_url} target="_blank" rel="noreferrer" className={cn("inline-flex items-center gap-1 text-brand-text underline-offset-2 hover:underline", focusRing)}>
            Official source
            <ExternalLink size={12} aria-hidden />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        </p>
      </div>

      {c.sections.length === 0 && (
        <section className={panel}>
          <EmptyState title={`${framework.version} has no disclosures yet.`} description="Add its disclosures, then map KPIs to them." />
        </section>
      )}

      {c.sections.map((s) => (
        <section key={s.section} aria-label={s.section} className={cn(panel, "p-4")}>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-ink">{s.section}</h3>
            <Badge tone={s.mapped === s.total ? "good" : "warn"}>{coverageText(s)}</Badge>
          </div>
          <ul className="divide-y divide-line">
            {s.disclosures.map(({ disclosure: d, kpis }) => (
              <li key={d.id} className={cn("flex flex-wrap items-start gap-x-3 gap-y-1 px-2 py-2", !kpis.length && "rounded-control bg-warn-soft")}>
                <span className="w-16 shrink-0 font-mono text-xs leading-5 text-muted">{d.code}</span>
                <span className="min-w-0 flex-1 basis-48 text-sm text-ink">
                  {d.title}
                  {d.requirement !== "required" && (
                    <Badge tone={d.requirement === "core" ? "brand" : "neutral"} className="ml-2">
                      {REQUIREMENT_LABEL[d.requirement]}
                    </Badge>
                  )}
                </span>
                <span className="flex flex-wrap gap-1">
                  {kpis.length ? (
                    kpis.map((k) => (
                      <button
                        key={k.id}
                        type="button"
                        onClick={() => onOpenKpi(k.id)}
                        className={cn("rounded-chip bg-tint px-1.5 py-0.5 text-xs text-brand-text hover:underline", focusRing)}
                      >
                        {k.name}
                      </button>
                    ))
                  ) : (
                    <Badge tone="warn">Not mapped</Badge>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
