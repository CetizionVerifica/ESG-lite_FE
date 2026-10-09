import { Button, MonthPicker, SegmentedControl, Select, YearPicker, cn, panel } from "../../../ui";
import type { YearType } from "../hooks/reportingPeriod";
import type { EntryPeriod } from "../logic/entry";
import type { Category, EntrySite } from "../logic/sites";

type Props = {
  sites: EntrySite[];
  siteId: number | null;
  categories: Category[];
  categoryId: number | null;
  period: EntryPeriod | null;
  onSite: (id: number | null) => void;
  onCategory: (id: number | null) => void;
  onPeriod: (p: EntryPeriod | null) => void;
  onNext: () => void;
};

const thisMonth = () => {
  const d = new Date();
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
};

/** Step 1: site, category and the period the rows are for. */
export function ChooseContext(p: Props) {
  const mode = p.period?.mode ?? "monthly";
  const yearType: YearType = p.period?.mode === "yearly" ? p.period.yearType : "FY";
  const ready = p.siteId !== null && p.categoryId !== null && p.period !== null;

  const setMode = (m: "monthly" | "yearly") => {
    if (m === mode) return;
    const year = p.period?.year ?? thisMonth().year;
    p.onPeriod(m === "monthly" ? { mode: "monthly", year, month: thisMonth().month } : { mode: "yearly", yearType, year });
  };

  return (
    <div className={cn(panel, "space-y-4 p-4")}>
      <div className="grid gap-4 md:grid-cols-2">
        {p.sites.length > 1 && (
          <Select<number>
            label="Site"
            value={p.siteId}
            onChange={p.onSite}
            options={p.sites.map((s) => ({ value: s.site_id, label: s.name }))}
            placeholder="Choose a site"
          />
        )}
        <Select<number>
          label="Category"
          value={p.categoryId}
          onChange={p.onCategory}
          options={p.categories.map((c) => ({ value: c.category_id, label: c.scope ? `${c.category_name} · ${c.scope}` : c.category_name }))}
          placeholder="Choose a category"
          emptyText={p.siteId === null ? "Choose a site first" : "No categories assigned to you"}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-ink">Period</legend>
        <SegmentedControl
          label="Report monthly or for a whole year"
          value={mode}
          onChange={setMode}
          options={[
            { value: "monthly", label: "Monthly" },
            { value: "yearly", label: "Yearly" },
          ]}
        />
        {mode === "monthly" ? (
          <MonthPicker
            label="Month"
            value={p.period?.mode === "monthly" ? `${p.period.year}-${String(p.period.month).padStart(2, "0")}` : null}
            onChange={(v) => p.onPeriod(v ? { mode: "monthly", year: Number(v.slice(0, 4)), month: Number(v.slice(5, 7)) } : null)}
          />
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <SegmentedControl
              label="Calendar"
              size="sm"
              value={yearType}
              onChange={(t) => p.onPeriod({ mode: "yearly", yearType: t, year: p.period?.year ?? thisMonth().year })}
              options={[
                { value: "CY", label: "Calendar year" },
                { value: "FY", label: "Financial year" },
              ]}
            />
            <YearPicker
              label="Year"
              value={p.period?.mode === "yearly" ? p.period.year : null}
              yearType={yearType}
              fyStartMonth={4}
              onChange={(y) => p.onPeriod(y ? { mode: "yearly", yearType, year: y } : null)}
            />
          </div>
        )}
        <p className="text-xs text-muted">
          A category is filed either monthly or yearly within a year. If it is already filed the other way, saving tells you.
        </p>
      </fieldset>

      <div className="flex justify-end">
        <Button variant="primary" onClick={p.onNext} disabled={!ready}>
          Continue
        </Button>
      </div>
    </div>
  );
}
