import { lazy } from "react";
import type { ModulePages } from "../../routes/pageRegistry";

// S3-0: a placeholder on S3-1's route until its boundary page (boundary/Page.tsx) replaces it.
const Placeholder = lazy(() => import("./Placeholder"));

export const pages: ModulePages = {
  "scope3-boundary": <Placeholder />,
};
