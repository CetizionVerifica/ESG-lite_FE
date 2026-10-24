// DS-9 · registers the AI assistant with the DS-6 shell (called once from
// editor/plugins.ts): the AI drawer, "AI ▾" on the text toolbar (DS-7 slot),
// the chart toolbar's "Suggest a title" (DS-8 hook) and the ghost preview
// overlay.
import { registerTitleSuggester } from "../editor/charts/store";
import { registerDrawer, registerPageOverlay } from "../editor/registry";
import { registerTextToolbarItem } from "../editor/text/toolbarSlots";
import { AiPanel } from "./AiPanel";
import { AiRewriteMenu } from "./AiRewriteMenu";
import { GhostPreview } from "./GhostPreview";
import { requestAi } from "./store";

export function registerAiPlugins(): void {
  registerDrawer("ai", AiPanel);
  registerTextToolbarItem("ai", AiRewriteMenu);
  registerTitleSuggester(({ docId, pageId, elementId }) => requestAi(docId, "Suggest a title for this chart", { action: "chart_title", target: { pageId, elementId } }));
  registerPageOverlay("ds-9-ai-ghost", GhostPreview);
}
