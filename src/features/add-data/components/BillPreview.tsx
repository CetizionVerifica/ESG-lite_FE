import { useState } from "react";
import { Maximize2 } from "lucide-react";
import { Button, DocumentViewer, EmptyState, cn, documentKind, panel, type ViewerFile } from "../../../ui";

/** The bill next to its rows: inline on wide screens, full screen on demand. */
export function BillPreview({ file }: { file: ViewerFile | null }) {
  const [open, setOpen] = useState(false);
  const kind = file ? documentKind(file.type) : "other";
  return (
    <div className={cn(panel, "flex flex-col overflow-hidden")}>
      <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
        <p className="truncate text-sm font-medium text-ink">{file?.name ?? "Bill"}</p>
        <Button size="sm" variant="ghost" icon={<Maximize2 className="size-4" />} disabled={!file} onClick={() => setOpen(true)}>
          Open
        </Button>
      </div>
      <div className="hidden h-[32rem] items-center justify-center bg-tint lg:flex">
        {!file ? (
          <EmptyState title="The bill's file isn't available" description="Its rows can still be checked and used." />
        ) : kind === "image" ? (
          <img src={file.url} alt={`Bill ${file.name}`} className="max-h-full max-w-full object-contain" />
        ) : kind === "pdf" ? (
          <iframe src={`${file.url}#toolbar=0&navpanes=0`} title={`Bill ${file.name}`} className="size-full border-0" />
        ) : (
          <EmptyState title="No preview for this file type" description="Open it to download." />
        )}
      </div>
      <DocumentViewer open={open} onClose={() => setOpen(false)} file={file} />
    </div>
  );
}
