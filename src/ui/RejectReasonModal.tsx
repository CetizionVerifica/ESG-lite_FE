import { useEffect, useState } from "react";
import { cn } from "./cn";
import { Textarea } from "./fields";
import { Modal } from "./Modal";
import { SUGGESTED_REASONS, rejectReasonError } from "./review";
import { focusRing } from "./styles";

export type RejectReasonModalProps = {
  open: boolean;
  count: number;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  /** What is being rejected, singular and plural. Default entry / entries. */
  noun?: [string, string];
  reasons?: string[];
};

/**
 * Reject dialog shared by the approval lists. Reason is required (min 5
 * characters); suggested reasons fill it in one click.
 */
export function RejectReasonModal({
  open,
  count,
  busy,
  error,
  onClose,
  onConfirm,
  noun = ["entry", "entries"],
  reasons = SUGGESTED_REASONS,
}: RejectReasonModalProps) {
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (open) {
      setReason("");
      setTouched(false);
    }
  }, [open]);
  const invalid = rejectReasonError(reason);

  return (
    <Modal
      open={open}
      onClose={onClose}
      tone="destructive"
      title={count === 1 ? `Reject this ${noun[0]}?` : `Reject ${count} ${noun[1]}?`}
      description={`The submitter sees your reason and can correct the ${noun[0]}.`}
      error={error}
      primaryAction={{
        label: "Reject",
        loading: busy,
        onClick: () => {
          setTouched(true);
          if (!invalid) onConfirm(reason.trim());
        },
      }}
    >
      <div className="space-y-3">
        <div role="group" aria-label="Suggested reasons" className="flex flex-wrap gap-1.5">
          {reasons.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={reason === r}
              onClick={() => setReason(r)}
              className={cn(
                "rounded-chip border px-2 py-0.5 text-xs",
                reason === r ? "border-accent bg-tint text-ink" : "border-line text-muted hover:text-ink",
                focusRing,
              )}
            >
              {r}
            </button>
          ))}
        </div>
        <Textarea
          label="Reason"
          required
          autoFocus
          value={reason}
          onChange={setReason}
          onBlur={() => setTouched(true)}
          error={touched ? invalid ?? undefined : undefined}
          placeholder="What needs fixing?"
        />
      </div>
    </Modal>
  );
}
