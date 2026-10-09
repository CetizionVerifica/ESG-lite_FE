import { Button, Callout, Skeleton, StatusPill, cn, formatEmissions, panel } from "../../../ui";
import { useExistingEntries } from "../api";
import { canChange, type SavedEntry } from "../logic/existing";
import type { EntryPeriod } from "../logic/entry";

type Props = {
  siteId: number;
  categoryId: number;
  period: EntryPeriod;
  periodLabel: string;
  /** Loads the entry into step 2. Not given while the rows can't take it (Review). */
  onLoad?: (entry: SavedEntry) => void;
};

const nameOf = (e: SavedEntry) => String(e.activity_data?.emission_category ?? "—");

/** "Already entered for Sep 2025": what is saved for this context, with Fix/Edit for rows that can still change. */
export function ExistingEntries({ siteId, categoryId, period, periodLabel, onLoad }: Props) {
  const entries = useExistingEntries(siteId, categoryId, period);

  if (entries.isPending) {
    return <Skeleton className="h-24 w-full rounded-card" />;
  }
  if (entries.isError) {
    return (
      <Callout
        tone="warn"
        title="Couldn't load what's already entered"
        action={<Button size="sm" variant="secondary" onClick={() => void entries.refetch()}>Retry</Button>}
      >
        You can still add rows; a duplicate is caught when you send.
      </Callout>
    );
  }
  const list = entries.data;
  return (
    <section aria-labelledby="already-entered" className={cn(panel, "p-4")}>
      <h2 id="already-entered" className="text-sm font-semibold text-ink">
        Already entered for {periodLabel} ({list.length})
      </h2>
      {list.length === 0 ? (
        <p className="mt-1 text-sm text-muted">Nothing yet for this category and period.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">Entries already saved for {periodLabel}</caption>
            <thead className="border-b border-line text-left text-xs text-muted">
              <tr>
                <th scope="col" className="py-2 pr-3 font-medium">Emission category</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">tCO₂e</th>
                <th scope="col" className="py-2 pr-3 font-medium">Status</th>
                <th scope="col" className="py-2 font-medium"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {list.map((e) => (
                <tr key={e.pk_id} className="border-b border-line align-top last:border-0">
                  <td className="py-2 pr-3 text-ink">
                    {nameOf(e)}
                    {e.status === "rejected" && e.review_comment && <p className="text-xs text-bad">Reason: {e.review_comment}</p>}
                  </td>
                  <td className="py-2 pr-3 text-right font-num text-ink">{formatEmissions(Number(e.total_emission))}</td>
                  <td className="py-2 pr-3">
                    <StatusPill status={e.status} size="sm" />
                  </td>
                  <td className="py-2 text-right">
                    {onLoad && canChange(e) && (
                      <Button size="sm" variant={e.status === "rejected" ? "secondary" : "ghost"} onClick={() => onLoad(e)} aria-label={`${e.status === "rejected" ? "Fix" : "Edit"} ${nameOf(e)}`}>
                        {e.status === "rejected" ? "Fix" : "Edit"}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
