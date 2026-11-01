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
 * nothing renders. The panel stays mounted after the first open, so an answer
 * still lands if the person closes it while waiting: the bubble spins, then
 * shows a dot.
 */
export default function AssistantBubble() {
  const { role } = useAuth();
  const status = useAssistantStatus(!!role);
  const [open, setOpen] = useState(false);
  const [used, setUsed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unread, setUnread] = useState(false);
  if (!assistantVisible(status.data)) return null;
  const show = () => {
    setUsed(true);
    setUnread(false);
    setOpen(true);
  };
  return (
    <>
      <button
        type="button"
        onClick={show}
        aria-label={unread && !open ? "Ask ESGLite, new answer" : "Ask ESGLite"}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={cn(
          "group fixed bottom-4 right-4 z-30 inline-flex size-11 items-center justify-center rounded-full bg-brand text-on-brand shadow-lg transition-[scale,box-shadow] duration-200 hover:shadow-xl active:scale-95 motion-safe:animate-as-pop motion-safe:hover:scale-110 print:hidden sm:bottom-6 sm:right-6",
          LIFT,
          focusRing,
        )}
        data-testid="assistant-bubble"
      >
        <span aria-hidden className="pointer-events-none absolute inset-0 rounded-full motion-safe:animate-as-halo" />
        {busy && <span aria-hidden className="pointer-events-none absolute -inset-1 rounded-full border-2 border-brand/25 border-t-brand motion-safe:animate-spin" data-testid="assistant-bubble-busy" />}
        <Sparkles size={20} aria-hidden className="transition-transform duration-300 group-hover:rotate-12 motion-safe:animate-as-twinkle" />
        {unread && !open && <span aria-hidden className="absolute -right-0.5 -top-0.5 size-3 rounded-full border-2 border-panel bg-accent motion-safe:animate-as-pop" data-testid="assistant-bubble-dot" />}
        <span
          aria-hidden
          className="pointer-events-none absolute right-full mr-3 translate-x-1 whitespace-nowrap rounded-full bg-ink px-3 py-1 text-xs font-medium text-page opacity-0 shadow-md transition duration-200 group-hover:translate-x-0 group-hover:opacity-100 group-focus-visible:translate-x-0 group-focus-visible:opacity-100"
        >
          Ask ESGLite
        </span>
      </button>
      {used && (
        <AssistantPanel
          open={open}
          onClose={() => {
            setUnread(false);
            setOpen(false);
          }}
          onBusy={setBusy}
          onAnswer={() => setUnread(true)}
          filesOn={status.data?.files === true}
        />
      )}
    </>
  );
}
