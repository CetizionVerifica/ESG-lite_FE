import { lazy } from "react";
import type { ModulePages } from "../../routes/pageRegistry";

const ColumnsPage = lazy(() => import("./ColumnsPage"));

// The forms list (FormsPage) is registered with the form builder in part 2, so
// /capture/forms stays on the legacy page until forms can be edited in the new UI.
export const pages: ModulePages = {
  "capture-columns": <ColumnsPage />,
};
