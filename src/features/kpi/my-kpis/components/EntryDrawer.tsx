import { useEffect, useRef } from "react";
import { ArrowRight, Check, CloudOff, Loader2 } from "lucide-react";
import type { MyKpiItem } from "../../../../lib/kpi/contracts";
import { VALUE_STATUS_LABEL } from "../../../../lib/kpi/labels";
import { Button, Drawer, Modal, StatusPill, useUnsavedGuard } from "../../../../ui";
import { KpiQuestionCard } from "../../components/KpiQuestionCard";
import { type SaveState, useEntryDraft } from "../hooks/useEntryDraft";
import { itemKey, periodLabelOf, questionItem } from "../logic";

export type EntryDrawerProps = {
  item: MyKpiItem;
  listKey: readonly unknown[];
  /** "1 of 4 to enter". */
  position: string | null;
  hasNext: boolean;
  onClose: () => void;
  /** Saved: open the next item (or close at the end). */
  onNext: () => void;
  onSaved: (message: string) => void;
};

function SaveStatus({ state, error }: { state: SaveState; error: string | null }) {
  if (state === "saving")
    return (
      <span className="inline-flex items-center gap-1 text-sm text-muted">
        <Loader2 aria-hidden className="size-4 animate-spin" />
        Saving…
      </span>
    );
  if (state === "error")
    return (
      <span role="alert" className="inline-flex items-start gap-1 text-sm text-bad">
        <CloudOff aria-hidden className="mt-0.5 size-4 shrink-0" />
        {error ?? "Not saved."}
      </span>
    );
  if (state === "unsaved") return <span className="text-sm text-muted">Not saved yet</span>;
  if (state === "saved")
    return (
      <span className="inline-flex items-center gap-1 text-sm text-good">
        <Check aria-hidden className="size-4" />
        Draft saved
      </span>
    );
  return null;
}

/**
 * KPI-7 · The entry card in a drawer (full screen at 390 px). Drafts save as
 * you type; "Save and next" saves and moves on; pending and approved values
 * open read-only. Leaving with something unsaved asks first.
 */
export function EntryDrawer({ item, listKey, position, hasNext, onClose, onNext, onSaved }: EntryDrawerProps) {
  const status = item.value?.status ?? null;
  const editable = status === null || status === "draft" || status === "rejected";
  const entry = useEntryDraft(item, listKey, editable);
  const blocker = useUnsavedGuard(entry.dirty);
  const idBase = `kpi-entry-${itemKey(item).replace(/[^a-z0-9]/gi, "-")}`;
  const where = [item.site_name ?? "Company", periodLabelOf(item), position].filter(Boolean).join(" · ");

  // A blocked navigation saves first, then goes on; only a failed save asks (nothing is lost silently).
  const handling = useRef(false);
  const { flush } = entry;
  useEffect(() => {
    if (blocker.state !== "blocked" || handling.current) return;
    handling.current = true;
    void flush().then((v) => {
      handling.current = false;
      if (v !== undefined) blocker.proceed?.();
    });
  }, [blocker, flush]);

  const close = async () => {
    const failedBefore = entry.state === "error";
    const v = await entry.flush();
    if (v !== undefined || failedBefore) onClose();
  };
  const saveDraft = async () => {
    const v = await entry.flush();
    if (v) onSaved("Draft saved.");
  };
  const saveAndNext = async () => {
    const v = await entry.flush();
    if (v !== undefined) onNext();
  };

  return (
    <Drawer
      open
      onClose={() => void close()}
      title={item.name}
      subtitle={where}
      size="md"
      footer={
        editable ? (
          <>
            <span className="mr-auto self-center">
              <SaveStatus state={entry.state} error={entry.error} />
            </span>
            <Button variant="secondary" onClick={() => void saveDraft()}>
              Save draft
            </Button>
            <Button variant="primary" onClick={() => void saveAndNext()}>
              {hasNext ? "Save and next" : "Save and close"}
              {hasNext && <ArrowRight aria-hidden className="size-4" />}
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        )
      }
    >
      {!editable && status && (
        <p className="mb-4 flex items-center gap-2 text-sm text-muted">
          <StatusPill status={status} />
          {status === "pending" ? "Sent for review. It can't be changed while it waits." : `${VALUE_STATUS_LABEL[status]}. It can't be changed.`}
        </p>
      )}
      <KpiQuestionCard
        idBase={idBase}
        item={questionItem(item)}
        draft={entry.draft}
        onChange={entry.change}
        onBlur={() => void entry.flush()}
        readOnly={!editable}
        reviewComment={item.value?.status === "rejected" || (item.value?.review_comment && editable) ? item.value?.review_comment : null}
        reviewerName={item.reviewer_name}
        evidence={entry.evidence}
        uploads={entry.uploads}
        onAddFiles={editable ? (files) => void entry.addFiles(files) : undefined}
        onRemoveEvidence={editable ? (ev) => void entry.removeEvidence(ev) : undefined}
      />
      <Modal
        open={blocker.state === "blocked" && entry.state === "error"}
        onClose={() => blocker.reset?.()}
        title="Leave without saving?"
        description="The last change couldn't be saved. If you leave now it's lost."
        tone="destructive"
        primaryAction={{ label: "Leave anyway", onClick: () => blocker.proceed?.() }}
        cancelLabel="Stay and fix it"
      />
    </Drawer>
  );
}
