import { Construction } from "lucide-react";
import { EmptyState, PageHeader, cn, panel } from "../../../ui";

/**
 * A KPI page whose module isn't built yet (KPI-1). It only shows while the
 * company's switch is on: the route guard shows "not available" otherwise.
 */
export function ComingSoon({ title, description, what }: { title: string; description: string; what: string }) {
  return (
    <div className="space-y-6 py-6">
      <PageHeader title={title} description={description} />
      <section aria-label={title} className={cn(panel)}>
        <EmptyState icon={Construction} title={`${what} is coming in the next build step.`} description="This page fills in as the next part of KPI tracking lands." />
      </section>
    </div>
  );
}
