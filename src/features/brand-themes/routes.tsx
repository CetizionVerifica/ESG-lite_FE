import { lazy } from "react";
import type { ModulePages } from "../../routes/pageRegistry";

const BrandThemesPage = lazy(() => import("./Page"));
const BrandViewPage = lazy(() => import("./Page").then((m) => ({ default: m.BrandViewPage })));

export const pages: ModulePages = {
  "brand-themes": <BrandThemesPage />,
  "brand-view": <BrandViewPage />,
};
