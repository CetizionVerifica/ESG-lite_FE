import type { ReactNode } from "react";
import { SkeletonText } from "../../ui";
import { KpiNotAvailable } from "./KpiNotAvailable";
import { useKpiTrackingState } from "./switch";

/**
 * KPI-1: shows a KPI route only while the company's switch is on; otherwise
 * the "not available" state. Waits for the first status answer when the
 * session says off, so a freshly switched-on company doesn't flash it.
 */
export function KpiGate({ children, staff = false, home }: { children: ReactNode; staff?: boolean; home?: string | null }) {
  const { on, checking } = useKpiTrackingState();
  if (checking)
    return (
      <div className="py-6">
        <SkeletonText lines={4} />
      </div>
    );
  return on ? <>{children}</> : <KpiNotAvailable staff={staff} home={home} />;
}
