// DS-7 · registers text editing with the DS-6 shell (called once from
// editor/plugins.ts): the Text drawer, the text/callout toolbar, the in-place
// editor and overflow tags as page overlays, and double-click to edit.
import { TextPanel } from "../../panels/TextPanel";
import { registerDrawer, registerElementEditor, registerPageOverlay, registerToolbar } from "../registry";
import { startEditing } from "./editing";
import { OverflowLayer } from "./OverflowLayer";
import { TextEditOverlay } from "./TextEditOverlay";
import { TextToolbar } from "./TextToolbar";

export function registerTextPlugins(): void {
  registerDrawer("text", TextPanel);
  registerToolbar("text", TextToolbar);
  registerToolbar("callout", TextToolbar);
  registerPageOverlay("ds-7-overflow", OverflowLayer);
  registerPageOverlay("ds-7-text-edit", TextEditOverlay);
  registerElementEditor("text", (target) => startEditing(target));
  registerElementEditor("callout", (target) => startEditing(target));
}
