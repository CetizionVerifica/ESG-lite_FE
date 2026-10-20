import { type ReactNode, useContext } from "react";
import { Link } from "react-router-dom";
import { Building2, LayoutTemplate } from "lucide-react";
import { EmptyState, SkeletonText, cn, focusRing, panel } from "../../ui";
import { KpiClientPickerContext } from "../kpi/clientPicker";
import { useDesignStudio, useStudioNeedsClient } from "./switch";

/** What a studio page shows a Superadmin before a client is chosen (as KPI, D18). */
export function StudioChooseClient({ className }: { className?: string }) {
  const picker = useContext(KpiClientPickerContext);
  return (
    <section aria-label="Choose a client" className={cn(panel, "my-6", className)} data-testid="studio-choose-client">
      <EmptyState icon={Building2} title="Choose a client to open its Design Studio" description="Designs, templates and the brand kit belong to one client. Pick the client you're working on." action={picker} />
    </section>
  );
}

/**
 * DS-0 (05-ux S10): what a studio page shows while the company's switch is off
 * (a deep link, a bookmark, or a server `DS_STUDIO_OFF` answer).
 */
export function StudioNotAvailable({ staff = false, home, className }: { staff?: boolean; home?: string | null; className?: string }) {
  const action = home ? (
    <Link to={home} className={cn("inline-flex h-9 items-center rounded-control bg-brand px-3.5 text-sm font-medium text-on-brand hover:opacity-90", focusRing)}>
      {staff ? "Open the client list" : "Go to your home page"}
    </Link>
  ) : null;
  return (
    <section aria-label="Design Studio" className={cn(panel, "my-6", className)}>
      <EmptyState
        icon={LayoutTemplate}
        title={staff ? "Design Studio isn't turned on for this client." : "Design Studio isn't turned on for your company."}
        description={
          staff
            ? "Pick a client with Design Studio on, or turn it on from the client's Overview tab."
            : "Your ESGLite contact can turn it on. Your GHG report and other reports are not affected."
        }
        action={action}
      />
    </section>
  );
}

/**
 * DS-0: shows a studio route only while the company's switch is on; otherwise
 * the "not available" state. Waits for the first status answer when the
 * session says off, so a freshly switched-on company doesn't flash it. A
 * Superadmin without a client is asked to choose one first.
 */
export function StudioGate({ children, staff = false, home }: { children: ReactNode; staff?: boolean; home?: string | null }) {
  const { enabled, checking } = useDesignStudio();
  const needsClient = useStudioNeedsClient();
  if (needsClient) return <StudioChooseClient />;
  if (checking)
    return (
      <div className="py-6">
        <SkeletonText lines={4} />
      </div>
    );
  return enabled ? <>{children}</> : <StudioNotAvailable staff={staff} home={home} />;
}
