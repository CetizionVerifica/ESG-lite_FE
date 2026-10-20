// DS-11 · "Create view link" (05-ux S7, D15): a read-only link to a stored
// PDF (a final, or a PDF proof), Manager only. Pick what to share and how long
// the link lives (14 days by default, at most 90); the link is shown once with
// Copy. Below, every link of the design with its views, expiry and Revoke.
import { useEffect, useMemo, useState } from "react";
import { Check, Copy, Link2 } from "lucide-react";
import { Badge, Button, Callout, EmptyState, Modal, Select, Skeleton } from "../../../ui";
import { SHARE_DAYS_DEFAULT, type ReportShare } from "../../../lib/studio/contracts";
import { EXPIRY_DAYS, shareLine, shareTargets } from "../../../lib/studio/outputs";
import { useSafeToast } from "./useSafeToast";
import { dsError, useCreateShare, useJobs, useRenderJob, useRevokeShare, useShares, useVersions } from "./api";

const STATE_TONE: Record<ReportShare["state"], "good" | "neutral" | "bad"> = { active: "good", expired: "neutral", revoked: "bad" };
const STATE_WORD: Record<ReportShare["state"], string> = { active: "Active", expired: "Expired", revoked: "Turned off" };

export function ViewLinkDialog({ docId, open, onClose }: { docId: number; open: boolean; onClose: () => void }) {
  const versions = useVersions(docId, open);
  const jobs = useJobs(docId, open);
  const shares = useShares(docId, open);
  const create = useCreateShare(docId);
  const revoke = useRevokeShare(docId);
  const proof = useRenderJob(docId, { autoDownload: false });
  const toast = useSafeToast();
  const targets = useMemo(() => shareTargets(versions.data ?? [], jobs.data ?? []), [versions.data, jobs.data]);
  const [target, setTarget] = useState<string | null>(null);
  const [days, setDays] = useState<number>(SHARE_DAYS_DEFAULT);
  const [made, setMade] = useState<ReportShare | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState<number | null>(null);
  const chosen = targets.find((t) => t.key === (target ?? targets[0]?.key)) ?? null;
  const loading = versions.isPending || jobs.isPending;
  const err = create.error ? dsError(create.error) : null;

  // A proof made from here appears in the list once it's done.
  const proofDone = proof.job?.status === "done" ? proof.job.id : null;
  const { refetch: refetchJobs } = jobs;
  useEffect(() => {
    if (proofDone !== null) void refetchJobs();
  }, [proofDone, refetchJobs]);

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast({ title: "Link copied", tone: "good" });
    } catch {
      toast({ title: "Couldn't copy. Select the link and copy it.", tone: "bad" });
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        setMade(null);
        setCopied(false);
        onClose();
      }}
      title="View link"
      description="Anyone with the link can view and download the PDF. They can't edit or comment, and they never see live data."
      size="md"
      cancelLabel="Close"
      primaryAction={
        made
          ? undefined
          : {
              label: "Create link",
              loading: create.isPending,
              disabled: !chosen,
              onClick: () => {
                if (!chosen) return;
                create.mutate({ ...chosen.body, expiresInDays: days }, { onSuccess: (s) => setMade(s) });
              },
            }
      }
      error={err ? (err.code === "DS_ROLE" ? "Only a Manager can create a view link." : (err.message ?? "The link couldn't be created.")) : undefined}
    >
      <div className="flex flex-col gap-4">
        {made?.url ? (
          <div className="flex flex-col gap-2" data-testid="view-link-made">
            <div className="flex gap-2">
              <input readOnly value={made.url} aria-label="Link to share" onFocus={(e) => e.currentTarget.select()} className="h-9 min-w-0 flex-1 rounded-control border border-line bg-panel px-2 font-mono text-xs text-ink" />
              <Button size="sm" variant="secondary" icon={copied ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />} onClick={() => void copy(made.url as string)}>
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="text-xs text-muted">Copy it now: for safety the full link is shown only once. {shareLine(made)}.</p>
            <div>
              <Button size="sm" variant="ghost" onClick={() => setMade(null)}>
                Create another link
              </Button>
            </div>
          </div>
        ) : loading ? (
          <Skeleton className="h-16" />
        ) : targets.length === 0 ? (
          <Callout
            tone="info"
            title="Make a PDF first"
            action={
              <Button size="sm" variant="secondary" loading={proof.busy} onClick={() => proof.start.mutate({ kind: "proof" })}>
                Make a PDF proof
              </Button>
            }
          >
            A view link shows a stored PDF: a final, or a PDF proof (proofs are kept 7 days).
          </Callout>
        ) : (
          <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
            <Select label="What to share" value={chosen?.key ?? null} onChange={(v) => setTarget(v)} options={targets.map((t) => ({ value: t.key, label: t.label }))} />
            <Select label="Link expires after" value={days} onChange={(v) => setDays(v ?? SHARE_DAYS_DEFAULT)} options={EXPIRY_DAYS.map((d) => ({ value: d, label: `${d} days` }))} />
          </div>
        )}
        <section aria-label="View links" className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold text-muted">Links to this design</h3>
          {shares.isPending ? (
            <Skeleton className="h-10" />
          ) : (shares.data ?? []).length === 0 ? (
            <EmptyState icon={Link2} title="No view links yet." description="Links you create show here with their views." />
          ) : (
            <ul className="flex flex-col divide-y divide-line rounded-control border border-line" data-testid="view-link-list">
              {(shares.data ?? []).map((s) => (
                <li key={s.id} className="flex items-center gap-2 px-3 py-2 text-[13px]">
                  <Badge tone={STATE_TONE[s.state]}>{STATE_WORD[s.state]}</Badge>
                  <span className="min-w-0 flex-1 truncate text-ink">{shareLine(s)}</span>
                  {s.state === "active" &&
                    (confirmRevoke === s.id ? (
                      <span className="flex items-center gap-1">
                        <Button size="sm" variant="danger" loading={revoke.isPending} onClick={() => revoke.mutate(s.id, { onSuccess: () => setConfirmRevoke(null) })}>
                          Turn off
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setConfirmRevoke(null)}>
                          Keep
                        </Button>
                      </span>
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => setConfirmRevoke(s.id)} aria-label={`Revoke ${s.label}`}>
                        Revoke
                      </Button>
                    ))}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Modal>
  );
}
