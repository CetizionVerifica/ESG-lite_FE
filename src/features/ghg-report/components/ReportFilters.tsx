import {
  FilterBar,
  type FilterValues,
  type ReportFrequency,
  type ReportPeriod,
  type ReportYearType,
  SegmentedControl,
  Select,
  reportMonthOptions,
  reportQuarterOptions,
} from "../../../ui";
import { switchCalendar, withFrequency, yearOptions } from "../logic";

type Props = {
  sites: { value: number; label: string }[];
  categories: { value: number; label: string }[];
  filters: FilterValues;
  onFilters: (v: FilterValues) => void;
  period: ReportPeriod;
  onPeriod: (p: ReportPeriod) => void;
  fyStartMonth: number;
  now: Date;
  loading?: boolean;
};

/** Sites, categories and the period: every change updates the report in place. */
export function ReportFilters({ sites, categories, filters, onFilters, period, onPeriod, fyStartMonth, now, loading }: Props) {
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
          { key: "category", label: "Categories", options: toOptions(categories) },
        ]}
      />
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedControl<ReportYearType>
          label="Calendar"
          value={period.yearType}
          onChange={(v) => onPeriod(switchCalendar(period, v, fyStartMonth))}
          options={[
            { value: "CY", label: "CY" },
            { value: "FY", label: "FY" },
          ]}
        />
        <SegmentedControl<ReportFrequency>
          label="Frequency"
          value={period.frequency}
          onChange={(v) => onPeriod(withFrequency(period, v, fyStartMonth))}
          options={[
            { value: "yearly", label: "Year" },
            { value: "quarterly", label: "Quarter" },
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
      </div>
    </div>
  );
}
