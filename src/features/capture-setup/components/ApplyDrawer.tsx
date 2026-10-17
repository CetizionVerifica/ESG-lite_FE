import { useMemo, useState } from "react";
import { Badge, Button, Callout, Drawer, TextField, useToast } from "../../../ui";
import { useApplyTemplate, usePreviewApply, useSites } from "../api";
import { errorMessage } from "../logic";
import { type ApplyResponse, type CopySource, applicable, siteChoices, targetLine } from "../templates";

const sourceBody = (src: CopySource) => (src.kind === "template" ? { template_id: src.id } : { form_id: src.id });

/**
 * SE-6 · Copy a template or a form to sites: pick the sites, see what each would get and its form
 * check, then apply to the ones that pass. A client's template or form offers only that client's sites.
 */
export function ApplyDrawer({ source, onClose }: { source: CopySource; onClose: () => void }) {
  const { toast } = useToast();
  const sites = useSites();
  const preview = usePreviewApply();
  const apply = useApplyTemplate();
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [note, setNote] = useState("");
  const [result, setResult] = useState<ApplyResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const groups = useMemo(() => siteChoices(sites.data ?? [], source), [sites.data, source]);
  const checked = preview.data && !result ? preview.data : null;
  const ready = checked ? applicable(checked.targets) : [];

  const toggle = (id: number) => {
    setResult(null);
    preview.reset();
    setPicked((p) => new Set(p.has(id) ? [...p].filter((x) => x !== id) : [...p, id]));
  };
  const runCheck = () => {
    setErr(null);
    preview.mutate({ ...sourceBody(source), site_ids: [...picked] }, { onError: (e) => setErr(errorMessage(e, "Couldn't check those sites. Try again.")) });
  };
  const runApply = () => {
    setErr(null);
    apply.mutate(
      { ...sourceBody(source), site_ids: ready.map((t) => t.site_id), note: note.trim() || null },
      {
        onSuccess: (r) => {
          setResult(r);
          toast({ title: r.message ?? "Applied", tone: "good" });
        },
        onError: (e) => setErr(errorMessage(e, "Nothing was applied. Try again.")),
      },
    );
  };
  const shown = result ?? checked;

  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      title={source.kind === "template" ? `Apply "${source.name}"` : `Copy "${source.name}" to sites`}
      subtitle={`${source.category_name} · ${source.company_id === null ? "any client" : "this client's sites only"}`}
      loading={sites.isPending}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {result ? (
            <Button onClick={onClose}>Done</Button>
          ) : checked ? (
            <>
              <Button onClick={() => preview.reset()}>Change sites</Button>
              <Button variant="primary" disabled={!ready.length} loading={apply.isPending} onClick={runApply}>
                {ready.length ? `Apply to ${ready.length} ${ready.length === 1 ? "site" : "sites"}` : "No site passes the check"}
              </Button>
            </>
          ) : (
            <Button variant="primary" disabled={!picked.size} loading={preview.isPending} onClick={runCheck}>
              Check {picked.size || ""} {picked.size === 1 ? "site" : "sites"}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-4" data-testid="apply-drawer">
        {err && (
          <Callout tone="warn" title="Not done" onDismiss={() => setErr(null)}>
            {err}
          </Callout>
        )}
        {!shown && (
          <fieldset className="space-y-3">
            <legend className="text-sm text-muted">Choose the sites. Each is checked against its own factors before anything is written; a site that already has a form for {source.category_name} gets these settings in its form and keeps its name.</legend>
            {groups.length === 0 && <p className="text-sm text-muted">No sites to choose from.</p>}
            {groups.map((g) => (
              <div key={g.client}>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted">{g.client}</p>
                <ul className="mt-1 grid gap-1 sm:grid-cols-2">
                  {g.choices.map(({ site, reason }) => (
                    <li key={site.site_id}>
                      <label className={`flex items-start gap-2 text-sm ${reason ? "text-muted" : "text-ink"}`}>
                        <input
                          type="checkbox"
                          className="mt-0.5 accent-brand"
                          disabled={!!reason}
                          checked={picked.has(site.site_id)}
                          onChange={() => toggle(site.site_id)}
                          aria-label={site.name}
                        />
                        <span>
                          {site.name}
                          {reason && <span className="block text-xs">{reason}</span>}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </fieldset>
        )}

        {shown && (
          <ul className="divide-y divide-line" data-testid="apply-targets">
            {shown.targets.map((t) => {
              const line = targetLine(t);
              return (
                <li key={t.site_id} className="py-2" data-site={t.site_name}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{t.site_name}</span>
                    <Badge tone={line.tone === "good" ? "good" : line.tone === "bad" ? "bad" : "neutral"}>{t.status === "applied" ? "Applied" : t.refused || (t.check && !t.check.ok) ? "Not applied" : "Ready"}</Badge>
                  </div>
                  <p className={`text-sm ${line.tone === "bad" ? "text-bad" : "text-muted"}`}>{line.text}</p>
                  {t.check && !t.check.ok && (
                    <ul className="mt-1 list-disc pl-5 text-sm text-ink">
                      {t.check.errors.slice(0, 5).map((e) => (
                        <li key={`${e.code}-${e.field}`}>{e.message}</li>
                      ))}
                      {t.check.errors.length > 5 && <li className="text-muted">and {t.check.errors.length - 5} more</li>}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {checked && ready.length > 0 && (
          <TextField
            label="Note for the new versions (optional)"
            help={source.kind === "template" ? `Defaults to "From template ${source.name}".` : "Shown in each form's history."}
            value={note}
            onChange={setNote}
            maxLength={500}
          />
        )}
      </div>
    </Drawer>
  );
}
