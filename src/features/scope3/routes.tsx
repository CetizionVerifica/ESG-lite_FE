import { lazy } from "react";
import type { ModulePages } from "../../routes/pageRegistry";

// Scope 3 pages. STAND-IN written by S3-1 ahead of S3-0, which owns this file;
// when S3-0 merges, keep its version and the scope3-boundary line below.
const BoundaryPage = lazy(() => import("./boundary/Page"));
const InvestmentsPage = lazy(() => import("./assets/Page")); // S3-11

export const pages: ModulePages = {
  "scope3-boundary": <BoundaryPage />,
  "scope3-investments": <InvestmentsPage />, // S3-11
};
