import { lazy } from "react";
import type { ModulePages } from "../../routes/pageRegistry";

// Scope 3 pages (S3-0 owns this file; each module adds its own line).
const BoundaryPage = lazy(() => import("./boundary/Page")); // S3-1
const InvestmentsPage = lazy(() => import("./assets/Page")); // S3-11
const CommutingPage = lazy(() => import("./commuting/Page")); // S3-9

export const pages: ModulePages = {
  "scope3-boundary": <BoundaryPage />,
  "scope3-investments": <InvestmentsPage />, // S3-11
  "scope3-commuting": <CommutingPage />, // S3-9
};
