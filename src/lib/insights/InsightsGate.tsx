import { type ReactNode, useContext } from "react";
import { Link } from "react-router-dom";
import { Building2, Sparkles } from "lucide-react";
import { EmptyState, SkeletonText, cn, focusRing, panel } from "../../ui";
import { KpiClientPickerContext } from "../kpi/clientPicker";
import { useInsights, useInsightsNeedsClient } from "./switch";

/** What /insights shows a Superadmin before a client is chosen (as KPI, D18). */
export function InsightsChooseClient({ className }: { className?: string }) {
  const picker = useContext(KpiClientPickerContext);
  return (
    <section aria-label="Choose a client" className={cn(panel, "my-6", className)} data-testid="insights-choose-client">
      <EmptyState icon={Building2} title="Choose a client to open its Insights" description="Insights tells one client's story: emissions, targets and ESG data together. Pick the client you're working on." action={picker} />
    </section>
  );
}

/**
 * IN-0 (layer rule 1): what /insights shows while the company's switch is off
 * (a deep link, a bookmark, or a server `IN_OFF` answer).
 */
export function InsightsNotAvailable({ staff = false, home, className }: { staff?: boolean; home?: string | null; className?: string }) {
  const action = home ? (
    <Link to={home} className={cn("inline-flex h-9 items-center rounded-control bg-brand px-3.5 text-sm font-medium text-on-brand hover:opacity-90", focusRing)}>
      {staff ? "Open the client list" : "Go to your home page"}
    </Link>
  ) : null;
  return (
    <section aria-label="Insights" className={cn(panel, "my-6", className)} data-testid="insights-off">
      <EmptyState
        icon={Sparkles}
        title={staff ? "Insights isn't turned on for this client." : "Insights isn't turned on for your company."}
        description={
          staff
            ? "Pick a client with Insights on, or turn it on from the client's Overview tab."
            : "Your ESGLite contact can turn it on. Overview, Targets and your reports are not affected."
        }
        action={action}
      />
    </section>
  );
}

/**
 * IN-0: shows an Insights route only while the company's switch is on;
 * otherwise the "not turned on" state. Waits for the first status answer when
 * the session says off, so a freshly switched-on company doesn't flash it. A
 * Superadmin without a client is asked to choose one first.
 */
export function InsightsGate({ children, staff = false, home }: { children: ReactNode; staff?: boolean; home?: string | null }) {
  const { enabled, checking } = useInsights();
  const needsClient = useInsightsNeedsClient();
  if (needsClient) return <InsightsChooseClient />;
  if (checking)
    return (
      <div className="py-6">
        <SkeletonText lines={4} />
      </div>
    );
  return enabled ? <>{children}</> : <InsightsNotAvailable staff={staff} home={home} />;
}
