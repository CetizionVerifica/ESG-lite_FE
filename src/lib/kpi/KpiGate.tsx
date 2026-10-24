import { type ReactNode, useContext } from "react";
import { Building2 } from "lucide-react";
import { EmptyState, SkeletonText, cn, panel } from "../../ui";
import { KpiClientPickerContext } from "./clientPicker";
import { KpiNotAvailable } from "./KpiNotAvailable";
import { useKpiNeedsClient, useKpiTrackingState } from "./switch";


/** D18: what a KPI page shows a Superadmin before a client is chosen. Never a broken or empty page. */
export function KpiChooseClient({ className }: { className?: string }) {
  const picker = useContext(KpiClientPickerContext);
  return (
    <section aria-label="Choose a client" className={cn(panel, "my-6", className)} data-testid="kpi-choose-client">
      <EmptyState icon={Building2} title="Choose a client to see its KPIs" description="KPI setup, targets, reviews and reports belong to one client. Pick the client you're working on." action={picker} />
    </section>
  );
}

/**
 * KPI-1: shows a KPI route only while the company's switch is on; otherwise
 * the "not available" state. Waits for the first status answer when the
 * session says off, so a freshly switched-on company doesn't flash it. A
 * Superadmin without a client is asked to choose one first (D18).
 */
export function KpiGate({ children, staff = false, home }: { children: ReactNode; staff?: boolean; home?: string | null }) {
  const { on, checking } = useKpiTrackingState();
  const needsClient = useKpiNeedsClient();
  if (needsClient) return <KpiChooseClient />;
  if (checking)
    return (
      <div className="py-6">
        <SkeletonText lines={4} />
      </div>
    );
  return on ? <>{children}</> : <KpiNotAvailable staff={staff} home={home} />;
}
