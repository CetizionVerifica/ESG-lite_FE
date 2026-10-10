import { lazy } from "react";
import type { ModulePages } from "../../routes/pageRegistry";

const Page = lazy(() => import("./Page"));

export const pages: ModulePages = {
  products: <Page />,
};
