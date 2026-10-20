// DS-11 · Share ▾ (05-ux S7): people with studio access and comments
// (DS-13), Request approval (DS-13), and Create view link (Manager; D15),
// with the design's active links and their views.
import { useState } from "react";
import { Link2, MessageSquare, UserCheck } from "lucide-react";
import { Button, Popover, cn, focusRing } from "../../../ui";
import { shareLine } from "../../../lib/studio/outputs";
import { useShares } from "./api";
import { ViewLinkDialog } from "./ViewLinkDialog";

function Row({ icon, title, sub, onClick, disabled, testId }: { icon: React.ReactNode; title: string; sub: string; onClick?: () => void; disabled?: boolean; testId?: string }) {
  return (
    <button
      type="button"
      role="menuitem"
      data-testid={testId}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onClick}
      className={cn("flex w-full items-start gap-2.5 rounded-control px-2.5 py-2 text-left text-[13px]", disabled ? "cursor-not-allowed text-muted" : "text-ink hover:bg-tint", focusRing)}
    >
      <span aria-hidden className="mt-0.5 text-muted">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block text-xs text-muted">{sub}</span>
      </span>
    </button>
  );
}

export function ShareMenu({ docId, canShare }: { docId: number; canShare: boolean }) {
  const [dialog, setDialog] = useState(false);
  const shares = useShares(docId, canShare);
  const active = (shares.data ?? []).filter((s) => s.state === "active");
  return (
    <>
      <Popover
        label="Share"
        align="end"
        className="w-[340px] p-2"
        trigger={(t) => (
          <Button {...t} size="sm" variant="secondary" data-testid="share-menu">
            Share ▾
          </Button>
        )}
      >
        {(close) => (
          <div role="menu" aria-label="Share" className="flex flex-col gap-0.5">
            <div className="px-2.5 py-1.5 text-xs font-semibold text-muted">Share</div>
            <Row icon={<MessageSquare className="size-4" />} title="People and comments" sub="Comments and @mentions arrive with review." disabled />
            <Row icon={<UserCheck className="size-4" />} title="Request approval" sub="Arrives with review." disabled />
            <div aria-hidden className="my-1 h-px bg-line" />
            <Row
              testId="share-view-link"
              icon={<Link2 className="size-4" />}
              title="Create view link"
              sub={canShare ? "Read-only PDF link that expires" : "Only a Manager can create a view link."}
              disabled={!canShare}
              onClick={() => {
                close();
                setDialog(true);
              }}
            />
            {canShare && active.length > 0 && (
              <ul className="mx-2.5 mb-1 mt-1 flex flex-col gap-1 text-xs text-muted" aria-label="Active view links">
                {active.slice(0, 3).map((s) => (
                  <li key={s.id} className="truncate">
                    {shareLine(s)}
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    className={cn("text-brand-text underline", focusRing)}
                    onClick={() => {
                      close();
                      setDialog(true);
                    }}
                  >
                    Manage links
                  </button>
                </li>
              </ul>
            )}
          </div>
        )}
      </Popover>
      {canShare && dialog && <ViewLinkDialog docId={docId} open={dialog} onClose={() => setDialog(false)} />}
    </>
  );
}
