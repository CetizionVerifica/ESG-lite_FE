import { AlertTriangle, CheckCircle2, RefreshCw, XCircle } from "lucide-react";
import { Button, EmptyState, SkeletonText } from "../../../../ui";
import type { BuilderTab } from "../../builder";
import { type CheckIssue, type FormCheck, fixCount, tabForIssue } from "../../check";

type Props = {
  check: FormCheck | null | undefined;
  /** The result is for the unsaved changes, not the saved form. */
  isDraft: boolean;
  /** The form changed since this result. */
  stale: boolean;
  loading: boolean;
  error: boolean;
  checking: boolean;
  onCheck: () => void;
  onGo: (tab: BuilderTab) => void;
  tabLabel: (tab: BuilderTab) => string;
};

/**
 * SE-4 · What keeps this form from going live: errors stop a new version (and
 * a save that adds them), warnings don't. Each problem links to the tab that fixes it.
 */
export function CheckTab({ check, isDraft, stale, loading, error, checking, onCheck, onGo, tabLabel }: Props) {
  if (loading) return <SkeletonText lines={4} />;
  if (error || check === null) {
    return (
      <EmptyState
        variant="error"
        title="Couldn't check this form."
        description="The server didn't return a check. Saving still works; try again in a moment."
        action={<Button onClick={onCheck}>Check again</Button>}
      />
    );
  }
  if (!check) return null;

  const item = (i: CheckIssue, tone: "bad" | "warn") => {
    const tab = tabForIssue(i.field);
    return (
      <li key={`${i.code}-${i.field}`} className="flex items-start gap-2 border-b border-line py-2 last:border-b-0" data-code={i.code}>
        {tone === "bad" ? <XCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-bad" /> : <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-warn" />}
        <span className="min-w-0 flex-1 text-sm text-ink">{i.message}</span>
        <button type="button" className="shrink-0 text-xs text-brand-text underline-offset-2 hover:underline" onClick={() => onGo(tab)}>
          Go to {tabLabel(tab)}
        </button>
      </li>
    );
  };

  return (
    <div className="space-y-4" data-testid="form-check">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted">
          {isDraft ? "Your unsaved changes" : "The saved form"}, checked against the factors for {check.year || "this year"}
          {check.year ? ` (rows dated ${check.year + 1})` : ""}.{stale ? " The form changed since: check again." : ""}
        </p>
        <Button size="sm" variant="secondary" icon={<RefreshCw aria-hidden className="size-4" />} loading={checking} onClick={onCheck}>
          Check again
        </Button>
      </div>

      {check.errors.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-good">
          <CheckCircle2 aria-hidden className="size-4" />
          No problems: {isDraft ? "saving publishes it as a new version." : "this form can go live."}
        </p>
      ) : (
        <section aria-labelledby="check-errors">
          <h3 id="check-errors" className="text-sm font-semibold text-bad">
            Fix {fixCount(check.errors.length)} before it can go live
          </h3>
          <p className="mt-1 text-xs text-muted">Contributors who pick one of these get no total. The form stays as it is until they're fixed; a change can't add new ones.</p>
          <ul className="mt-2">{check.errors.map((i) => item(i, "bad"))}</ul>
        </section>
      )}

      {check.warnings.length > 0 && (
        <section aria-labelledby="check-warnings">
          <h3 id="check-warnings" className="text-sm font-semibold text-warn">
            {check.warnings.length} {check.warnings.length === 1 ? "warning" : "warnings"}
          </h3>
          <p className="mt-1 text-xs text-muted">These don't stop the form going live.</p>
          <ul className="mt-2">{check.warnings.map((i) => item(i, "warn"))}</ul>
        </section>
      )}
    </div>
  );
}
