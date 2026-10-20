// DS-10 · on a resized copy: "Made from <source title>" (a link to the source)
// and, when the source's approved data moved since the copy was made,
// "Source data changed". The copy's own numbers resolve live from the same
// bindings, so the note is a prompt to review the text, not a stale-data warning.
import { Link } from "react-router-dom";
import { AlertTriangle, Link2 } from "lucide-react";
import { Tooltip, cn, focusRing } from "../../../ui";
import type { ReportDoc } from "../../../lib/studio/contracts";
import { useLinkedSource } from "./api";

const pill = "inline-flex h-6 min-w-0 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap";

export function LinkedSourceChip({ docId, doc }: { docId: number; doc: ReportDoc }) {
  const link = doc.source ?? null;
  const q = useLinkedSource(docId, !!link);
  if (!link) return null;
  const src = q.data?.source ?? null;
  if (!src) {
    return (
      <span className={cn(pill, "bg-tint text-muted")} data-testid="linked-source">
        <Link2 aria-hidden className="size-3.5 flex-none" /> {q.isError ? "Made from another design" : "Made from …"}
      </span>
    );
  }
  if (!src.exists) {
    return (
      <Tooltip content="The design this copy was made from was deleted. The copy keeps its links to the data.">
        <span className={cn(pill, "bg-tint text-muted")} data-testid="linked-source">
          <Link2 aria-hidden className="size-3.5 flex-none" /> Made from a deleted design
        </span>
      </Tooltip>
    );
  }
  return (
    // A fixed width (the source title truncates): the design's own title gives way first.
    <span className="inline-flex flex-none items-center gap-1.5" data-testid="linked-source">
      <Link to={`/studio/${src.docId}`} className={cn(pill, "max-w-[10rem] bg-tint text-ink hover:bg-brand-50 2xl:max-w-[16rem]", focusRing)} title={`Made from ${src.title ?? ""}`}>
        <Link2 aria-hidden className="size-3.5 flex-none" />
        <span className="truncate">Made from {src.title}</span>
      </Link>
      {src.dataChanged && (
        <Tooltip content="Approved data changed since this copy was made. The numbers here already show the new values: check the text around them.">
          <span className={cn(pill, "flex-none bg-warn-soft text-warn")} data-testid="source-data-changed" tabIndex={0}>
            <AlertTriangle aria-hidden className="size-3.5 flex-none" /> Source data changed
          </span>
        </Tooltip>
      )}
    </span>
  );
}
