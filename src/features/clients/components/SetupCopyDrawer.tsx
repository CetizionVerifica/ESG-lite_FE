import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { Button, Callout, Drawer, cn, focusRing, useToast } from "../../../ui";
import { errorMessage, useApplySetupCopy, useCompanies, useDownloadSetup, useSetupCopyPreview } from "../api";
import type { ClientRow } from "../logic";
import { type CopyDraft, type CopyReport, EMPTY_COPY, summarize } from "../setupCopy";
import { SetupCopyPanel } from "./SetupCopyPanel";

/** "Copy setup here": a client page drawer that copies another client's (or a file's) setup onto this client. */
export function SetupCopyDrawer({ row, onClose }: { row: ClientRow; onClose: () => void }) {
  const { toast } = useToast();
  const companies = useCompanies();
  const download = useDownloadSetup();
  const [draft, setDraft] = useState<CopyDraft>(EMPTY_COPY);
  const [done, setDone] = useState<CopyReport | null>(null);
  const preview = useSetupCopyPreview(draft, row.company_id);
  const apply = useApplySetupCopy(row.company_id);
  const others = (companies.data ?? []).filter((c) => c.company_id !== row.company_id);
  const ready = !!draft.source && !!preview.data && preview.data.errors.length === 0 && preview.data.totals.create > 0;

  const run = () =>
    apply.mutate(draft, {
      onSuccess: (r) => {
        setDone(r);
        toast({ title: `Setup copied to ${row.name}`, description: summarize(r), tone: "good" });
      },
    });

  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      title={`Copy setup to ${row.name}`}
      subtitle="Sites, forms, units, factors, mappings and threshold. Nothing already here is changed; people and entries are never copied."
      footer={
        done ? (
          <div className="flex justify-end">
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-sm text-muted">{preview.data && draft.source ? `Will create: ${summarize(preview.data)}` : ""}</span>
            <div className="flex gap-2">
              <Button onClick={onClose} disabled={apply.isPending}>
                Cancel
              </Button>
              <Button variant="primary" onClick={run} disabled={!ready} loading={apply.isPending}>
                Copy setup
              </Button>
            </div>
          </div>
        )
      }
    >
      {done ? (
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <CheckCircle2 aria-hidden className="mt-0.5 size-5 shrink-0 text-good" />
            <div>
              <h3 className="text-sm font-semibold text-ink">Copied: {summarize(done)}</h3>
              {done.totals.skip > 0 && <p className="text-sm text-muted">{done.totals.skip} items were already here and were kept as they are.</p>}
            </div>
          </div>
          {done.warnings.concat(done.sites.flatMap((s) => s.warnings)).map((w, i) => (
            <Callout key={i} tone="warn">
              {w}
            </Callout>
          ))}
          <ul className="divide-y divide-line rounded-control border border-line">
            {[
              { label: "Check sites", detail: "Names, addresses and categories.", to: `/setup/sites?client=${row.company_id}` },
              { label: "Check forms", detail: "The copied data-entry forms.", to: "/capture/forms" },
              { label: "Check factors", detail: "Grid and fuel factors may differ by country.", to: `/factors?client=${row.company_id}` },
            ].map((s) => (
              <li key={s.label}>
                <Link to={s.to} onClick={onClose} className={cn("flex items-center gap-3 px-4 py-3 hover:bg-tint", focusRing)}>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">{s.label}</span>
                    <span className="block text-xs text-muted">{s.detail}</span>
                  </span>
                  <ChevronRight aria-hidden className="size-4 text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="space-y-4">
          {apply.error && (
            <Callout tone="warn" title="The setup wasn't copied">
              {errorMessage(apply.error, "Nothing was changed. Try again.")}
            </Callout>
          )}
          <SetupCopyPanel
            draft={draft}
            onChange={setDraft}
            companies={others}
            onboarding={false}
            targetSites={row.sites}
            preview={{ data: preview.data, loading: preview.isFetching, error: preview.error ? errorMessage(preview.error, "The server didn't answer.") : null }}
            onDownloadSource={(id) => download.mutate(id, { onError: (e) => toast({ title: "Couldn't download the setup file", description: errorMessage(e, "Try again."), tone: "bad" }) })}
          />
        </div>
      )}
    </Drawer>
  );
}
