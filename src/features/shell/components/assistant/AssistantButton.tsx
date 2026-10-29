import { useState } from "react";
import { MessageCircleQuestion } from "lucide-react";
import { useAuth } from "../../../../context/AuthContext";
import { useAssistantStatus } from "../../../../lib/assistant/api";
import { assistantVisible } from "../../../../lib/assistant/logic";
import { chromeIconButton } from "../styles";
import { AssistantPanel } from "./AssistantPanel";

/**
 * AS-1 · the top bar's "Ask ESGLite" button. Shown only when the server says
 * the assistant is on for the person's company (or they're a Superadmin) and
 * a model key is set (`GET /assistant/status`); otherwise nothing renders.
 */
export default function AssistantButton() {
  const { role } = useAuth();
  const status = useAssistantStatus(!!role);
  const [open, setOpen] = useState(false);
  if (!assistantVisible(status.data)) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Ask ESGLite" aria-haspopup="dialog" aria-expanded={open} className={chromeIconButton} data-testid="assistant-button">
        <MessageCircleQuestion size={19} aria-hidden />
      </button>
      {open && <AssistantPanel open={open} onClose={() => setOpen(false)} />}
    </>
  );
}
