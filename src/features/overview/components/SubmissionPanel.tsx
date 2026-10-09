import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { SubmissionUser } from "../../../services/overviewService";
import { Avatar, Button, EmptyState, Select, SkeletonText } from "../../../ui";
import { monthLabel } from "../logic";

/** Who has submitted for a month (last 6 months), submitted first counts, missing people listed first. */
export function SubmissionPanel(props: {
  month: string;
  months: string[];
  onMonthChange: (month: string) => void;
  users: SubmissionUser[] | undefined;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const users = [...(props.users ?? [])].sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === "missing" ? -1 : 1));
  const submitted = users.filter((u) => u.status === "submitted").length;
  const missing = users.length - submitted;
  const options = [...new Set([props.month, ...props.months])].sort().reverse().map((m) => ({ value: m, label: monthLabel(m) }));
  return (
    <section id="submission-status" aria-labelledby="overview-submission" className="scroll-mt-20 rounded-card border border-line bg-panel p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 id="overview-submission" className="text-sm font-semibold text-ink">
          Submission status
        </h3>
        <Select<string> label="Month" hideLabel value={props.month} onChange={(v) => v && props.onMonthChange(v)} options={options} className="w-40" />
      </div>
      {props.loading && !props.users ? (
        <SkeletonText lines={4} />
      ) : props.error ? (
        <EmptyState compact variant="error" title={props.error} action={<Button size="sm" onClick={props.onRetry}>Try again</Button>} />
      ) : users.length === 0 ? (
        <EmptyState compact title="No contributors on these sites." />
      ) : (
        <>
          <p className="mb-2 flex gap-4 text-sm">
            <span className="flex items-center gap-1.5 text-good">
              <CheckCircle2 aria-hidden className="size-4" />
              {submitted} submitted
            </span>
            <span className="flex items-center gap-1.5 text-bad">
              <AlertCircle aria-hidden className="size-4" />
              {missing} missing
            </span>
          </p>
          <ul aria-label={`Contributors for ${monthLabel(props.month)}`} className="max-h-72 space-y-1 overflow-y-auto">
            {users.map((u) => (
              <li key={`${u.user_id}-${u.site_name}`} className="flex items-center gap-2.5 py-1 text-sm">
                <Avatar size="sm" name={u.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-ink">{u.name}</span>
                  <span className="block truncate text-xs text-muted">{u.site_name}</span>
                </span>
                {u.status === "submitted" ? (
                  <span className="font-num text-xs text-good">{u.submission_count} {u.submission_count === 1 ? "entry" : "entries"}</span>
                ) : (
                  <span className="text-xs font-medium text-bad">Missing</span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
