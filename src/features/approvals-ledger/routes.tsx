import { lazy } from "react";
import type { ModulePages } from "../../routes/pageRegistry";

const Page = lazy(() => import("./Page"));

export const pages: ModulePages = {
  // Keyed so switching tabs remounts: each tab starts from its own defaults.
  approvals: <Page key="approvals" tab="approvals" />,
  ledger: <Page key="ledger" tab="ledger" />,
};
