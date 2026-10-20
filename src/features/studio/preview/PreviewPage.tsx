// DS-11 · `/studio/:id/preview` (RS-5 FE, 05-ux S7): Page view (every page as
// it will print, from preview.html in a sandboxed frame; clicking an element
// opens it in the editor) and the PDF proof (a proof job, shown in the
// browser's PDF viewer, downloadable). Download ▾ and Share ▾ sit in the bar.
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, FileText, Play, RefreshCw } from "lucide-react";
import { Button, EmptyState, Loading, SegmentedControl, cn, focusRing } from "../../../ui";
import { editorLink, jobStatusText, type BridgeMessage } from "../../../lib/studio/outputs";
import { useStudioCompanyId } from "../../../lib/studio/switch";
import { useDoc } from "../docs/api";
import { dsError, fetchFile, saveBlob, useJobs, usePreviewHtml, useRenderJob } from "../share/api";
import { DownloadMenu } from "../share/DownloadMenu";
import { ShareMenu } from "../share/ShareMenu";
import { useCanManage } from "../share/useCanManage";
import { PreviewFrame } from "./PreviewFrame";

type Tab = "pages" | "proof";

/** The newest finished, unexpired PDF proof of the design as an object URL. */
function useProofUrl(docId: number, jobId: number | null) {
  const companyId = useStudioCompanyId();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!jobId) return;
    let alive = true;
    let made: string | null = null;
    setError(false);
    fetchFile(`/studio/jobs/${jobId}/file`, companyId)
      .then((blob) => {
        if (!alive) return;
        made = URL.createObjectURL(blob);
        setUrl(made);
      })
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [docId, jobId, companyId]);
  return { url, error };
}

function ProofTab({ docId }: { docId: number }) {
  const jobs = useJobs(docId);
  const run = useRenderJob(docId, { autoDownload: false });
  const latest = (jobs.data ?? []).find((j) => j.kind === "proof" && j.status === "done" && j.downloadUrl) ?? null;
  const shownId = run.job?.status === "done" ? run.job.id : (latest?.id ?? null);
  const shown = run.job?.status === "done" ? run.job : latest;
  const proof = useProofUrl(docId, shownId);
  const companyId = useStudioCompanyId();
  const { refetch } = jobs;
  useEffect(() => {
    if (run.job?.status === "done") void refetch();
  }, [run.job?.status, refetch]);
  const startErr = run.startError ? dsError(run.startError) : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-4 py-2 text-[13px]">
        <span className="flex-1 text-muted" role="status" aria-live="polite">
          {run.job && run.job.status !== "done" ? jobStatusText(run.job) : shown ? `PDF proof · ${shown.pageCount ?? "?"} pages · kept until ${new Date(shown.expiresAt ?? shown.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : "No PDF proof yet."}
          {startErr && <span className="ml-2 text-bad">{startErr.message ?? "The proof couldn't be started."}</span>}
        </span>
        {shown && (
          <Button size="sm" variant="secondary" onClick={() => void fetchFile(shown.downloadUrl as string, companyId).then((b) => saveBlob(b, shown.fileName ?? "proof.pdf"))}>
            Download
          </Button>
        )}
        <Button size="sm" variant="primary" loading={run.busy} icon={<FileText aria-hidden className="size-4" />} onClick={() => run.start.mutate({ kind: "proof" })} data-testid="make-proof">
          {shown ? "Make a new proof" : "Make PDF proof"}
        </Button>
      </div>
      <div className="min-h-0 flex-1 bg-canvas">
        {jobs.isPending ? (
          <Loading label="Loading proofs">{null}</Loading>
        ) : proof.url ? (
          <iframe title="PDF proof" src={proof.url} className="block size-full border-0" data-testid="proof-viewer" />
        ) : proof.error ? (
          <EmptyState variant="error" title="The proof couldn't be opened." description="It may have expired. Make a new proof." />
        ) : (
          <EmptyState icon={FileText} title="See the PDF before you share it." description="A proof is the PDF as it will download, with bookmarks. Proofs are kept 7 days." />
        )}
      </div>
    </div>
  );
}

export function PreviewPage() {
  const { id } = useParams();
  const docId = Number(id);
  const valid = Number.isInteger(docId) && docId > 0;
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("pages");
  const doc = useDoc(valid ? docId : null);
  const preview = usePreviewHtml(valid ? docId : 0, "paged");
  const canManage = useCanManage();
  const [pages, setPages] = useState<number | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const lastHtml = useRef<string | null>(null);
  if (preview.data?.html && preview.data.html !== lastHtml.current) lastHtml.current = preview.data.html;

  if (!valid) return <EmptyState title="This design doesn't exist." description="Open a design from Design Studio." />;
  if (doc.isError) {
    const e = dsError(doc.error);
    return <EmptyState variant="error" title="This design couldn't be opened." description={e.code === "DS_DOC_NOT_FOUND" ? "It was deleted, or it belongs to sites you can't see." : (e.message ?? "Try again.")} />;
  }

  const onMessage = (m: BridgeMessage) => {
    if (m.type === "ready") {
      setPages(m.pageCount);
      setRenderError(m.error);
    } else if (m.type === "select" && (m.pageId || m.elId)) navigate(editorLink(docId, m.pageId, m.elId));
  };

  return (
    <div className="-m-4 flex h-[calc(100vh-56px)] min-h-[480px] flex-col sm:-m-6 lg:-m-8" data-testid="studio-preview">
      <header className="flex h-12 flex-none items-center gap-2 border-b border-line bg-panel px-3" aria-label="Page view">
        <Link to={`/studio/${docId}`} className={cn("inline-flex h-8 items-center gap-1 rounded-control px-2.5 text-[13px] font-medium text-ink hover:bg-tint", focusRing)}>
          <ChevronLeft aria-hidden className="size-4" /> Editor
        </Link>
        <span aria-hidden className="mx-1 h-5 w-px bg-line" />
        <h1 className="min-w-0 truncate text-sm font-semibold text-ink">{doc.data?.title ?? "Design"}</h1>
        {pages !== null && tab === "pages" && <span className="whitespace-nowrap text-xs text-muted">{pages} pages</span>}
        <div className="flex-1" />
        <SegmentedControl
          label="View"
          size="sm"
          value={tab}
          onChange={setTab}
          options={[
            { value: "pages", label: "Page view" },
            { value: "proof", label: "PDF proof" },
          ]}
        />
        {tab === "pages" && (
          <Button size="sm" variant="ghost" icon={<RefreshCw aria-hidden className="size-4" />} loading={preview.isFetching} onClick={() => void preview.refetch()} aria-label="Refresh Page view">
            Refresh
          </Button>
        )}
        <Link to={`/studio/${docId}/present`} className={cn("inline-flex h-8 items-center gap-1.5 rounded-control border border-line px-2.5 text-[13px] font-medium text-ink hover:bg-tint", focusRing)}>
          <Play aria-hidden className="size-4" /> Present
        </Link>
        <ShareMenu docId={docId} canShare={canManage} />
        <DownloadMenu docId={docId} canFinal={canManage} pageCount={pages} />
      </header>
      <div className="min-h-0 flex-1 bg-canvas">
        {tab === "proof" ? (
          <ProofTab docId={docId} />
        ) : preview.isError ? (
          <EmptyState variant="error" title="Page view couldn't be made." description={dsError(preview.error).message ?? "Try again."} action={<Button size="sm" onClick={() => void preview.refetch()}>Try again</Button>} />
        ) : !lastHtml.current ? (
          <Loading label="Laying out the pages">{null}</Loading>
        ) : (
          <>
            {renderError && (
              <p role="alert" className="border-b border-line bg-panel px-4 py-1.5 text-xs text-bad">
                Some pages couldn't be laid out. The PDF may differ: {renderError}
              </p>
            )}
            <PreviewFrame html={lastHtml.current} title="Page view" onMessage={onMessage} />
          </>
        )}
      </div>
    </div>
  );
}
