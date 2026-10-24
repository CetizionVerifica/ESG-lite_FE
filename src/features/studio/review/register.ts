// DS-13 · the review plug-ins of the editor: C + click drops a pin and opens
// the comment box there (registerCommentHandler), and saved threads show as
// pins on their pages (a page overlay). The Comments button, the approval bar
// and the review panel are one line each in TopBar / Editor.
import { registerCommentHandler, registerPageOverlay } from "../editor/registry";
import { CommentPins } from "./CommentPins";
import { openReview } from "./store";

export function registerReviewPlugins(): void {
  registerCommentHandler((pin, editor) => {
    editor.openDrawer(null);
    openReview(pin.docId, { pin: { pageId: pin.pageId, elementId: pin.elementId, x: Math.round(pin.x * 10) / 10, y: Math.round(pin.y * 10) / 10 } });
  });
  registerPageOverlay("ds-13-comment-pins", CommentPins);
}
