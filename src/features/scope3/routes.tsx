import { lazy } from "react";
import type { ModulePages } from "../../routes/pageRegistry";

// Scope 3 pages (S3-0 owns this file; each module adds its own line).
const BoundaryPage = lazy(() => import("./boundary/Page")); // S3-1
const InvestmentsPage = lazy(() => import("./assets/Page")); // S3-11
const CommutingPage = lazy(() => import("./commuting/Page")); // S3-9
const SoldProductsPage = lazy(() => import("./soldProducts/Page")); // S3-10
const SuppliersPage = lazy(() => import("./suppliers/Page")); // S3-6

export const pages: ModulePages = {
  "scope3-boundary": <BoundaryPage />,
  "scope3-investments": <InvestmentsPage />, // S3-11
  "scope3-commuting": <CommutingPage />, // S3-9
  "scope3-sold-products": <SoldProductsPage />, // S3-10
  "scope3-suppliers": <SuppliersPage />, // S3-6
};
