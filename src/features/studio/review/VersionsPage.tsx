// DS-13 · `/studio/:id/versions` (05-ux S9 "Version history", RS S6): named
// versions and finals pinned at the top, then autosaves grouped by day with
// their author. Selecting one shows it read-only (the version's pages from
// the one renderer); "Restore this version" makes it the draft at a new rev.
// The approvals of the design are listed beside it.
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, Download, History, Pin } from "lucide-react";
import type { ReportVersion } from "../../../lib/studio/contracts";
import { useStudioCompanyId } from "../../../lib/studio/switch";
import { Badge, Button, EmptyState, Loading, Modal, TextField, cn, focusRing } from "../../../ui";
import api from "../../../api/axios";
import { useDoc } from "../docs/api";
import { PreviewFrame } from "../preview/PreviewFrame";
import { currentRev, dsError, fetchFile, outputsKeys, saveBlob, useVersions } from "../share/api";
import { useSafeToast } from "../share/useSafeToast";
import { createSnapshot, restoreVersion, useApprovals } from "./api";
import { VERSION_KIND_LABEL, approvalLine, versionGroups, versionMeta } from "./logic";

async function getVersionPreview(docId: number, n: number, companyId: number | null): Promise<string> {
  const res = await api.get<string>(`/studio/docs/${docId}/versions/${n}/preview.html`, { params: { mode: "paged", ...(companyId ? { company_id: companyId } : {}) }, responseType: "text", transformResponse: (d) => d });
  return String(res.data ?? "");
}

function VersionRow({ v, active, onPick }: { v: ReportVersion; active: boolean; onPick: () => void }) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={active}
        onClick={onPick}
        data-testid={`version-${v.n}`}
        className={cn("flex w-full flex-col items-start gap-0.5 rounded-control border px-3 py-2 text-left", active ? "border-brand bg-brand-50" : "border-transparent hover:bg-tint", focusRing)}
      >
        <span className="flex w-full items-center gap-1.5 text-sm font-medium text-ink">
          v{v.n}
          <Badge tone={v.kind === "final" ? "good" : v.kind === "snapshot" ? "brand" : "neutral"}>{VERSION_KIND_LABEL[v.kind]}</Badge>
          {v.superseded && <Badge tone="warn">Superseded</Badge>}
        </span>
        {v.note && <span className="line-clamp-2 text-xs text-ink">{v.note}</span>}
        <span className="text-xs text-muted">{versionMeta(v)}</span>
      </button>
    </li>
  );
}

export function VersionsPage() {
  const { id } = useParams();
  const docId = Number(id);
  const valid = Number.isInteger(docId) && docId > 0;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useSafeToast();
  const companyId = useStudioCompanyId();
  const doc = useDoc(valid ? docId : null);
  const versions = useVersions(valid ? docId : 0);
  const approvals = useApprovals(valid ? docId : 0);
  const groups = useMemo(() => versionGroups(versions.data ?? []), [versions.data]);
  const [picked, setPicked] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [naming, setNaming] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = (versions.data ?? []).find((v) => v.n === picked) ?? null;
  const preview = useQuery({
    queryKey: ["studio", "version-preview", docId, picked, companyId],
    queryFn: () => getVersionPreview(docId, picked as number, companyId),
    enabled: valid && picked !== null,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (picked === null && versions.data?.length) setPicked(Math.max(...versions.data.map((v) => v.n)));
  }, [picked, versions.data]);

  if (!valid) return <EmptyState title="This design doesn't exist." description="Open a design from Design Studio." />;
  if (doc.isError) {
    const e = dsError(doc.error);
    return <EmptyState variant="error" title="This design couldn't be opened." description={e.code === "DS_DOC_NOT_FOUND" ? "It was deleted, or it belongs to sites you can't see." : (e.message ?? "Try again.")} />;
  }

  const restore = async () => {
    if (!selected) return;
    setBusy(true);
    setError(null);
    try {
      const rev = await currentRev(docId, companyId);
      await restoreVersion(docId, selected.n, rev, companyId);
      await qc.invalidateQueries({ queryKey: outputsKeys.versions(docId) });
      // The editor reads the doc once (staleTime Infinity): drop it so it loads the restored draft.
      qc.removeQueries({ queryKey: ["studio", "doc"] });
      qc.removeQueries({ queryKey: ["studio", "docs", docId] });
      toast({ title: `Version ${selected.n} restored as the draft`, tone: "good" });
      setRestoring(false);
      navigate(`/studio/${docId}`);
    } catch (err) {
      setError(dsError(err).message ?? "It couldn't be restored. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const saveNamed = async () => {
    setBusy(true);
    setError(null);
    try {
      const v = await createSnapshot(docId, note.trim(), companyId);
      await qc.invalidateQueries({ queryKey: outputsKeys.versions(docId) });
      setPicked(v.n);
      setNaming(false);
      setNote("");
    } catch (err) {
      setError(dsError(err).message ?? "The version couldn't be saved.");
    } finally {
      setBusy(false);
    }
  };

  const line = approvalLine(approvals.data);
  return (
    <div className="-m-4 flex h-[calc(100vh-56px)] min-h-[480px] flex-col sm:-m-6 lg:-m-8" data-testid="studio-versions">
      <header className="flex h-12 flex-none items-center gap-2 border-b border-line bg-panel px-3" aria-label="Version history">
        <Link to={`/studio/${docId}`} className={cn("inline-flex h-8 items-center gap-1 rounded-control px-2.5 text-[13px] font-medium text-ink hover:bg-tint", focusRing)}>
          <ChevronLeft aria-hidden className="size-4" /> Editor
        </Link>
        <span aria-hidden className="mx-1 h-5 w-px bg-line" />
        <h1 className="min-w-0 truncate text-sm font-semibold text-ink">Version history · {doc.data?.title ?? "Design"}</h1>
        <div className="flex-1" />
        <Button size="sm" variant="secondary" onClick={() => setNaming(true)}>
          Name this version
        </Button>
        {selected?.pdfUrl && (
          <Button size="sm" variant="secondary" icon={<Download aria-hidden className="size-4" />} onClick={() => void fetchFile(selected.pdfUrl as string, companyId).then((b) => saveBlob(b, `final-v${selected.n}.pdf`))}>
            Download PDF
          </Button>
        )}
        <Button size="sm" variant="primary" disabled={!selected || doc.data?.status === undefined} onClick={() => setRestoring(true)} data-testid="restore-version">
          Restore this version
        </Button>
      </header>
      <div className="flex min-h-0 flex-1">
        <nav aria-label="Versions" className="flex w-[300px] flex-none flex-col gap-3 overflow-auto border-r border-line bg-panel p-3">
          {line && <p className="rounded-control bg-tint px-2.5 py-1.5 text-xs text-ink">{line.text}</p>}
          {versions.isPending ? (
            <Loading label="Loading versions">{null}</Loading>
          ) : versions.isError ? (
            <EmptyState variant="error" compact title="Versions couldn't load." action={<Button size="sm" onClick={() => void versions.refetch()}>Try again</Button>} />
          ) : !versions.data?.length ? (
            <EmptyState compact icon={History} title="No versions yet." description="Versions are saved every 10 minutes while you edit, and when you name one." />
          ) : (
            <>
              {groups.pinned.length > 0 && (
                <section aria-label="Named versions and finals">
                  <h2 className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted">
                    <Pin aria-hidden className="size-3" /> Named and finals
                  </h2>
                  <ul className="flex flex-col gap-0.5">
                    {groups.pinned.map((v) => (
                      <VersionRow key={v.n} v={v} active={v.n === picked} onPick={() => setPicked(v.n)} />
                    ))}
                  </ul>
                </section>
              )}
              {groups.days.map((d) => (
                <section key={d.key} aria-label={d.label}>
                  <h2 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{d.label}</h2>
                  <ul className="flex flex-col gap-0.5">
                    {d.versions.map((v) => (
                      <VersionRow key={v.n} v={v} active={v.n === picked} onPick={() => setPicked(v.n)} />
                    ))}
                  </ul>
                </section>
              ))}
              <p className="text-[11px] text-muted">Autosaves are kept 90 days or the newest 200. Named versions and finals are kept.</p>
            </>
          )}
        </nav>
        <main className="min-w-0 flex-1 bg-canvas" aria-label="Version preview">
          {picked === null ? null : preview.isPending ? (
            <Loading label="Laying out the version">{null}</Loading>
          ) : preview.isError ? (
            <EmptyState variant="error" title="This version couldn't be shown." description={dsError(preview.error).message ?? "Try again."} />
          ) : (
            <PreviewFrame html={preview.data ?? ""} title={`Version ${picked}, read-only`} onMessage={() => undefined} />
          )}
        </main>
      </div>
      <Modal
        open={restoring}
        onClose={() => setRestoring(false)}
        title={`Restore version ${selected?.n ?? ""}?`}
        description="It becomes the draft at a new rev. The current draft stays in the history, so you can go back to it."
        error={error}
        primaryAction={{ label: "Restore", onClick: () => void restore(), loading: busy }}
      />
      <Modal
        open={naming}
        onClose={() => setNaming(false)}
        title="Name this version"
        description="Named versions are pinned at the top and never pruned."
        error={error}
        primaryAction={{ label: "Save", onClick: () => void saveNamed(), loading: busy, disabled: !note.trim() }}
      >
        <TextField label="Name" value={note} onChange={setNote} placeholder="Sent to the board" maxLength={200} required />
      </Modal>
    </div>
  );
}
