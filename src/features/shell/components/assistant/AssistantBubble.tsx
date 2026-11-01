import { useState } from "react";
import { Sparkles } from "lucide-react";
import { useAuth } from "../../../../context/AuthContext";
import { useAssistantStatus } from "../../../../lib/assistant/api";
import { assistantVisible } from "../../../../lib/assistant/logic";
import { cn, focusRing } from "../../../../ui";
import { AssistantPanel } from "./AssistantPanel";

/**
 * Sits above a page's bottom action bar (Add data, Approvals, the studio's
 * status bar), so it never covers Save or Submit. The shell's root is
 * `group/shell`; a bar that isn't sticky marks itself `data-bottom-bar`.
 */
const LIFT = "group-has-[:is(.sticky.bottom-0,[data-bottom-bar])]/shell:bottom-20";

/**
 * AS-1 · the "Ask ESGLite" bubble, bottom right on every page. Shown only when
 * the server says the assistant is on for the person's company (or they're a
 * Superadmin) and a model key is set (`GET /assistant/status`); otherwise
 * nothing renders.
 */
export default function AssistantBubble() {
  const { role } = useAuth();
  const status = useAssistantStatus(!!role);
  const [open, setOpen] = useState(false);
  if (!assistantVisible(status.data)) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ask ESGLite"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Ask ESGLite"
        className={cn("fixed bottom-4 right-4 z-30 inline-flex size-11 items-center justify-center rounded-full bg-brand text-on-brand shadow-lg hover:opacity-90 print:hidden sm:bottom-6 sm:right-6", LIFT, focusRing)}
        data-testid="assistant-bubble"
      >
        <Sparkles size={20} aria-hidden />
      </button>
      {open && <AssistantPanel open={open} onClose={() => setOpen(false)} />}
    </>
  );
}
