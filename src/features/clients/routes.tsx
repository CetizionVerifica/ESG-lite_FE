import { lazy } from "react";
import type { ModulePages } from "../../routes/pageRegistry";

const Page = lazy(() => import("./Page"));
const DetailPage = lazy(() => import("./DetailPage"));

export const pages: ModulePages = {
  clients: <Page />,
  "client-detail": <DetailPage />,
};
