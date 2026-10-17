import { Download } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, Callout, KpiStrip, cn, focusRing } from "../../../ui";
import type { ImportResult } from "../logic";

export type ImportState =
  | { status: "running" }
  | { status: "done"; result: ImportResult }
  /** `planChanged`: the plan moved since the preview, so the same import would be refused again and only "Back to preview" helps. */
  | { status: "error"; message: string; planChanged?: boolean };

export function ImportStep(props: {
  state: ImportState;
  total: number;
  /** Null when there is nothing to download (no skips, or an older service with no row list and no skips in the preview). */
  skippedFile: { partial: boolean } | null;
  onDownloadSkipped: () => void;
  /** Smart import: "Review rows" in Approvals for the batch just made. */
  reviewLink?: string | null;
  onBackground: () => void;
  onRetry: () => void;
  onBack: () => void;
  onAnother: () => void;
  /** SE-1: false for a User: no Category 3 (FERA) count. */
  detail?: boolean;
}) {
  const { state, total } = props;
  const detail = props.detail !== false;

  if (state.status === "running") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink" role="status">
          Importing {total} {total === 1 ? "row" : "rows"}…
        </p>
        <div role="progressbar" aria-label="Import progress" aria-busy="true" className="h-2 overflow-hidden rounded-full bg-tint">
          <span className="block h-full w-full animate-pulse bg-accent" />
        </div>
        <p className="text-sm text-muted">The rows are checked again and saved together, so a failed import saves nothing. You can leave this page; the import keeps running and you'll get a message when it's done.</p>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={props.onBackground}>
            Continue in background
          </Button>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="space-y-4">
        <Callout tone="warn" title="The import didn't finish">
          {state.message}
        </Callout>
        <div className="flex flex-wrap justify-between gap-3">
          <Button variant={state.planChanged ? "primary" : "secondary"} onClick={props.onBack}>
            Back to preview
          </Button>
          {!state.planChanged && (
            <Button variant="primary" onClick={props.onRetry}>
              Try again
            </Button>
          )}
        </div>
      </div>
    );
  }

  const { result } = state;
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink" role="status">
        {result.inserted === 0 ? "No rows were imported." : `Imported ${result.inserted} ${result.inserted === 1 ? "row" : "rows"}.`}
      </p>
      <KpiStrip
        items={[
          { label: "Imported", value: result.inserted, format: "number", primary: true, hint: detail && result.fera_inserted ? `plus ${result.fera_inserted} FERA ${result.fera_inserted === 1 ? "row" : "rows"}` : undefined },
          { label: "Skipped", value: result.skipped, format: "number" },
          { label: "Rows in the sheet", value: result.total_rows, format: "number" },
        ]}
      />
      {result.inserted > 0 && (
        <Callout
          tone="info"
          title="Rows arrive as Pending"
          action={
            props.reviewLink ? (
              <Link to={props.reviewLink} className={cn("text-sm font-medium text-accent underline", focusRing)}>
                Review rows
              </Link>
            ) : undefined
          }
        >
          {props.reviewLink ? "Approve or reject each row in Approvals, or approve all pending rows of the batch at once." : "The site's manager approves them in Approvals, under Upload batches."}
        </Callout>
      )}
      {result.skipped > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            {result.skipped} {result.skipped === 1 ? "row was" : "rows were"} skipped{props.skippedFile ? ". The file gives the reason for each one." : "."}
            {props.skippedFile?.partial ? " The file lists only some of them: the service didn't return every skipped row." : ""}
          </p>
          {props.skippedFile && (
            <Button variant="secondary" icon={<Download aria-hidden className="size-4" />} onClick={props.onDownloadSkipped}>
              Download skipped rows
            </Button>
          )}
        </div>
      )}
      <div className="flex justify-end">
        <Button variant="primary" onClick={props.onAnother}>
          Start another upload
        </Button>
      </div>
    </div>
  );
}
