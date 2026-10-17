import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { BarChart3 } from "lucide-react";
import { EmptyState, cn, focusRing, panel } from "../../ui";

/**
 * KPI-1: what a KPI page shows when the company's switch is off — a deep
 * link, a bookmark, or a server `KPI_TRACKING_OFF` answer. Plain words, one
 * way on (src/features/kpi/CLAUDE.md rule 1).
 */
export function KpiNotAvailable({ staff = false, home, className }: { staff?: boolean; home?: string | null; className?: string }) {
  let action: ReactNode = null;
  if (home) {
    action = (
      <Link
        to={home}
        className={cn("inline-flex h-9 items-center rounded-control bg-brand px-3.5 text-sm font-medium text-on-brand hover:opacity-90", focusRing)}
      >
        {staff ? "Open the client list" : "Go to your home page"}
      </Link>
    );
  }
  return (
    <section aria-label="KPI tracking" className={cn(panel, "my-6", className)}>
      <EmptyState
        icon={BarChart3}
        title={staff ? "KPI tracking isn't turned on for this client." : "KPI tracking isn't turned on for your company."}
        description={
          staff
            ? "Pick a client with KPI tracking on, or turn it on from the client's Overview tab."
            : "Your ESGLite contact can turn it on. Nothing you entered elsewhere is affected."
        }
        action={action}
      />
    </section>
  );
}
