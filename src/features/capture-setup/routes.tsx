import { lazy } from "react";
import type { ModulePages } from "../../routes/pageRegistry";

const FormsPage = lazy(() => import("./FormsPage"));
const ColumnsPage = lazy(() => import("./ColumnsPage"));

export const pages: ModulePages = {
  "capture-forms": <FormsPage />,
  "capture-columns": <ColumnsPage />,
};
