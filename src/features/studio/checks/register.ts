// DS-12 · the checks' editor plug-ins: the page markers (an overlay on every
// free-form page). The counter (TopBar) and the panel (Editor) are one line each.
import { registerPageOverlay } from "../editor/registry";
import { ChecksLayer } from "./ChecksLayer";

export function registerChecksPlugins(): void {
  registerPageOverlay("ds-12-checks", ChecksLayer);
}
