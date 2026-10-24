import { Link } from "react-router-dom";
import { FileText, Leaf, LayoutTemplate } from "lucide-react";
import { useDesignStudio } from "../../lib/studio/switch";
import { REPORT_KINDS, type ReportKind } from "../../lib/studio/contracts";
import { Badge, EmptyState, PageHeader, cn, focusRing, panel } from "../../ui";

/**
 * DS-0: the placeholder each studio route shows until its module lands
 * (01-contracts §9: Home and New design DS-5, Brand kit DS-3, Editor DS-6,
 * Page view and Present DS-11, Versions DS-13). Every route already sits
 * behind the switch (RoleGuard → StudioGate).
 */
export function StudioPlaceholder({ title, spec, description }: { title: string; spec: string; description: string }) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />
      <section className={panel} aria-label={title}>
        <EmptyState icon={LayoutTemplate} title={`${title} is being built.`} description={<span className="text-xs">Spec {spec}</span>} />
      </section>
    </div>
  );
}

const KIND_COPY: Record<ReportKind, { title: string; body: string; icon: typeof FileText }> = {
  ghg: { title: "GHG inventory report", body: "Scope 1, 2 and 3 from approved emission entries.", icon: FileText },
  sustainability: { title: "Sustainability report", body: "The annual report from approved KPI values.", icon: Leaf },
};

/**
 * `/studio` until DS-5: the "Start a design" kinds, each available or not
 * (05-ux S10: sustainability needs KPI tracking), and a note that the rest is
 * on its way.
 */
export function StudioHomePlaceholder() {
  const { kinds } = useDesignStudio();
  return (
    <div className="space-y-6">
      <PageHeader title="Design Studio" description="Design GHG and sustainability reports from approved data." />
      <section aria-labelledby="studio-start" className="space-y-3">
        <h2 id="studio-start" className="text-base font-semibold text-ink">
          Start a design
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2">
          {REPORT_KINDS.map((kind) => {
            const copy = KIND_COPY[kind];
            const Icon = copy.icon;
            const on = kinds[kind];
            const body = (
              <>
                <span className="flex items-center gap-2 font-medium text-ink">
                  <Icon aria-hidden className="size-4 text-muted" />
                  {copy.title}
                  {!on && <Badge tone="neutral">Needs KPI tracking</Badge>}
                </span>
                <span className="mt-1 block text-sm text-muted">{copy.body}</span>
              </>
            );
            return (
              <li key={kind} data-testid={`studio-kind-${kind}`}>
                {on ? (
                  <Link to={`/studio/new?kind=${kind}`} className={cn(panel, "block p-4 hover:border-brand", focusRing)}>
                    {body}
                  </Link>
                ) : (
                  <div aria-disabled="true" className={cn(panel, "block p-4 opacity-60")}>
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>
      <section className={panel} aria-label="Recent designs">
        <EmptyState icon={LayoutTemplate} title="Your designs will show here." description={<span className="text-xs">Spec DS-5</span>} compact />
      </section>
    </div>
  );
}
