import { Loader2, Sparkles } from "lucide-react";
import { AI_DOWN_MESSAGE } from "../../../../lib/kpi/ai";
import { Button, FileDrop, cn, panel } from "../../../../ui";

export type AiFillState =
  | { status: "idle" }
  | { status: "reading"; file: string }
  | { status: "done"; file: string; found: number; matched: number }
  | { status: "down"; file: string; message: string | null }
  | { status: "error"; file: string; message: string };

const ACCEPT = [".pdf", ".png", ".jpg", ".jpeg", ".webp", ".heic", ".xlsx", ".xls", ".csv", ".docx"];

/**
 * KPI-12 · "Fill from a document" on My KPIs: drop a water bill, an HR
 * summary or a waste manifest, and the matching cards get AI suggestions to
 * check. Reading can take a minute; the page keeps working meanwhile.
 */
export function AiFillPanel({ state, onFile, onClear, pending }: { state: AiFillState; onFile: (file: File) => void; onClear: () => void; pending: number }) {
  const reading = state.status === "reading";
  return (
    <section aria-labelledby="ai-fill-heading" className={cn(panel, "space-y-3 p-4")} data-testid="ai-fill">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-0.5">
          <h2 id="ai-fill-heading" className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Sparkles aria-hidden className="size-4 text-muted" />
            Fill from a document
          </h2>
          <p className="text-sm text-muted">Drop a bill, an HR summary or a waste manifest. We suggest values for your KPIs; you check each one before it's saved.</p>
        </div>
        {pending > 0 && (
          <Button size="sm" variant="ghost" onClick={onClear}>
            Clear suggestions
          </Button>
        )}
      </div>
      <FileDrop label="Drop a document here" help="PDF, photo or spreadsheet, up to 20 MB." accept={ACCEPT} maxSize={20 * 1024 * 1024} multiple={false} maxFiles={1} items={[]} disabled={reading} onAdd={(files) => files[0] && onFile(files[0])} />
      <p aria-live="polite" className="min-h-5 text-sm" data-testid="ai-fill-status">
        {state.status === "reading" ? (
          <span className="inline-flex items-center gap-2 text-muted">
            <Loader2 aria-hidden className="size-4 animate-spin" />
            Reading {state.file}… This can take up to a minute. Keep working; suggestions appear on the cards.
          </span>
        ) : state.status === "done" ? (
          state.matched ? (
            <span className="text-ink">
              {state.found} {state.found === 1 ? "suggestion" : "suggestions"} from {state.file} on {state.matched} {state.matched === 1 ? "KPI" : "KPIs"}. Look for “AI suggestion” below.
            </span>
          ) : (
            <span className="text-muted">Nothing in {state.file} matched the KPIs you enter for this period.</span>
          )
        ) : state.status === "down" ? (
          <span className="text-muted">{state.message || AI_DOWN_MESSAGE}</span>
        ) : state.status === "error" ? (
          <span role="alert" className="text-bad">
            {state.message}
          </span>
        ) : null}
      </p>
    </section>
  );
}
