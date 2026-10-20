import { lazy, Suspense } from "react";
import type { ModulePages } from "../../routes/pageRegistry";
import { SkeletonText } from "../../ui";
import { PresentPlaceholder } from "./present/PresentPlaceholder";

const InsightsPage = lazy(() => import("./Page"));

// Insights pages (IN-0 owns this file). Both sit behind the switch
// (RoleGuard → InsightsGate). IN-8 swaps the present placeholder with one line.
export const pages: ModulePages = {
  insights: (
    <Suspense fallback={<SkeletonText lines={6} className="py-6" />}>
      <InsightsPage />
    </Suspense>
  ),
  "insights-present": <PresentPlaceholder />, // IN-8
};
