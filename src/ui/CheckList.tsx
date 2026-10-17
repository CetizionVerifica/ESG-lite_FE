import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { CheckLine } from "../lib/scope3/checks";
import { CHECK_ICONS } from "./checkIcons";
import { cn } from "./cn";

/**
 * Review checks as a list (S3-15): held ones first with their hint, then the
 * passed ones. Icon, word and "Pass"/"Held", never colour alone. Used by the
 * approvals drawer ("Why held") and the Fix screen's live checks.
 */
export function CheckList({ lines, testId }: { lines: CheckLine[]; testId?: string }) {
  const ordered = [...lines.filter((l) => !l.passed), ...lines.filter((l) => l.passed)];
  return (
    <ul className="divide-y divide-line rounded-control border border-line" data-testid={testId}>
      {ordered.map((l) => {
        const Icon = CHECK_ICONS[l.icon];
        return (
          <li key={l.id} className="flex items-start gap-2 px-3 py-2 text-sm" data-check={l.id} data-passed={l.passed}>
            {l.passed ? <CheckCircle2 aria-hidden className="mt-0.5 size-4 shrink-0 text-good" /> : <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warn" />}
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <Icon aria-hidden className="size-3.5 shrink-0 text-muted" />
                <span className={cn(!l.passed && "font-medium")}>{l.label}</span>
                <span className="sr-only">{l.passed ? "(passed)" : "(held)"}</span>
              </span>
              {!l.passed && <span className="mt-0.5 block text-xs text-muted">{l.hint}</span>}
            </span>
            <span className={cn("shrink-0 text-xs font-medium", l.passed ? "text-good" : "text-warn")} aria-hidden>
              {l.passed ? "Pass" : "Held"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
