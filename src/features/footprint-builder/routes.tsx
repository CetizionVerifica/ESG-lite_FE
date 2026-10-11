import { lazy } from "react";
import type { ModulePages } from "../../routes/pageRegistry";

const Page = lazy(() => import("./Page"));
const NewPage = lazy(() => import("./NewPage"));

export const pages: ModulePages = {
  "footprint-new": <NewPage />,
  "footprint-builder": <Page />,
};
