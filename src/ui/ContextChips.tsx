import { useMemo, useState, type ReactNode } from "react";
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, Layers, MapPin, Tag } from "lucide-react";
import { Button } from "./Button";
import { cn } from "./cn";
import { Combobox, DateField, MonthPicker, Select, YearPicker, type Option } from "./fields";
import { useContextParams, type ContextPatch, type Scope } from "./hooks/useContextParams";
import { DEFAULT_FY_START_MONTH, periodContaining, periodLabel, shiftPeriod, type Period, type PeriodKind } from "./period";
import { Popover } from "./Popover";
import { focusRing } from "./styles";

export type ContextChipKind = "period" | "site" | "category" | "scope";

export type ContextChipsProps = {
  /** Which chips to show, in order. */
  chips?: ContextChipKind[];
  sites?: Option<number>[];
  categories?: Option<number>[];
  /** Period kinds offered; all five by default. */
  periodKinds?: PeriodKind[];
  /** Backend-owned FY start month (getReportingCalendar). */
  fyStartMonth?: number;
  /**
   * Lets the period be cleared to "Any period" (a queue spanning months).
   * Without it an empty period shows the current one.
   */
  allowAnyPeriod?: boolean;
  /** Used when the URL has no value. Not written to the URL. */
  defaults?: ContextPatch;
  /** Disables the chips while their options load. */
  loading?: boolean;
  className?: string;
};

const KIND_LABEL: Record<PeriodKind, string> = { month: "Month", quarter: "Quarter", cy: "CY", fy: "FY", custom: "Custom" };
const ALL_KINDS: PeriodKind[] = ["month", "quarter", "cy", "fy", "custom"];

function Chip({ icon, label, value, disabled, ...trigger }: {
  icon: ReactNode;
  label: string;
  value: string;
  disabled?: boolean;
  "aria-expanded": boolean;
  "aria-controls": string;
  "aria-haspopup": "dialog";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      {...trigger}
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-panel px-3 text-sm text-ink hover:bg-tint",
        "disabled:cursor-not-allowed disabled:opacity-60",
        trigger["aria-expanded"] && "border-accent",
        focusRing,
      )}
    >
      <span aria-hidden className="text-muted">{icon}</span>
      <span className="text-muted">{label}:</span>
      <span className="font-medium">{value}</span>
      <ChevronDown aria-hidden className="size-3.5 text-muted" />
    </button>
  );
}

function PeriodEditor({ value, kinds, fyStartMonth, onApply, onAny }: {
  value: Period;
  kinds: PeriodKind[];
  fyStartMonth: number;
  onApply: (p: Period) => void;
  /** Offered when the page allows "Any period". */
  onAny?: () => void;
}) {
  const [draft, setDraft] = useState<Period>(value);
  const switchKind = (kind: PeriodKind) => {
    if (kind === draft.kind) return;
    // Keep the year the user was looking at.
    const anchor = new Date(`${(draft.kind === "custom" ? draft.from : periodRangeStart(draft, fyStartMonth))}T00:00:00`);
    setDraft(periodContaining(kind, anchor, fyStartMonth));
  };
  const invalid = draft.kind === "custom" && (!draft.from || !draft.to || draft.from > draft.to);

  return (
    <div className="w-72 space-y-3">
      <div role="radiogroup" aria-label="Period type" className="flex rounded-control bg-tint p-0.5">
        {kinds.map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={draft.kind === k}
            onClick={() => switchKind(k)}
            className={cn(
              "flex-1 rounded-chip px-1.5 py-1 text-xs font-medium",
              draft.kind === k ? "bg-panel text-ink shadow-sm" : "text-muted hover:text-ink",
              focusRing,
            )}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>
      {draft.kind === "month" && (
        <MonthPicker
          label="Month"
          value={`${draft.year}-${String(draft.month).padStart(2, "0")}`}
          onChange={(v) => v && setDraft({ kind: "month", year: Number(v.slice(0, 4)), month: Number(v.slice(5, 7)) })}
        />
      )}
      {draft.kind === "quarter" && (
        <div className="grid grid-cols-2 gap-2">
          <Select
            label="Quarter"
            value={draft.quarter}
            onChange={(q) => q && setDraft({ ...draft, quarter: q })}
            options={[1, 2, 3, 4].map((q) => ({ value: q, label: `Q${q}` }))}
          />
          <YearPicker label="Year" value={draft.year} onChange={(y) => y && setDraft({ ...draft, year: y })} />
        </div>
      )}
      {draft.kind === "cy" && (
        <YearPicker label="Calendar year" yearType="CY" value={draft.year} onChange={(y) => y && setDraft({ kind: "cy", year: y })} />
      )}
      {draft.kind === "fy" && (
        <YearPicker
          label="Financial year"
          yearType="FY"
          fyStartMonth={fyStartMonth}
          value={draft.startYear}
          onChange={(y) => y && setDraft({ kind: "fy", startYear: y })}
        />
      )}
      {draft.kind === "custom" && (
        <div className="grid grid-cols-2 gap-2">
          <DateField label="From" value={draft.from} max={draft.to} onChange={(from) => setDraft({ ...draft, from })} />
          <DateField
            label="To"
            value={draft.to}
            min={draft.from}
            onChange={(to) => setDraft({ ...draft, to })}
            error={invalid ? "End before start" : undefined}
          />
        </div>
      )}
      <div className={cn("flex", onAny ? "justify-between" : "justify-end")}>
        {onAny && (
          <Button variant="ghost" size="sm" onClick={onAny}>
            Any period
          </Button>
        )}
        <Button variant="primary" size="sm" disabled={invalid} onClick={() => onApply(draft)}>
          Apply
        </Button>
      </div>
    </div>
  );
}

function periodRangeStart(p: Exclude<Period, { kind: "custom" }>, fyStartMonth: number): string {
  switch (p.kind) {
    case "month":
      return `${p.year}-${String(p.month).padStart(2, "0")}-01`;
    case "quarter":
      return `${p.year}-${String((p.quarter - 1) * 3 + 1).padStart(2, "0")}-01`;
    case "cy":
      return `${p.year}-01-01`;
    case "fy":
      return `${p.startYear}-${String(fyStartMonth).padStart(2, "0")}-01`;
  }
}

function SiteEditor({ sites, value, onApply }: { sites: Option<number>[]; value: number[]; onApply: (ids: number[]) => void }) {
  const [draft, setDraft] = useState<Set<number>>(new Set(value));
  const [query, setQuery] = useState("");
  const shown = useMemo(
    () => sites.filter((s) => s.label.toLowerCase().includes(query.trim().toLowerCase())),
    [sites, query],
  );
  const toggle = (id: number) => setDraft((d) => new Set(d.has(id) ? [...d].filter((x) => x !== id) : [...d, id]));
  return (
    <div className="w-64 space-y-2">
      {sites.length > 8 && (
        <input
          aria-label="Search sites"
          placeholder="Search sites"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={cn("h-8 w-full rounded-control border border-line bg-panel px-2 text-sm text-ink placeholder:text-muted", focusRing)}
        />
      )}
      <fieldset className="max-h-60 space-y-0.5 overflow-auto">
        <legend className="sr-only">Sites</legend>
        {shown.length === 0 && <p className="px-1 py-2 text-sm text-muted">No sites match</p>}
        {shown.map((s) => (
          <label key={s.value} className="flex cursor-pointer items-center gap-2 rounded-chip px-1 py-1 text-sm hover:bg-tint">
            <input type="checkbox" className="accent-brand" checked={draft.has(s.value)} onChange={() => toggle(s.value)} />
            {s.label}
          </label>
        ))}
      </fieldset>
      <div className="flex justify-between">
        <Button size="sm" variant="ghost" onClick={() => setDraft(new Set())}>
          All sites
        </Button>
        <Button size="sm" variant="primary" onClick={() => onApply([...draft])}>
          Apply
        </Button>
      </div>
    </div>
  );
}

/**
 * Period / Site / Category / Scope selectors, synced to `?period=&site=&category=&scope=`.
 * Read the same values in the page with `useContextParams()`.
 */
export function ContextChips({
  chips = ["period", "site"],
  sites = [],
  categories = [],
  periodKinds = ALL_KINDS,
  fyStartMonth = DEFAULT_FY_START_MONTH,
  allowAnyPeriod,
  defaults,
  loading,
  className,
}: ContextChipsProps) {
  const [ctx, update] = useContextParams(defaults);
  const anyPeriod = !!allowAnyPeriod && ctx.period === null;
  const period = ctx.period ?? periodContaining(periodKinds[0] ?? "month", new Date(), fyStartMonth);

  const siteLabel =
    ctx.siteIds.length === 0
      ? "All sites"
      : ctx.siteIds.length === 1
        ? sites.find((s) => s.value === ctx.siteIds[0])?.label ?? "1 site"
        : `${ctx.siteIds.length} sites`;
  const categoryLabel = categories.find((c) => c.value === ctx.categoryId)?.label ?? "All categories";

  return (
    <div role="group" aria-label="Context" className={cn("flex flex-wrap items-center gap-2", className)}>
      {chips.map((kind) => {
        if (kind === "period")
          return (
            <div key={kind} className="inline-flex items-center gap-0.5">
              {period.kind !== "custom" && !anyPeriod && (
                <button
                  type="button"
                  aria-label="Previous period"
                  disabled={loading}
                  onClick={() => update({ period: shiftPeriod(period, -1) })}
                  className={cn("rounded-full p-1 text-muted hover:bg-tint hover:text-ink disabled:opacity-60", focusRing)}
                >
                  <ChevronLeft aria-hidden className="size-4" />
                </button>
              )}
              <Popover
                label="Choose period"
                trigger={(t) => (
                  <Chip {...t} disabled={loading} icon={<Calendar className="size-3.5" />} label="Period" value={anyPeriod ? "Any period" : periodLabel(period, fyStartMonth)} />
                )}
              >
                {(close) => (
                  <PeriodEditor
                    value={period}
                    kinds={periodKinds}
                    fyStartMonth={fyStartMonth}
                    onApply={(p) => {
                      update({ period: p });
                      close();
                    }}
                    onAny={
                      allowAnyPeriod
                        ? () => {
                            update({ period: null });
                            close();
                          }
                        : undefined
                    }
                  />
                )}
              </Popover>
              {period.kind !== "custom" && !anyPeriod && (
                <button
                  type="button"
                  aria-label="Next period"
                  disabled={loading}
                  onClick={() => update({ period: shiftPeriod(period, 1) })}
                  className={cn("rounded-full p-1 text-muted hover:bg-tint hover:text-ink disabled:opacity-60", focusRing)}
                >
                  <ChevronRight aria-hidden className="size-4" />
                </button>
              )}
            </div>
          );
        if (kind === "site")
          return (
            <Popover
              key={kind}
              label="Choose sites"
              trigger={(t) => <Chip {...t} disabled={loading} icon={<MapPin className="size-3.5" />} label="Site" value={siteLabel} />}
            >
              {(close) =>
                sites.length === 0 ? (
                  <p className="w-56 text-sm text-muted">No sites available.</p>
                ) : (
                  <SiteEditor
                    sites={sites}
                    value={ctx.siteIds}
                    onApply={(siteIds) => {
                      update({ siteIds });
                      close();
                    }}
                  />
                )
              }
            </Popover>
          );
        if (kind === "category")
          return (
            <Popover
              key={kind}
              label="Choose category"
              trigger={(t) => <Chip {...t} disabled={loading} icon={<Tag className="size-3.5" />} label="Category" value={categoryLabel} />}
            >
              {(close) => (
                <div className="w-64 space-y-2">
                  <Combobox
                    label="Category"
                    hideLabel
                    value={ctx.categoryId}
                    options={categories}
                    emptyText="No categories"
                    onChange={(categoryId) => {
                      update({ categoryId });
                      close();
                    }}
                  />
                  <Button size="sm" variant="ghost" onClick={() => (update({ categoryId: null }), close())}>
                    All categories
                  </Button>
                </div>
              )}
            </Popover>
          );
        return (
          <Popover
            key={kind}
            label="Choose scope"
            trigger={(t) => (
              <Chip {...t} disabled={loading} icon={<Layers className="size-3.5" />} label="Scope" value={ctx.scope ? `Scope ${ctx.scope}` : "All scopes"} />
            )}
          >
            {(close) => (
              <div role="radiogroup" aria-label="Scope" className="flex flex-col gap-0.5">
                {([null, 1, 2, 3] as Array<Scope | null>).map((s) => (
                  <button
                    key={String(s)}
                    type="button"
                    role="radio"
                    aria-checked={ctx.scope === s}
                    onClick={() => (update({ scope: s }), close())}
                    className={cn("rounded-chip px-2 py-1 text-left text-sm hover:bg-tint", ctx.scope === s && "font-medium text-brand-text", focusRing)}
                  >
                    {s ? `Scope ${s}` : "All scopes"}
                  </button>
                ))}
              </div>
            )}
          </Popover>
        );
      })}
    </div>
  );
}
