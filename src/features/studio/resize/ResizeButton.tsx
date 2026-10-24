// DS-10 · the top bar's Resize button and its dialog, wired to the editor
// (the design, its resolved numbers, brand and assets for the preview).
import { useState } from "react";
import { Scaling } from "lucide-react";
import { useEditor } from "../editor/EditorContext";
import { TbButton } from "../editor/toolbars";
import { ResizeDialog } from "./ResizeDialog";

export function ResizeButton() {
  const ed = useEditor();
  const [open, setOpen] = useState(false);
  return (
    <>
      <TbButton onClick={() => setOpen(true)} icon={<Scaling aria-hidden className="size-4" />} title="Resize: make a linked deck, summary or social card" data-testid="resize-open" className="flex-none whitespace-nowrap">
        Resize
      </TbButton>
      <ResizeDialog open={open} onClose={() => setOpen(false)} docId={ed.docId} doc={ed.doc} data={ed.render.data} brand={ed.render.brand} assets={ed.render.assets} />
    </>
  );
}
