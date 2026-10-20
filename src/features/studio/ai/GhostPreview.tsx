// DS-9 · the ghost preview on the page (05-ux S4, mockup "AI"): while a card's
// "Preview on page" is on, the sheet draws the suggestion (the editor's preview
// doc) and this overlay outlines what would change, tagged "Preview: not
// applied yet". Registered as a page overlay; it also keeps the editor API for
// toolbar items outside the drawer (store.ts bridge).
import { useEffect } from "react";
import { Sparkles } from "lucide-react";
import { useEditor } from "../editor/EditorContext";
import { scaleOf } from "../editor/canvasUtil";
import type { PageOverlayProps } from "../editor/registry";
import { setEditorBridge, useGhost } from "./store";

export function GhostPreview({ page, zoom }: PageOverlayProps) {
  const editor = useEditor();
  const ghost = useGhost();
  useEffect(() => {
    setEditorBridge(editor);
  }, [editor]);
  useEffect(() => () => setEditorBridge(null), []);
  if (!ghost || ghost.docId !== editor.docId || ghost.pageId !== page.id) return null;
  const shownPage = editor.shown.pages.find((p) => p.id === page.id);
  const els = shownPage?.kind === "freeform" ? shownPage.elements.filter((e) => ghost.ids.includes(e.id)) : [];
  const k = scaleOf(zoom);
  return (
    <>
      {els.map((e, i) => (
        <div
          key={e.id}
          aria-hidden
          data-testid={`ai-ghost-${e.id}`}
          className="pointer-events-none absolute rounded-sm bg-brand/5 outline-2 outline-offset-4 outline-brand outline-dashed"
          style={{ left: e.frame.x * k, top: e.frame.y * k, width: e.frame.w * k, height: e.frame.h * k }}
        >
          {i === 0 && (
            <span className="absolute -top-6 right-0 inline-flex items-center gap-1 whitespace-nowrap rounded-chip bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-on-brand">
              <Sparkles className="size-3" /> Preview: not applied yet
            </span>
          )}
        </div>
      ))}
    </>
  );
}
