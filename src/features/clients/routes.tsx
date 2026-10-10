import { lazy } from "react";
import type { ModulePages } from "../../routes/pageRegistry";

const Page = lazy(() => import("./Page"));
const DetailPage = lazy(() => import("./DetailPage"));
const OnboardPage = lazy(() => import("./OnboardPage"));

export const pages: ModulePages = {
  clients: <Page />,
  "client-new": <OnboardPage />,
  "client-detail": <DetailPage />,
};
