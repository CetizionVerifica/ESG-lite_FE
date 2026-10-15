import { lazy } from "react";
import type { ModulePages } from "../../routes/pageRegistry";

// S3-0: a placeholder until S3-1 builds the boundary page (boundary/Page.tsx).
const Placeholder = lazy(() => import("./Placeholder"));

export const pages: ModulePages = {
  scope3: <Placeholder />,
};
