// PE-2 · registers text effects, per-box fonts and find and replace with the
// editor (called once from editor/plugins.ts): Font and Effects on the text
// toolbar (DS-7 slots), "Find and replace" on the text and page toolbars.
// ⌘⇧F is in editor/shortcuts.ts; the panel is drawn by FindReplaceHost.
import { registerToolbar } from "../editor/registry";
import { registerTextToolbarItem } from "../editor/text/toolbarSlots";
import { FindButton, PageToolbarWithFind } from "../find/FindButton";
import { EffectsButton } from "./EffectsButton";
import { FontPicker } from "./FontPicker";

export function registerProTextPlugins(): void {
  registerTextToolbarItem("pe-2-font", FontPicker);
  registerTextToolbarItem("pe-2-effects", EffectsButton);
  registerTextToolbarItem("pe-2-find", FindButton);
  registerToolbar("page", PageToolbarWithFind);
}
