// DS-9 · "AI ▾" on the text toolbar (DS-7 slot): Shorter, Longer, More formal,
// Plain English, In our brand voice, Suggest a headline. Each opens the AI
// drawer with a suggestion card for the selected box; nothing changes until
// Accept.
import { ChevronDown, Sparkles } from "lucide-react";
import { Menu, cn, focusRing } from "../../../ui";
import type { TextToolbarSlotProps } from "../editor/text/toolbarSlots";
import { REWRITE_ITEMS } from "./logic";
import { requestAi } from "./store";

export function AiRewriteMenu({ pageId, elements, editor }: TextToolbarSlotProps) {
  const el = elements[0];
  if (!el) return null;
  return (
    <Menu
      label="Ask AI about this text"
      align="start"
      trigger={(t) => (
        <button {...t} type="button" disabled={editor.readOnly} className={cn("inline-flex h-8 items-center gap-1 rounded-control px-2 text-sm font-medium text-brand-text hover:bg-tint disabled:opacity-50", focusRing)} data-testid="ai-rewrite-menu">
          <Sparkles aria-hidden className="size-4" /> AI <ChevronDown aria-hidden className="size-3.5" />
        </button>
      )}
      items={REWRITE_ITEMS.map((it) => ({
        label: it.label,
        onSelect: () => {
          requestAi(editor.docId, it.prompt, { action: it.action, target: { pageId, elementId: el.id } });
          editor.openDrawer("ai");
        },
      }))}
    />
  );
}
