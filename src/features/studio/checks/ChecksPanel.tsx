// DS-12 · the checks panel (05-ux S8, RS S5; mockup "Checks, download and
// share"): "Checks before the final", the frameworks, "1 must fix · 2 to
// review · 2 for info", then the rows grouped Must fix / Review / For info.
// Each row says what is missing in plain words and offers its fix and Go to.
// The footer is the final: Generate final PDF, disabled with the reason.
import { useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { Button, EmptyState, Modal, SkeletonText, cn, focusRing } from "../../../ui";
import type { Check } from "../../../lib/studio/contracts";
import { GROUP_TITLE, checkKey, countsLine, finalBlock, fixLabel, groupChecks, pageLabel, type CheckGroup } from "../../../lib/studio/checks";
import { useEditor } from "../editor/EditorContext";
import { useCanManage } from "../share/useCanManage";
import { useSafeToast } from "../share/useSafeToast";
import { useCheckActions } from "./actions";
import { ExclusionDialog } from "./ExclusionDialog";
import { FinalForm } from "./FinalForm";
import { closeChecks, refreshChecks, setChecksState, useChecksState } from "./store";

const FRAMEWORK_NAMES: Record<string, string> = { GHGP: "GHG Protocol", ISO14064: "ISO 14064-1", BRSR_P6: "BRSR P6", ESRS_E1: "ESRS E1", GRI: "GRI", BRSR: "BRSR", ESRS: "ESRS" };

const GROUP_STYLE: Record<CheckGroup, { head: string; card: string }> = {
  must: { head: "text-bad", card: "border-l-bad" },
  review: { head: "text-warn", card: "border-l-warn" },
  info: { head: "text-info", card: "border-l-info" },
};

/** Shown next to the drawer while open (the top bar's counter toggles it). */
export function ChecksPanelHost() {
  const ed = useEditor();
  const { open } = useChecksState(ed.docId);
  // A rail drawer replaces the panel; the panel replaces the drawer.
  const drawer = ed.ui.drawer;
  const prevDrawer = useRef(drawer);
  useEffect(() => {
    if (drawer && drawer !== prevDrawer.current && open) closeChecks(ed.docId);
    prevDrawer.current = drawer;
  }, [drawer, open, ed.docId]);
  if (!open) return null;
  return <ChecksPanel />;
}

export function ChecksPanel() {
  const ed = useEditor();
  const { data, loading, error, focus } = useChecksState(ed.docId);
  const canFinal = useCanManage();
  const toast = useSafeToast();
  const [exclusion, setExclusion] = useState<Check | null>(null);
  const [finalOpen, setFinalOpen] = useState(false);
  const actions = useCheckActions(ed, { openExclusion: setExclusion });
  const checks = useMemo(() => data?.checks ?? [], [data]);
  const groups = groupChecks(checks);
  const blocked = finalBlock(data?.checks, { canFinal });
  const frameworks = ed.doc.meta.frameworks.map((f) => FRAMEWORK_NAMES[f] ?? f).join(" · ");
  const list = useRef<HTMLDivElement>(null);

  // A marker asked for a row: scroll to it.
  useEffect(() => {
    if (!focus) return;
    const el = list.current?.querySelector<HTMLElement>(`[data-check-key="${focus.replace(/["\\]/g, "\\$&")}"]`);
    el?.scrollIntoView?.({ block: "nearest" });
    el?.focus();
  }, [focus, data]);

  const run = (r: { ok: boolean; message?: string }) => {
    if (r.message) toast({ title: r.message, tone: r.ok ? "good" : "bad" });
  };

  return (
    <aside className="flex w-[400px] flex-none flex-col border-r border-line bg-panel" aria-label="Checks" data-testid="checks-panel">
      <div className="flex flex-col gap-1 border-b border-line px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="flex-1 text-sm font-semibold text-ink">Checks before the final</h2>
          <span className="text-xs text-muted">{frameworks}</span>
          <button type="button" aria-label="Run the checks again" onClick={() => refreshChecks(ed.docId)} className={cn("rounded-chip p-1 text-muted hover:bg-tint hover:text-ink", focusRing)}>
            <RefreshCw aria-hidden className={cn("size-4", loading && "animate-spin")} />
          </button>
          <button type="button" aria-label="Close checks" onClick={() => closeChecks(ed.docId)} className={cn("rounded-chip p-1 text-muted hover:bg-tint hover:text-ink", focusRing)}>
            <X aria-hidden className="size-4" />
          </button>
        </div>
        <div className="text-xs text-muted" data-testid="checks-counts" aria-live="polite">
          {data ? countsLine(checks) : loading ? "Running the checks…" : ""}
          {data?.layout === "none" ? " · layout is checked when a PDF is made" : ""}
        </div>
      </div>

      <div ref={list} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-3.5">
        {!data && loading && <SkeletonText lines={6} />}
        {!data && error && (
          <EmptyState title="The checks couldn't run" description={error} action={<Button size="sm" variant="secondary" onClick={() => refreshChecks(ed.docId)}>Try again</Button>} />
        )}
        {data && !checks.length && <EmptyState title="Nothing to fix" description="Every check passes. You can make the final." />}
        {(["must", "review", "info"] as const).map((g) =>
          groups[g].length ? (
            <section key={g} className="flex flex-col gap-2" aria-label={GROUP_TITLE[g]}>
              <h3 className={cn("text-[11px] font-semibold uppercase tracking-wider", GROUP_STYLE[g].head)}>{GROUP_TITLE[g]}</h3>
              {groups[g].map((c, i) => {
                const key = checkKey(c, i);
                const where = pageLabel(ed.doc, c.pageId);
                const label = fixLabel(c);
                return (
                  <article
                    key={key}
                    tabIndex={-1}
                    data-check-key={key}
                    data-check-id={c.id}
                    className={cn("flex flex-col gap-1.5 rounded-card border border-l-4 border-line bg-panel px-3 py-2.5 text-[13px] text-ink outline-none", GROUP_STYLE[g].card, focus === key && "ring-2 ring-brand")}
                  >
                    <p className="font-medium leading-snug">{c.message}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {label && (
                        <Button size="sm" variant="secondary" onClick={() => run(actions.fix(c))} data-testid={`fix-${c.fix}`}>
                          {label}
                        </Button>
                      )}
                      {c.id === "AI_UNREVIEWED" && !ed.readOnly && (
                        <Button size="sm" variant="secondary" onClick={() => run(actions.markAiReviewed(c))}>
                          Mark as reviewed
                        </Button>
                      )}
                      {where && (
                        <Button size="sm" variant="ghost" onClick={() => { actions.goTo(c); setChecksState(ed.docId, { focus: key }); }} data-testid="check-goto">
                          Go to {where}
                        </Button>
                      )}
                    </div>
                  </article>
                );
              })}
            </section>
          ) : null,
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-line px-4 py-3">
        <Button variant="primary" disabled={!!blocked || !data} onClick={() => setFinalOpen(true)} data-testid="checks-final">
          Generate final PDF
        </Button>
        <span className="text-center text-xs text-muted" data-testid="checks-final-reason">
          {blocked ?? (data?.warnings.length ? "You'll confirm the warnings first." : data ? "Ready for the final." : "")}
        </span>
      </div>

      <ExclusionDialog docId={ed.docId} check={exclusion} onClose={() => setExclusion(null)} />
      <Modal open={finalOpen} onClose={() => setFinalOpen(false)} title="Generate the final PDF" cancelLabel="Close" size="md">
        <FinalForm docId={ed.docId} canFinal={canFinal} onStarted={() => setFinalOpen(false)} />
      </Modal>
    </aside>
  );
}
