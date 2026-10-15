import { lazy } from "react";
import type { ModulePages } from "../../routes/pageRegistry";

// Scope 3 pages. STAND-IN written by S3-1 ahead of S3-0, which owns this file;
// when S3-0 merges, keep its version and the scope3-boundary line below.
const BoundaryPage = lazy(() => import("./boundary/Page"));

export const pages: ModulePages = {
  "scope3-boundary": <BoundaryPage />,
};
