import { Download } from "lucide-react";
import { Button, Callout, KpiStrip } from "../../../ui";
import type { ImportResult } from "../logic";

export type ImportState = { status: "running" } | { status: "done"; result: ImportResult } | { status: "error"; message: string };

export function ImportStep(props: {
  state: ImportState;
  total: number;
  /** Null when there is nothing to download (no skips, or an older service with no row list and no skips in the preview). */
  skippedFile: { partial: boolean } | null;
  onDownloadSkipped: () => void;
  onBackground: () => void;
  onRetry: () => void;
  onBack: () => void;
  onAnother: () => void;
}) {
  const { state, total } = props;

  if (state.status === "running") {
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink" role="status">
          Importing {total} {total === 1 ? "row" : "rows"}…
        </p>
        <div role="progressbar" aria-label="Import progress" aria-busy="true" className="h-2 overflow-hidden rounded-full bg-tint">
          <span className="block h-full w-full animate-pulse bg-accent" />
        </div>
        <p className="text-sm text-muted">The rows are saved together, so a failed import saves nothing. You can leave this page; the import keeps running and you'll get a message when it's done.</p>
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
          <Button variant="secondary" onClick={props.onBack}>
            Back to preview
          </Button>
          <Button variant="primary" onClick={props.onRetry}>
            Try again
          </Button>
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
          { label: "Imported", value: result.inserted, format: "number", primary: true },
          { label: "Skipped", value: result.skipped, format: "number" },
          { label: "Rows in the sheet", value: result.total_rows, format: "number" },
        ]}
      />
      {result.inserted > 0 && (
        <Callout tone="info" title="Rows arrive as Pending">
          The site's manager approves them in Approvals, under Upload batches.
        </Callout>
      )}
      {result.skipped > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted">
            {result.skipped} {result.skipped === 1 ? "row was" : "rows were"} skipped because their category needs fields the sheet doesn't have.
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
