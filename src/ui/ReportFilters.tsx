import { Info } from "lucide-react";
import { FilterBar } from "./FilterBar";
import type { FilterValues } from "./filterLogic";
import { Select } from "./fields";
import { SegmentedControl } from "./SegmentedControl";
import { Tooltip } from "./Tooltip";
import { focusRing } from "./styles";
import { cn } from "./cn";
import { type ReportFrequency, type ReportPeriod, type ReportYearType, reportMonthOptions, reportQuarterOptions } from "./reportPeriod";
import { type PeriodSupport, switchCalendar, withFrequency, yearOptions } from "./reportFilterModel";

export type ReportFiltersProps = {
  sites: { value: number; label: string }[];
  categories: { value: number; label: string }[];
  filters: FilterValues;
  onFilters: (v: FilterValues) => void;
  period: ReportPeriod;
  onPeriod: (p: ReportPeriod) => void;
  fyStartMonth: number;
  now: Date;
  loading?: boolean;
  /** Periods the report's API can't ask for yet show disabled, with `unsupportedHint` on an info button. */
  supports?: PeriodSupport;
  unsupportedHint?: string;
};

const ALL: PeriodSupport = { fy: true, quarterly: true };

/** Sites, categories and the period (the P10/P11 report header): every change updates the report in place. */
export function ReportFilters({
  sites,
  categories,
  filters,
  onFilters,
  period,
  onPeriod,
  fyStartMonth,
  now,
  loading,
  supports = ALL,
  unsupportedHint,
}: ReportFiltersProps) {
  const limited = !supports.fy || !supports.quarterly;
  const toOptions = (list: { value: number; label: string }[]) => list.map((o) => ({ value: String(o.value), label: o.label }));
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <FilterBar
        search={false}
        loading={loading}
        value={filters}
        onChange={onFilters}
        filters={[
          { key: "site", label: "Sites", options: toOptions(sites) },
          {
            key: "category",
            label: "Categories",
            options: toOptions(categories),
          },
        ]}
      />
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl<ReportYearType>
          label="Calendar"
          value={period.yearType}
          onChange={(v) => onPeriod(switchCalendar(period, v, fyStartMonth))}
          options={[
            { value: "CY", label: "CY" },
            { value: "FY", label: "FY", disabled: !supports.fy },
          ]}
        />
        <SegmentedControl<ReportFrequency>
          label="Frequency"
          value={period.frequency}
          onChange={(v) => onPeriod(withFrequency(period, v, fyStartMonth))}
          options={[
            { value: "yearly", label: "Year" },
            {
              value: "quarterly",
              label: "Quarter",
              disabled: !supports.quarterly,
            },
            { value: "monthly", label: "Month" },
          ]}
        />
        <Select<number>
          label="Year"
          hideLabel
          className="w-36"
          value={period.year}
          onChange={(v) => v !== null && onPeriod({ ...period, year: v })}
          options={yearOptions(period.yearType, now, fyStartMonth, period.year)}
        />
        {period.frequency === "quarterly" && (
          <Select<number>
            label="Quarter"
            hideLabel
            className="w-48"
            value={period.quarter ?? 1}
            onChange={(v) => v !== null && onPeriod({ ...period, quarter: v })}
            options={reportQuarterOptions(period.yearType, period.year, fyStartMonth)}
          />
        )}
        {period.frequency === "monthly" && (
          <Select<number>
            label="Month"
            hideLabel
            className="w-36"
            value={period.month ?? 1}
            onChange={(v) => v !== null && onPeriod({ ...period, month: v })}
            options={reportMonthOptions(period.yearType, period.year, fyStartMonth)}
          />
        )}
        {limited && unsupportedHint && (
          <Tooltip content={unsupportedHint}>
            <button type="button" aria-label={unsupportedHint} className={cn("rounded-full p-1 text-muted hover:text-ink", focusRing)}>
              <Info className="h-4 w-4" aria-hidden />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
