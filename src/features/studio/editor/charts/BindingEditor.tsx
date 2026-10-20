// DS-8 · the Data drawer focused on a bound element ("Edit data"): what the
// chart, table, big number or tile shows (metric, years, sites, breakdown,
// top n, compare). Every change is one history step through rebind(). The
// list under it (DS-2 Data panel) replaces the binding on click.
import { useMemo } from "react";
import { Link2, X } from "lucide-react";
import type { Element, GhgBinding, KpiBinding, ReportDoc } from "../../../../lib/studio/contracts";
import { GHG_METRICS } from "../../../../lib/studio/contracts";
import { useAuth } from "../../../../context/AuthContext";
import { Button, Select, cn, focusRing } from "../../../../ui";
import type { EditorApi } from "../EditorContext";
import { elementTitle, BREAKDOWNS_BY_METRIC, BREAKDOWN_LABELS, METRIC_LABELS, bindingSummary, kindCheck, rebind, takesTop, withBreakdown, withCompare, withMetric, withSites, withYears } from "./chartOps";

type SiteLike = { site_id: number; name: string };

function useSessionSites(): SiteLike[] {
  const { user } = useAuth();
  return useMemo(() => {
    const u = (user ?? {}) as { sites?: SiteLike[]; site?: SiteLike | null };
    const list = u.sites?.length ? u.sites : u.site ? [u.site] : [];
    return list.filter((s) => Number.isInteger(s?.site_id));
  }, [user]);
}

const YEAR_CHOICES = [1, 2, 3, 4, 5, 6, 8, 10];
const TOP_CHOICES = [3, 5, 6, 8, 10, 12, 15];


export function BindingEditor({ editor, pageId, el, onDone }: { editor: EditorApi; pageId: string; el: Element; onDone: () => void }) {
  const sites = useSessionSites();
  const b = (el.props as { binding?: GhgBinding | KpiBinding }).binding;
  const doc: ReportDoc = editor.doc;
  if (!b || (b.source !== "ghg" && b.source !== "kpi")) return null;
  const locked = editor.readOnly || !!el.locked || !!el.templateLocked;
  const apply = (next: GhgBinding | KpiBinding, label: string) => editor.commit(rebind(editor.doc, pageId, el.id, next), label);
  const yearsValue = Array.isArray(b.years) ? "list" : String(b.years.last);
  const base = (doc.meta.compareYear && doc.meta.compareYear < doc.meta.year ? doc.meta.compareYear : doc.meta.year - 1) as number;
  const kindNote = el.type === "chart" && !kindCheck(el.props.kind, b).ok ? kindCheck(el.props.kind, b) : null;
  const docSites = doc.meta.sites === "all" ? sites : sites.filter((s) => (doc.meta.sites as number[]).includes(s.site_id));
  const chosenSites = b.sites === "all" ? [] : b.sites;

  return (
    <section aria-label={`Edit data: ${elementTitle(el)}`} className="space-y-3 rounded-control border border-line bg-tint p-3" data-testid="binding-editor">
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <Link2 aria-hidden className="size-4 text-good" />
            <span className="truncate">{elementTitle(el)}</span>
          </h3>
          <p className="text-xs text-muted" data-testid="binding-summary">
            {bindingSummary(b)}
          </p>
        </div>
        <button type="button" aria-label="Stop editing this element's data" onClick={onDone} className={cn("rounded-control p-1 text-muted hover:bg-panel hover:text-ink", focusRing)}>
          <X aria-hidden className="size-4" />
        </button>
      </header>

      {b.source === "ghg" && (
        <>
          <Select
            label="Figure"
            value={b.metric}
            disabled={locked}
            onChange={(v) => v && apply(withMetric(b, v), "Change figure")}
            options={GHG_METRICS.map((m) => ({ value: m, label: METRIC_LABELS[m] }))}
          />
          <Select
            label="Split"
            value={b.breakdown ?? "none"}
            disabled={locked || !(BREAKDOWNS_BY_METRIC[b.metric] ?? []).length}
            onChange={(v) => v && apply(withBreakdown(b, v === "none" ? null : (v as GhgBinding["breakdown"])), "Change split")}
            options={[{ value: "none", label: "No split" }, ...(BREAKDOWNS_BY_METRIC[b.metric] ?? []).map((k) => ({ value: k, label: BREAKDOWN_LABELS[k] }))]}
          />
          {b.metric === "scope3_category" && !b.breakdown && (
            <Select
              label="Category"
              value={String(b.scope3Category ?? 1)}
              disabled={locked}
              onChange={(v) => v && apply({ ...b, scope3Category: Number(v) }, "Change category")}
              options={Array.from({ length: 15 }, (_, i) => ({ value: String(i + 1), label: `Category ${i + 1}` }))}
            />
          )}
        </>
      )}

      <Select
        label="Years"
        value={yearsValue}
        disabled={locked}
        onChange={(v) => {
          if (!v) return;
          apply(withYears(b, v === "list" ? [base, doc.meta.year] : { last: Number(v) }), "Change years");
        }}
        options={[
          ...YEAR_CHOICES.map((n) => ({ value: String(n), label: n === 1 ? `This year (${doc.meta.year})` : `Last ${n} years` })),
          { value: "list", label: Array.isArray(b.years) ? `${b.years.join(" and ")}` : `${base} and ${doc.meta.year}` },
        ]}
      />

      {takesTop(b) && b.source === "ghg" && (
        <Select
          label="Show"
          value={String(b.top ?? 0)}
          disabled={locked}
          onChange={(v) => {
            if (v === null) return;
            const next: GhgBinding = { ...b };
            if (Number(v)) next.top = Number(v);
            else delete next.top;
            apply(next, "Change top n");
          }}
          options={[{ value: "0", label: "All" }, ...TOP_CHOICES.map((n) => ({ value: String(n), label: `Top ${n} + Other` }))]}
        />
      )}

      <Select
        label="Compare with"
        value={b.compare ?? "none"}
        disabled={locked}
        onChange={(v) => v && apply(withCompare(b, v === "none" ? null : (v as "prior" | "base" | "target")), "Change comparison")}
        options={[
          { value: "none", label: "Nothing" },
          { value: "prior", label: "The year before" },
          { value: "base", label: "The base year" },
          ...(b.source === "kpi" ? [{ value: "target", label: "The target" }] : []),
        ]}
      />

      {docSites.length > 1 && (
        <fieldset className="space-y-1">
          <legend className="text-xs font-medium text-ink">Sites</legend>
          <div className="flex flex-wrap gap-1">
            <button
              type="button"
              aria-pressed={b.sites === "all"}
              disabled={locked}
              onClick={() => apply(withSites(b, "all"), "All sites")}
              className={cn("rounded-chip border px-2 py-0.5 text-xs", b.sites === "all" ? "border-accent bg-panel text-ink" : "border-line text-muted hover:text-ink", focusRing)}
            >
              All sites in the report
            </button>
            {docSites.map((s) => {
              const on = chosenSites.includes(s.site_id);
              return (
                <button
                  key={s.site_id}
                  type="button"
                  aria-pressed={on}
                  disabled={locked}
                  onClick={() => apply(withSites(b, on ? chosenSites.filter((x) => x !== s.site_id) : [...chosenSites, s.site_id].sort((x, y) => x - y)), "Change sites")}
                  className={cn("rounded-chip border px-2 py-0.5 text-xs", on ? "border-accent bg-panel text-ink" : "border-line text-muted hover:text-ink", focusRing)}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
        </fieldset>
      )}

      {kindNote && !kindNote.ok && <p className="text-xs text-warn">{kindNote.reason}</p>}
      <p className="text-xs text-muted">Click a figure below to show it here instead, or drop one onto the element on the page.</p>
      <Button size="sm" variant="secondary" onClick={onDone}>
        Done
      </Button>
    </section>
  );
}
