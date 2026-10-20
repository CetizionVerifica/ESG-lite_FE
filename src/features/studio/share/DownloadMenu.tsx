// DS-11 · Download ▾ (05-ux S7, mockup "Share and download"): PDF for
// screens (a proof), PDF for print (3 mm bleed, crop marks), PNG pages (all or
// a range, 2× or 300 dpi), and the Final PDF for Managers (a note when a final
// exists; refused with the reasons while checks block). Every file comes from
// the one renderer through a render job; the menu polls it and saves the file.
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Eye, FileImage, FileText, Lock, Printer } from "lucide-react";
import { Button, Callout, NumberField, Popover, SegmentedControl, Toggle, cn, focusRing } from "../../../ui";
import type { JobKind, PngDpi } from "../../../lib/studio/contracts";
import { finalBlockedReason, finalRefusal, jobStatusText, pngPages, type PageRange } from "../../../lib/studio/outputs";
import { useSafeToast } from "./useSafeToast";
import { dsError, useRenderJob } from "./api";
import { FinalForm } from "../checks/FinalForm"; // DS-12
import { useChecksState } from "../checks/store"; // DS-12
import { finalBlock } from "../../../lib/studio/checks"; // DS-12

type Panel = "print" | "png" | "final" | null;

function Item({ icon, title, sub, onClick, disabled, active, testId }: { icon: React.ReactNode; title: string; sub: string; onClick: () => void; disabled?: boolean; active?: boolean; testId?: string }) {
  return (
    <button
      type="button"
      role="menuitem"
      data-testid={testId}
      aria-disabled={disabled || undefined}
      aria-expanded={active}
      onClick={disabled ? undefined : onClick}
      className={cn("flex w-full items-start gap-2.5 rounded-control px-2.5 py-2 text-left text-[13px]", disabled ? "cursor-not-allowed text-muted" : "text-ink hover:bg-tint", active && "bg-tint", focusRing)}
    >
      <span aria-hidden className="mt-0.5 text-muted">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block text-xs text-muted">{sub}</span>
      </span>
    </button>
  );
}

export interface DownloadMenuProps {
  docId: number;
  /** Pages in the design (PNG range check). */
  pageCount?: number | null;
  /** Manager or Superadmin. */
  canFinal: boolean;
  /** Button look: the editor's top bar uses the primary button. */
  variant?: "primary" | "secondary";
  /** Adds "Page view and PDF proof" at the top (the editor). */
  pageViewHref?: string;
}

export function DownloadMenu({ docId, pageCount = null, canFinal, variant = "primary", pageViewHref }: DownloadMenuProps) {
  const [panel, setPanel] = useState<Panel>(null);
  const [cropMarks, setCropMarks] = useState(true);
  const [range, setRange] = useState<"all" | "range">("all");
  const [from, setFrom] = useState<number | null>(1);
  const [to, setTo] = useState<number | null>(pageCount ?? 1);
  const [dpi, setDpi] = useState<PngDpi>(144);
  const toast = useSafeToast();
  const run = useRenderJob(docId);
  const checksData = useChecksState(docId).data; // DS-12: the item says why the final is blocked
  const blocked = finalBlockedReason({ canFinal });
  const checksBlocked = finalBlock(checksData?.checks, { canFinal });

  // Tell the person when a job ends, even with the menu closed.
  const told = useRef<number | null>(null);
  useEffect(() => {
    const j = run.job;
    if (!j || (j.status !== "done" && j.status !== "failed") || told.current === j.id) return;
    told.current = j.id;
    toast({ title: jobStatusText(j), tone: j.status === "done" ? "good" : "bad", description: j.status === "done" && j.fileName ? j.fileName : undefined });
  }, [run.job, toast]);

  const start = (kind: JobKind, extra: { options?: Record<string, unknown>; note?: string } = {}) => {
    run.start.mutate({ kind, ...(extra.options ? { options: extra.options } : {}), ...(extra.note ? { note: extra.note } : {}) });
  };

  const pngRange: PageRange = range === "all" ? { all: true } : { all: false, from: from ?? 0, to: to ?? 0 };
  const png = pngPages(pngRange, pageCount);
  const err = run.startError ? dsError(run.startError) : null;
  const refusal = err ? finalRefusal(err.code, err.details, err.message) : null;

  return (
    <Popover
      label="Download"
      align="end"
      className="w-[340px] p-2"
      trigger={(t) => (
        <Button {...t} size="sm" variant={variant} icon={<Download aria-hidden className="size-4" />} data-testid="download-menu">
          Download ▾
        </Button>
      )}
    >
      {() => (
        <div role="menu" aria-label="Download" className="flex flex-col gap-0.5">
          <div className="px-2.5 py-1.5 text-xs font-semibold text-muted">Download</div>
          {pageViewHref && (
            <Link role="menuitem" to={pageViewHref} className={cn("flex items-start gap-2.5 rounded-control px-2.5 py-2 text-[13px] text-ink hover:bg-tint", focusRing)}>
              <Eye aria-hidden className="mt-0.5 size-4 text-muted" />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">Page view and PDF proof</span>
                <span className="block text-xs text-muted">Every page as it will print</span>
              </span>
            </Link>
          )}
          <Item testId="dl-proof" icon={<FileText className="size-4" />} title="PDF for screens" sub="Proof · tagged, with bookmarks" disabled={run.busy} onClick={() => start("proof")} />
          <Item icon={<Printer className="size-4" />} title="PDF for print" sub="3 mm bleed · crop marks" active={panel === "print"} onClick={() => setPanel(panel === "print" ? null : "print")} testId="dl-print" />
          {panel === "print" && (
            <div className="mx-2.5 mb-1 flex flex-col gap-2 rounded-control border border-line p-2.5">
              <Toggle label="Crop marks" checked={cropMarks} onChange={setCropMarks} inlineLabel={cropMarks ? "On" : "Off"} help="Bleed is 3 mm on every edge of paper formats. RGB." />
              <Button size="sm" variant="primary" loading={run.busy} onClick={() => start("print", { options: { cropMarks } })} data-testid="dl-print-go">
                Download print PDF
              </Button>
            </div>
          )}
          <Item icon={<FileImage className="size-4" />} title="PNG pages" sub="All or a range · 2× or 300 dpi" active={panel === "png"} onClick={() => setPanel(panel === "png" ? null : "png")} testId="dl-png" />
          {panel === "png" && (
            <div className="mx-2.5 mb-1 flex flex-col gap-2 rounded-control border border-line p-2.5">
              <SegmentedControl
                label="Pages"
                size="sm"
                value={range}
                onChange={setRange}
                options={[
                  { value: "all", label: "All pages" },
                  { value: "range", label: "A range" },
                ]}
              />
              {range === "range" && (
                <div className="grid grid-cols-2 gap-2">
                  <NumberField label="From page" value={from} onChange={setFrom} min={1} step={1} />
                  <NumberField label="To page" value={to} onChange={setTo} min={1} step={1} />
                </div>
              )}
              <SegmentedControl
                label="Resolution"
                size="sm"
                value={String(dpi) as "144" | "300"}
                onChange={(v) => setDpi(Number(v) as PngDpi)}
                options={[
                  { value: "144", label: "2× (screens)" },
                  { value: "300", label: "300 dpi (print)" },
                ]}
              />
              {png.error && (
                <p className="text-xs text-bad" role="alert">
                  {png.error}
                </p>
              )}
              <Button size="sm" variant="primary" loading={run.busy} disabled={!!png.error} onClick={() => start("png", { options: { dpi, ...(png.pages ? { pages: png.pages } : {}) } })} data-testid="dl-png-go">
                Download PNG pages
              </Button>
            </div>
          )}
          <div aria-hidden className="my-1 h-px bg-line" />
          <Item
            icon={<Lock className="size-4" />}
            title="Final PDF"
            sub={blocked ?? (checksBlocked ? `Blocked: ${checksBlocked}` : "Frozen version with a data snapshot")}
            disabled={!!blocked}
            active={panel === "final"}
            onClick={() => setPanel(panel === "final" ? null : "final")}
            testId="dl-final"
          />
          {panel === "final" && !blocked && (
            <div className="mx-2.5 mb-1 flex flex-col gap-2 rounded-control border border-line p-2.5">
              {/* DS-12: the checks decide; warnings are acknowledged here. */}
              <FinalForm docId={docId} canFinal={canFinal} compact />
            </div>
          )}
          {(run.job || refusal) && (
            <div className="px-2.5 pb-1.5 pt-1" role="status" aria-live="polite" data-testid="download-status">
              {refusal ? (
                <Callout tone="warn" title={err?.code === "DS_VERSION_CONFLICT" ? "The design changed. Try again." : "The file couldn't be started"}>
                  <ul className="list-disc pl-4 text-xs">
                    {refusal.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                </Callout>
              ) : run.job ? (
                <div className="flex items-center gap-2 text-xs">
                  <span className={cn("flex-1", run.job.status === "failed" ? "text-bad" : "text-muted")}>{jobStatusText(run.job)}</span>
                  {run.job.status === "done" && (
                    <Button size="sm" variant="ghost" onClick={() => void run.download(run.job!)}>
                      Download again
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}
    </Popover>
  );
}
