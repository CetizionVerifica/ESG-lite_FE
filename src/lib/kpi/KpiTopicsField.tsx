import { useId } from "react";
import { Check } from "lucide-react";
import { Button, Skeleton, Toggle, cn, focusRing } from "../../ui";
import { KPI_TOPICS } from "./contracts";
import { TOPIC_LABEL } from "./labels";
import { type TopicsDraft, draftFromTopics, toggleTopic } from "./personTopics";
import { useKpiOnFor, usePersonTopics } from "./usePersonTopics";

type Props = {
  /** The person being edited; null while inviting (topics are chosen once they exist). */
  userId: number | null;
  /** The person's company for a Superadmin; null for a company's own Admin. */
  companyId: number | null;
  /** The person's sites, for "Only at some of their sites". */
  sites: { site_id: number; name: string }[];
  /** What was changed in the drawer; null = as saved. */
  value: TopicsDraft | null;
  onChange: (next: TopicsDraft) => void;
};

/**
 * D17 · "KPI topics" in the company users drawer: the topics this person
 * enters KPIs for, optionally only at some of their sites. Shown only while
 * the company's KPI switch is on. The drawer's Save sends it
 * (`PUT /kpi/people/:user_id/topics`).
 */
export function KpiTopicsField({ userId, companyId, sites, value, onChange }: Props) {
  const on = useKpiOnFor(companyId);
  const saved = usePersonTopics(userId, companyId, on);
  const helpId = useId();
  if (!on) return null;

  const draft = value ?? draftFromTopics(saved.data);
  const limited = draft.siteIds !== null;

  return (
    <fieldset className="space-y-2" aria-describedby={helpId} data-testid="kpi-topics-field">
      <legend className="mb-1 text-sm font-medium text-ink">KPI topics</legend>
      <p id={helpId} className="text-xs text-muted">
        {userId === null ? "Once they're invited, open them again to choose the KPI topics they enter." : "They enter every KPI of these topics at their sites and see them on My KPIs. Picking a topic moves it from whoever had it."}
      </p>
      {userId === null ? null : saved.isPending ? (
        <Skeleton className="h-16 w-full rounded-control" />
      ) : saved.isError ? (
        <p className="flex flex-wrap items-center gap-2 text-sm text-bad" role="alert">
          Couldn't load their KPI topics.
          <Button size="sm" variant="ghost" onClick={() => void saved.refetch()}>
            Try again
          </Button>
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="KPI topics">
            {KPI_TOPICS.map((t) => {
              const picked = draft.topics.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={picked}
                  onClick={() => onChange(toggleTopic(draft, t))}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-chip border px-2 py-1 text-xs font-medium",
                    picked ? "border-brand bg-tint text-brand-text" : "border-line text-muted hover:text-ink",
                    focusRing,
                  )}
                >
                  {picked && <Check aria-hidden className="size-3" />}
                  {TOPIC_LABEL[t]}
                </button>
              );
            })}
          </div>
          {sites.length > 1 && (
            <div className="space-y-1.5">
              <Toggle
                label="Only at some of their sites"
                hideLabel
                checked={limited}
                onChange={(only) => onChange({ ...draft, siteIds: only ? sites.map((s) => s.site_id) : null })}
                inlineLabel="Only at some of their sites"
              />
              {limited && (
                <ul className="space-y-0.5 rounded-control border border-line p-1" aria-label="Sites for these topics">
                  {sites.map((s) => (
                    <li key={s.site_id}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-chip px-2 py-1.5 text-sm text-ink hover:bg-tint">
                        <input
                          type="checkbox"
                          className={cn("size-4 accent-brand", focusRing)}
                          checked={draft.siteIds?.includes(s.site_id) ?? false}
                          onChange={(e) => onChange({ ...draft, siteIds: e.target.checked ? [...(draft.siteIds ?? []), s.site_id] : (draft.siteIds ?? []).filter((x) => x !== s.site_id) })}
                        />
                        {s.name}
                      </label>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </fieldset>
  );
}
