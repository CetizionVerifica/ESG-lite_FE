// DS-13 · the approval bar under the top bar (05-ux S9, D14): "Approval
// requested from Asha · due 28 Oct" with Approve / Request changes for the
// reviewer (a note is required to request changes) and Withdraw for the
// requester; "Approved by Asha", or "approved an earlier version" once the
// design changed, with "Request again".
import { useState } from "react";
import { BadgeCheck, Clock, TriangleAlert } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { Button, Modal, Textarea, cn } from "../../../ui";
import { useEditor } from "../editor/EditorContext";
import { dsError } from "../share/api";
import { useSafeToast } from "../share/useSafeToast";
import { decideApproval, useApprovals, useReviewMutation, withdrawApproval } from "./api";
import { approvalLine, approvalRole } from "./logic";
import { RequestApprovalDialog } from "./RequestApprovalDialog";

const TONE = { info: "border-info/30 bg-info-soft text-info", good: "border-good/30 bg-good-soft text-good", warn: "border-warn/30 bg-warn-soft text-warn" } as const;
const ICON = { info: Clock, good: BadgeCheck, warn: TriangleAlert } as const;

export function ApprovalBar() {
  const ed = useEditor();
  const { user, role } = useAuth();
  const me = typeof user?.user_id === "number" ? (user.user_id as number) : null;
  const q = useApprovals(ed.docId);
  const toast = useSafeToast();
  const [changes, setChanges] = useState(false);
  const [note, setNote] = useState("");
  const [again, setAgain] = useState(false);
  // Withdrawing an approval request asks first (inline Withdraw / Keep).
  const [confirmWithdraw, setConfirmWithdraw] = useState(false);
  const decide = useReviewMutation(ed.docId, (a: { id: number; decision: "approve" | "request_changes"; note: string | null }, cid) => decideApproval(a.id, a.decision, a.note, cid));
  const withdraw = useReviewMutation(ed.docId, (id: number, cid) => withdrawApproval(id, cid));
  const line = approvalLine(q.data);
  const a = q.data?.current;
  if (!line || !a) return null;
  const who = approvalRole(a, me, role);
  const Icon = ICON[line.tone];
  const fail = (err: unknown) => toast({ title: dsError(err).message ?? "That didn't work. Try again.", tone: "bad" });
  return (
    <div role="status" data-testid="approval-bar" className={cn("flex flex-none items-center gap-2 border-b px-3 py-1.5 text-[13px]", TONE[line.tone])}>
      <Icon aria-hidden className="size-4 flex-none" />
      <span className="min-w-0 flex-1 truncate font-medium">{line.text}</span>
      {a.state === "requested" && a.note && <span className="hidden min-w-0 max-w-[30%] truncate text-xs opacity-80 xl:inline">“{a.note}”</span>}
      {a.state === "requested" && who === "reviewer" && (
        <>
          <Button size="sm" variant="primary" loading={decide.isPending} onClick={() => decide.mutate({ id: a.id, decision: "approve", note: null }, { onSuccess: () => toast({ title: "Approved", tone: "good" }), onError: fail })}>
            Approve
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setChanges(true)}>
            Request changes
          </Button>
        </>
      )}
      {a.state === "requested" && who === "requester" && (
        confirmWithdraw ? (
          <span className="flex items-center gap-1">
            <span className="text-xs">Withdraw the request?</span>
            <Button size="sm" variant="danger" loading={withdraw.isPending} onClick={() => withdraw.mutate(a.id, { onError: fail, onSettled: () => setConfirmWithdraw(false) })}>
              Withdraw
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirmWithdraw(false)}>
              Keep
            </Button>
          </span>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirmWithdraw(true)}>
            Withdraw
          </Button>
        )
      )}
      {(a.state === "changes_requested" || (a.state === "approved" && q.data?.stale)) && !ed.readOnly && (
        <Button size="sm" variant="secondary" onClick={() => setAgain(true)}>
          Request approval again
        </Button>
      )}
      <Modal
        open={changes}
        onClose={() => setChanges(false)}
        title="Request changes"
        description={`Say what ${a.requestedByName} should change. They get a notification and an email.`}
        primaryAction={{
          label: "Send",
          disabled: !note.trim(),
          loading: decide.isPending,
          onClick: () =>
            decide.mutate(
              { id: a.id, decision: "request_changes", note: note.trim() },
              {
                onSuccess: () => {
                  setChanges(false);
                  setNote("");
                },
                onError: fail,
              },
            ),
        }}
      >
        <Textarea label="What should change" value={note} onChange={setNote} rows={4} required />
      </Modal>
      <RequestApprovalDialog docId={ed.docId} open={again} onClose={() => setAgain(false)} />
    </div>
  );
}
