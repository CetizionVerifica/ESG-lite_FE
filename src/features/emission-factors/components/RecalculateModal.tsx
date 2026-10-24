import { useEffect } from "react";
import { Callout, Modal, Skeleton, formatEntryTonnes } from "../../../ui";
import { errorMessage, useRecalcPreview, useRecalculate } from "../api";

type Props = {
  /** The factor whose entries to recalculate; null closes the dialog. */
  factor: { id: number; label: string } | null;
  /** Shown first when the dialog opens right after the value was changed. */
  justSaved?: boolean;
  onClose: () => void;
  onDone: (changed: number) => void;
};

const plural = (n: number, one: string, many: string) => `${n.toLocaleString("en-US")} ${n === 1 ? one : many}`;

/**
 * N4 (F-04/F-09): after a factor's value is corrected, the entries calculated with it keep their
 * old totals until they are recalculated. Shows what would change, then recalculates them.
 */
export function RecalculateModal({ factor, justSaved, onClose, onDone }: Props) {
  const preview = useRecalcPreview(factor?.id ?? null);
  const run = useRecalculate();
  const p = preview.data;
  const approved = p ? p.changes.filter((c) => c.status === "approved").length : 0;
  // Right after a save, a factor with nothing to recalculate doesn't interrupt.
  const nothing = !!justSaved && !!p && p.changed === 0 && p.locked === 0;
  useEffect(() => {
    if (nothing) onClose();
  }, [nothing, onClose]);

  return (
    <Modal
      open={!!factor && !nothing}
      onClose={() => !run.isPending && onClose()}
      title="Recalculate entries?"
      description={factor?.label}
      error={run.isError ? errorMessage(run.error, "Nothing was recalculated. Try again.") : preview.isError ? errorMessage(preview.error, "Couldn't check the entries.") : undefined}
      cancelLabel={p && p.changed > 0 ? "Not now" : "Close"}
      primaryAction={
        p && p.changed > 0
          ? {
              label: `Recalculate ${plural(p.changed, "entry", "entries")}`,
              loading: run.isPending,
              onClick: () => factor && run.mutate(factor.id, { onSuccess: (r) => onDone(r.changed) }),
            }
          : undefined
      }
    >
      {justSaved && <p className="mb-2 text-sm text-muted">The factor is saved. Entries already calculated with it still show their old totals.</p>}
      {preview.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : p ? (
        p.changed === 0 ? (
          <p className="text-sm text-ink" data-testid="recalc-none">
            {p.uses_factor === 0 ? "No saved entry is calculated with this factor." : `${plural(p.uses_factor, "entry uses", "entries use")} this factor and already match its value.`}
          </p>
        ) : (
          <div className="space-y-2 text-sm text-ink" data-testid="recalc-preview">
            <p>
              {plural(p.changed, "entry", "entries")} would change: <span className="font-num">{formatEntryTonnes(p.before_tco2e)}</span> →{" "}
              <span className="font-num font-semibold">{formatEntryTonnes(p.after_tco2e)} tCO₂e</span> in total.
            </p>
            {approved > 0 && <p className="text-muted">{plural(approved, "of them is", "of them are")} approved and stays approved; the change is in each entry&apos;s history.</p>}
            <p className="text-muted">Category 3 rows linked to them are recalculated too.</p>
          </div>
        )
      ) : null}
      {p && p.locked > 0 && (
        <Callout tone="warn" className="mt-3">
          {plural(p.locked, "entry is", "entries are")} in a locked month and won&apos;t change. Unlock the month first, then recalculate again.
        </Callout>
      )}
    </Modal>
  );
}
