import { AlertTriangle, CalendarClock, CheckCircle2 } from "lucide-react";
import { Callout, cn } from "../../../ui";
import type { DueState, Progress } from "../logic";

/** "Due in 4 days (10 Oct). 6 of 9 categories filed." with a progress bar; warn after the 10th. */
export function DueBanner({ due, progress }: { due: DueState; progress: Progress }) {
  if (progress.allIn) {
    return (
      <Callout tone="brand" icon={CheckCircle2} title={`All ${progress.total} ${progress.total === 1 ? "category is" : "categories are"} in. Nice work.`} />
    );
  }
  const late = due.phase !== "open";
  const pct = progress.total ? Math.round((progress.filed / progress.total) * 100) : 0;
  const Icon = late ? AlertTriangle : CalendarClock;
  return (
    <section
      role={late ? "status" : undefined}
      aria-label="Due date"
      className={cn("rounded-card border p-4", late ? "border-warn/30 bg-warn-soft" : "border-line bg-panel")}
    >
      <p className="flex items-start gap-2 text-sm font-medium text-ink">
        <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", late ? "text-warn" : "text-brand-text")} />
        <span>{due.message}</span>
      </p>
      <div
        role="progressbar"
        aria-label="Categories filed"
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.filed}
        className="mt-3 h-2 overflow-hidden rounded-full bg-tint"
      >
        <div className={cn("h-full rounded-full", late ? "bg-warn" : "bg-brand")} style={{ width: `${pct}%` }} />
      </div>
    </section>
  );
}
