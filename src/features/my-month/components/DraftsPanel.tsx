import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PencilLine, Send } from "lucide-react";
import { Button, Callout, Skeleton, StatusPill, cn, focusRing, formatEmissions, useToast } from "../../../ui";
import { useSubmitDrafts } from "../api";
import { type DraftRow, fixLink, keepSelected, selectableIds, selectionState, submitMessage, submitSelection } from "../logic";
import { errorText } from "../../../services/reviewService";

type Props = {
  drafts: DraftRow[];
  month: string;
  showSite: boolean;
  loading: boolean;
  error: boolean;
  onRetry: () => void;
};

function SelectAll({ state, disabled, onChange }: { state: "none" | "some" | "all"; disabled: boolean; onChange: (all: boolean) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "some";
  }, [state]);
  return (
    <label className="flex items-center gap-2 text-xs font-medium text-muted">
      <input
        ref={ref}
        type="checkbox"
        className={cn("size-4 accent-brand", focusRing)}
        checked={state === "all"}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      Select all
    </label>
  );
}

/**
 * S3-15 · Drafts: rows the contributor saved but hasn't sent yet, each with a
 * checkbox, and a sticky "Submit N rows" bar. Only the contributor sees drafts;
 * a manager sees them once they're submitted.
 */
export function DraftsPanel({ drafts, month, showSite, loading, error, onRetry }: Props) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const submit = useSubmitDrafts();
  const { toast } = useToast();

  // Submitted rows leave the list; drop them from the selection too.
  const live = keepSelected(selected, drafts);
  const ids = submitSelection(live, drafts);
  const state = selectionState(live, drafts);
  const selectable = selectableIds(drafts).length;

  if (loading) return <Skeleton className="h-28 w-full rounded-card" />;
  if (error) {
    return (
      <Callout tone="warn" title="Couldn't load your drafts" action={<Button size="sm" variant="secondary" onClick={onRetry}>Try again</Button>}>
        Your saved drafts are safe; they show here once the list loads.
      </Callout>
    );
  }
  if (drafts.length === 0) return null;

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(keepSelected(prev, drafts));
      if (next.has(id)) next.delete(id); // data-loss-reviewed: a checkbox selection, not a record
      else next.add(id);
      return next;
    });

  const send = () =>
    submit.mutate(ids, {
      onSuccess: (result) => {
        toast(submitMessage(result));
        setSelected(new Set());
      },
      onError: (e) => toast({ title: "Couldn't submit your drafts", description: errorText(e, "Try again in a moment."), tone: "bad" }),
    });

  return (
    <section aria-labelledby="drafts-heading" className="rounded-card border border-line bg-panel">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-4">
        <div>
          <h2 id="drafts-heading" className="flex items-center gap-2 text-sm font-semibold text-ink">
            <PencilLine aria-hidden className="size-4 text-muted" />
            Drafts ({drafts.length})
          </h2>
          <p className="mt-0.5 text-xs text-muted">Only you can see drafts. Submit them when they're ready for your manager.</p>
        </div>
        <SelectAll state={state} disabled={selectable === 0 || submit.isPending} onChange={(all) => setSelected(all ? new Set(selectableIds(drafts)) : new Set())} />
      </div>
      <ul className="mt-3 divide-y divide-line border-t border-line" aria-label="Drafts">
        {drafts.map((d) => {
          const name = d.label ? `${d.categoryName} · ${d.label}` : d.categoryName;
          return (
            <li key={d.pk_id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:flex-nowrap">
              <input
                type="checkbox"
                className={cn("size-4 shrink-0 accent-brand", focusRing)}
                checked={live.has(d.pk_id)}
                disabled={d.locked || submit.isPending}
                onChange={() => toggle(d.pk_id)}
                aria-label={`Select ${name}${showSite ? ` at ${d.siteName}` : ""}`}
              />
              <div className="min-w-0 flex-1 basis-40 sm:basis-auto">
                <p className="text-sm font-medium text-ink sm:truncate">{name}</p>
                {showSite && <p className="text-xs text-muted">{d.siteName}</p>}
              </div>
              <div className="ml-auto flex items-center gap-3">
                <StatusPill status={d.locked ? "locked" : "draft"} />
                <span className="w-24 whitespace-nowrap text-right font-num text-sm tabular-nums text-ink">{formatEmissions(d.tco2e)}</span>
                {d.locked ? (
                  <span className="w-14" />
                ) : (
                  <Link
                    to={fixLink(d.siteId, d.categoryId, month, d.pk_id)}
                    className={cn("inline-flex h-8 w-14 items-center justify-center rounded-control text-xs font-medium text-brand-text hover:bg-tint", focusRing)}
                    aria-label={`Edit ${name}`}
                  >
                    Edit
                  </Link>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div
        role="region"
        aria-label="Submit drafts"
        className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-2 rounded-b-card border-t border-line bg-panel px-4 py-3"
      >
        <p className="text-sm text-muted" aria-live="polite">
          {ids.length === 0 ? "Pick the drafts to send for approval." : `${ids.length} of ${selectable} selected`}
        </p>
        <Button variant="primary" icon={<Send aria-hidden className="size-4" />} disabled={ids.length === 0} loading={submit.isPending} onClick={send}>
          {ids.length === 0 ? "Submit" : `Submit ${ids.length} ${ids.length === 1 ? "row" : "rows"}`}
        </Button>
      </div>
    </section>
  );
}
