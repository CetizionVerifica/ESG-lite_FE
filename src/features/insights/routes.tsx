import { lazy, Suspense } from "react";
import type { ModulePages } from "../../routes/pageRegistry";
import { SkeletonText } from "../../ui";

const InsightsPage = lazy(() => import("./Page"));
const PresentPage = lazy(() => import("./present/PresentPage"));
const PrintPage = lazy(() => import("./present/PrintPage"));
const fallback = <SkeletonText lines={6} className="py-6" />;

// Insights pages (IN-0 owns this file). Both sit behind the switch
// (RoleGuard → InsightsGate). IN-8: present mode and the print route for the PDF snapshot.
export const pages: ModulePages = {
  insights: (
    <Suspense fallback={<SkeletonText lines={6} className="py-6" />}>
      <InsightsPage />
    </Suspense>
  ),
  "insights-present": (
    <Suspense fallback={fallback}>
      <PresentPage />
    </Suspense>
  ), // IN-8
  "insights-print": (
    <Suspense fallback={fallback}>
      <PrintPage />
    </Suspense>
  ), // IN-8
};
