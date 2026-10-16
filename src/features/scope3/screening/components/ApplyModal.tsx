import { useState } from "react";
import { Modal, Select, Textarea } from "../../../../ui";
import { BOUNDARY_STATUSES, BOUNDARY_STATUS_LABEL, type BoundaryStatus, needsReason } from "../../../../lib/scope3/boundary";
import { categoryLabel } from "../../../../lib/scope3/contracts";
import type { ScreeningCategory } from "../../../../services/scope3ScreeningService";
import { errorMessage, useSetStatus } from "../api";
import { type ApplyDraft, applyDraftFor, applyError } from "../logic";

const STATUS_OPTIONS = BOUNDARY_STATUSES.map((s) => ({ value: s, label: BOUNDARY_STATUS_LABEL[s] }));

export type ApplyModalProps = {
  category: ScreeningCategory;
  companyId: number | null;
  onClose: () => void;
  onApplied: (message: string) => void;
};

/**
 * "Apply": the suggestion's status and reason, ready to edit, saved through
 * the Scope 3 boundary (PUT /scope3/categories/:n). Never applied without
 * this click.
 */
export function ApplyModal({ category: c, companyId, onClose, onApplied }: ApplyModalProps) {
  const [draft, setDraft] = useState<ApplyDraft>(() => applyDraftFor(c));
  const [tried, setTried] = useState(false);
  const save = useSetStatus(companyId);
  const err = tried ? applyError(draft) : null;

  const onSave = () => {
    setTried(true);
    if (applyError(draft)) return;
    save.mutate(
      { n: c.n, status: draft.status, reason: draft.reason.trim() || null, relevance: c.relevance ?? {} },
      { onSuccess: () => onApplied(`${categoryLabel(c.n)} set to ${BOUNDARY_STATUS_LABEL[draft.status].toLowerCase()}`) },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Apply to ${categoryLabel(c.n)}`}
      description="Suggestions follow the screening rules; you decide. The reason shows in reports for excluded and not relevant categories."
      primaryAction={{ label: "Apply", onClick: onSave, loading: save.isPending }}
      error={save.isError ? errorMessage(save.error, "The status wasn't saved. Try again.") : undefined}
    >
      <div className="space-y-3">
        <Select<BoundaryStatus>
          label="Status"
          value={draft.status}
          options={STATUS_OPTIONS}
          onChange={(v) => v && setDraft((d) => ({ ...d, status: v }))}
        />
        <Textarea
          label="Reason"
          required={needsReason(draft.status)}
          value={draft.reason}
          onChange={(v) => setDraft((d) => ({ ...d, reason: v }))}
          error={err}
          maxLength={2000}
        />
      </div>
    </Modal>
  );
}
