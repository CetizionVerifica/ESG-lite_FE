// DS-13 · "Request approval" (D14): one Manager who can open the design,
// an optional due date and a note. The request is tied to the rev being
// saved now; the reviewer gets a notification and an email.
import { useEffect, useState } from "react";
import { DateField, Modal, Select, Textarea } from "../../../ui";
import { currentRev, dsError } from "../share/api";
import { useSafeToast } from "../share/useSafeToast";
import { usePeople, useReviewMutation, requestApproval } from "./api";
import { useAuth } from "../../../context/AuthContext";

export function RequestApprovalDialog({ docId, open, onClose }: { docId: number; open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const me = typeof user?.user_id === "number" ? (user.user_id as number) : null;
  const people = usePeople(docId);
  const toast = useSafeToast();
  const managers = (people.data ?? []).filter((p) => p.canApprove && p.id !== me);
  const [reviewer, setReviewer] = useState<number | null>(null);
  const [due, setDue] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) setError(null);
  }, [open]);
  useEffect(() => {
    if (open && reviewer === null && managers.length === 1) setReviewer(managers[0].id);
  }, [open, reviewer, managers]);
  const send = useReviewMutation(docId, async (_: void, cid) => requestApproval(docId, { reviewerId: reviewer as number, dueAt: due || null, note: note.trim() || null, rev: await currentRev(docId, cid) }, cid));
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Request approval"
      description="A Manager reviews the design as it is saved now. An edit after they approve needs a new approval."
      error={error}
      primaryAction={{
        label: "Send request",
        disabled: reviewer === null,
        loading: send.isPending,
        onClick: () =>
          send.mutate(undefined, {
            onSuccess: (a) => {
              toast({ title: `Approval requested from ${a.reviewerName}`, tone: "good" });
              setNote("");
              setDue("");
              onClose();
            },
            onError: (err) => setError(dsError(err).message ?? "The request couldn't be sent. Try again."),
          }),
      }}
    >
      <div className="flex flex-col gap-3">
        <Select
          label="Reviewer"
          value={reviewer}
          onChange={setReviewer}
          placeholder="Choose a Manager"
          emptyText={people.isPending ? "Loading…" : "No other Manager can open this design"}
          options={managers.map((p) => ({ value: p.id, label: p.name }))}
          required
        />
        <DateField label="Due date (optional)" value={due} onChange={setDue} min={new Date().toISOString().slice(0, 10)} />
        <Textarea label="Note (optional)" value={note} onChange={setNote} rows={3} placeholder="What should they look at?" />
      </div>
    </Modal>
  );
}
