import type { ReportDoc } from "../../../lib/studio/contracts";

/**
 * What a drawer panel gets from the editor shell (DS-6 `registerDrawer`).
 * DS-3 panels need only these; every edit goes through `commit` (one history
 * step, undoable) and hover previews through `preview` (null clears it).
 */
export interface StudioPanelProps {
  doc: ReportDoc;
  /** The page in view (freeform pages take logos and colours). */
  pageId: string | null;
  /** Selected element ids on that page. */
  selection: string[];
  commit: (next: ReportDoc, label: string) => void;
  preview?: (next: ReportDoc | null) => void;
}
