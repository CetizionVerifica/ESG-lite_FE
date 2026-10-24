// DS-13 · "Unlock" for a template-locked element in Position → Layers
// (RS-10 §2, DS-13 §5). Managers and the Superadmin may unlock it; Admins
// only while brand controls are off (the server refuses it otherwise).
import { Unlock } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import type { Element } from "../../../lib/studio/contracts";
import { cn, focusRing } from "../../../ui";
import { useBrandControls } from "../panels/useBrandControls";
import { useEditor } from "../editor/EditorContext";
import { canUnlockTemplate, unlockTemplate } from "./logic";

export function TemplateUnlock({ el, pageId }: { el: Element; pageId: string }) {
  const ed = useEditor();
  const { role } = useAuth();
  const brand = useBrandControls();
  if (!el.templateLocked || ed.readOnly) return null;
  const allowed = canUnlockTemplate(role, brand.on);
  return (
    <button
      type="button"
      aria-label={`Unlock template element ${el.id}`}
      title={allowed ? "Unlock this template element" : "Brand controls keep template elements locked. Ask a Manager."}
      disabled={!allowed}
      onClick={() => ed.commit(unlockTemplate(ed.doc, pageId, [el.id]), "Unlock template element")}
      className={cn("rounded-chip p-1 text-muted hover:bg-tint hover:text-ink disabled:cursor-not-allowed disabled:opacity-50", focusRing)}
    >
      <Unlock aria-hidden className="size-4" />
    </button>
  );
}
