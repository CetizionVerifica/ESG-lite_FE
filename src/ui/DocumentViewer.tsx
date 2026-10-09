import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Download, FileQuestion, X } from "lucide-react";
import { Button } from "./Button";
import { EmptyState } from "./EmptyState";
import { Skeleton } from "./Skeleton";
import { cn } from "./cn";
import { documentKind, officeViewerUrl, type ViewerFile } from "./documentKind";
import { formatBytes } from "./fileRules";
import { useFocusTrap } from "./hooks/useFocusTrap";
import { useLockBodyScroll } from "./hooks/useLockBodyScroll";
import { focusRing } from "./styles";

export type DocumentViewerProps = {
  open: boolean;
  onClose: () => void;
  file: ViewerFile | null;
  /** All files in the set, for ‹ › and arrow-key navigation. */
  files?: ViewerFile[];
  onNavigate?: (file: ViewerFile) => void;
};

/**
 * Full-screen preview for bills and evidence: image, PDF, video, audio and
 * Office files (via Office Online), with download and ‹ › between files.
 * Replaces components/DocumentViewerModal with token styling; use
 * fromEmissionDocument() to pass documentService records.
 */
export function DocumentViewer({ open, onClose, file, files = [], onNavigate }: DocumentViewerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const index = file ? files.findIndex((f) => f.url === file.url) : -1;
  const prev = index > 0 ? files[index - 1] : null;
  const next = index >= 0 && index < files.length - 1 ? files[index + 1] : null;
  const kind = file ? documentKind(file.type) : "other";

  const trap = useFocusTrap(ref, open && !!file, onClose);
  useLockBodyScroll(open && !!file);
  useEffect(() => {
    setLoading(kind !== "other");
    setFailed(false);
    // ‹ › can become disabled at either end; keep keyboard focus inside the viewer.
    const root = ref.current;
    const active = document.activeElement as HTMLButtonElement | null;
    if (root && (!root.contains(active) || active?.disabled)) root.focus();
  }, [file?.url, kind]);

  if (!open || !file) return null;
  const done = () => setLoading(false);
  const fail = () => (setLoading(false), setFailed(true));

  let body;
  if (failed || kind === "other")
    body = (
      <EmptyState
        icon={FileQuestion}
        variant={failed ? "error" : "empty"}
        title={failed ? "Couldn't load this file." : "No preview for this file type."}
        action={
          <a href={file.url} download={file.name} className={cn("text-sm font-medium text-brand-text underline", focusRing)}>
            Download {file.name}
          </a>
        }
      />
    );
  else if (kind === "image") body = <img src={file.url} alt={file.name} onLoad={done} onError={fail} className="max-h-full max-w-full object-contain" />;
  else if (kind === "pdf") body = <iframe src={`${file.url}#toolbar=1&navpanes=0`} title={file.name} onLoad={done} className="size-full rounded-control border-0 bg-panel" />;
  else if (kind === "office") body = <iframe src={officeViewerUrl(file.url)} title={file.name} onLoad={done} className="size-full rounded-control border-0 bg-panel" />;
  else if (kind === "video") body = <video src={file.url} controls onLoadedData={done} onError={fail} className="max-h-full max-w-full" />;
  else body = <audio src={file.url} controls onLoadedData={done} onError={fail} className="w-full max-w-md" />;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-ink/80">
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={(e) => {
          trap.onKeyDown(e);
          if (e.defaultPrevented || !onNavigate || (e.target as HTMLElement).tagName === "INPUT") return;
          if (e.key === "ArrowLeft" && prev) onNavigate(prev);
          if (e.key === "ArrowRight" && next) onNavigate(next);
        }}
        className="flex size-full flex-col focus:outline-none"
      >
        <header className="flex items-center gap-3 border-b border-line bg-panel px-4 py-2 text-ink">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-sm font-semibold">
              {file.name}
            </h2>
            <p className="truncate text-xs text-muted">
              {[file.size !== undefined ? formatBytes(file.size) : null, file.meta, files.length > 1 ? `${index + 1} of ${files.length}` : null]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          {onNavigate && files.length > 1 && (
            <>
              <Button size="sm" variant="ghost" aria-label="Previous file" disabled={!prev} onClick={() => prev && onNavigate(prev)}>
                <ChevronLeft aria-hidden className="size-4" />
              </Button>
              <Button size="sm" variant="ghost" aria-label="Next file" disabled={!next} onClick={() => next && onNavigate(next)}>
                <ChevronRight aria-hidden className="size-4" />
              </Button>
            </>
          )}
          <a
            href={file.url}
            download={file.name}
            target="_blank"
            rel="noreferrer"
            className={cn("inline-flex h-8 items-center gap-1.5 rounded-control px-2.5 text-xs font-medium text-ink hover:bg-tint", focusRing)}
          >
            <Download aria-hidden className="size-4" /> Download
          </a>
          <button type="button" aria-label="Close" onClick={onClose} className={cn("rounded-control p-1.5 text-muted hover:bg-tint hover:text-ink", focusRing)}>
            <X aria-hidden className="size-4" />
          </button>
        </header>
        <div className="relative flex min-h-0 flex-1 items-center justify-center p-4" aria-busy={loading || undefined}>
          {loading && !failed && <Skeleton className="absolute inset-4" />}
          <div className={cn("relative flex size-full items-center justify-center rounded-control", (failed || kind === "other") && "bg-panel")}>{body}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
