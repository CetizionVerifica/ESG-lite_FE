import type { ModulePages } from "../../routes/pageRegistry";
import { StudioHomePlaceholder, StudioPlaceholder } from "./StudioPlaceholder";
import { BrandKitPage } from "./brand-kit/Page"; // DS-3

// Design Studio pages (DS-0 owns this file; each module swaps its placeholder
// for its page with one line, `// DS-n`). Every page sits behind the switch
// (RoleGuard → StudioGate); sustainability designs also check KPI tracking.
export const pages: ModulePages = {
  "studio-home": <StudioHomePlaceholder />, // DS-5
  "studio-new": <StudioPlaceholder title="New design" spec="DS-5" description="Pick a template, the year and sites, then build." />, // DS-5
  "studio-brand-kit": <BrandKitPage />, // DS-3
  "studio-editor": <StudioPlaceholder title="Design" spec="DS-6" description="The editor opens here." />, // DS-6
  "studio-preview": <StudioPlaceholder title="Page view" spec="DS-11" description="Every page as it will print, and the PDF proof." />, // DS-11
  "studio-present": <StudioPlaceholder title="Present" spec="DS-11" description="Full-screen pages with speaker notes." />, // DS-11
  "studio-versions": <StudioPlaceholder title="Versions" spec="DS-13" description="Versions, history, approvals and share links." />, // DS-13
};
