import type { ModulePages } from "../../routes/pageRegistry";
import { StudioPlaceholder } from "./StudioPlaceholder";
import { BrandKitPage } from "./brand-kit/Page"; // DS-3
import { StudioHomePage } from "./home/HomePage"; // DS-5
import { NewDesignPage } from "./new/NewDesignPage"; // DS-5
import { EditorPage } from "./editor/EditorPage"; // DS-6
import { PreviewPage } from "./preview/PreviewPage"; // DS-11
import { PresentPage } from "./present/PresentPage"; // DS-11

// Design Studio pages (DS-0 owns this file; each module swaps its placeholder
// for its page with one line, `// DS-n`). Every page sits behind the switch
// (RoleGuard → StudioGate); sustainability designs also check KPI tracking.
export const pages: ModulePages = {
  "studio-home": <StudioHomePage />, // DS-5
  "studio-new": <NewDesignPage />, // DS-5
  "studio-brand-kit": <BrandKitPage />, // DS-3
  "studio-editor": <EditorPage />, // DS-6 (replaces DS-5's read-only shell)
  "studio-preview": <PreviewPage />, // DS-11
  "studio-present": <PresentPage />, // DS-11
  "studio-versions": <StudioPlaceholder title="Versions" spec="DS-13" description="Versions, history, approvals and share links." />, // DS-13
};
