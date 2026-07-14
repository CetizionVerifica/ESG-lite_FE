import { useEffect, useMemo, useState } from "react";
import Dropdown, { DropdownOption } from "./Dropdown";
import {
  getEmissionsPaginated,
  EmissionData,
  EmissionStatus,
} from "../services/emissionService";

// A column belonging to a category's configuration.
export interface CategoryColumn {
  pk_id: number;
  column_name: string;
  column_type?: string;
}

type BreakdownMetric = "consumption" | "emission";

interface BreakdownRow {
  label: string;
  total: number;
  unit: string;
}

interface EmissionsFilterSidebarProps {
  // Filter values + change handlers
  hasMultipleSites: boolean;
  siteOptions: DropdownOption[];
  categoryOptions: DropdownOption[];
  yearOptions: DropdownOption[];
  monthOptions: DropdownOption[];
  selectedSite: number | null;
  selectedCategory: number | null;
  selectedYear: number | null;
  selectedMonth: number | null;
  selectedStatus: EmissionStatus | null;
  onSiteChange: (value: number | null) => void;
  onCategoryChange: (value: number | null) => void;
  onYearChange: (value: number | null) => void;
  onMonthChange: (value: number | null) => void;
  onStatusChange: (value: EmissionStatus | null) => void;
  // Category-aware breakdown: columns of the selected category.
  columnsForCategory: CategoryColumn[];
}

const STATUS_OPTIONS: DropdownOption[] = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

// The resolved dimension that drives the emission-factor lookup (e.g. the fuel
// type: "Diesel", "Coal"). Stored inside each emission's activity_data.
const GROUP_KEY = "emission_category";
const EMISSION_UNIT = "tCO2e";
const BLANK_LABEL = "Unspecified";
const UNIT_MIXED = "mixed";

// Case-insensitive lookup of a key within an activity_data record.
function findValueCaseInsensitive(
  data: Record<string, unknown>,
  columnName: string,
): unknown {
  if (data[columnName] !== undefined) return data[columnName];
  const lower = columnName.toLowerCase();
  const match = Object.keys(data).find((k) => k.toLowerCase() === lower);
  return match ? data[match] : undefined;
}

// Aggregates the chosen metric across emissions, grouped by emission_category
// (the fuel type / dimension that selects the emission factor).
function computeBreakdown(
  emissions: EmissionData[],
  metric: BreakdownMetric,
  activityColumns: string[],
): BreakdownRow[] {
  const groups = new Map<string, { total: number; units: Set<string> }>();

  for (const emission of emissions) {
    const activityData = emission.activity_data || {};

    const rawGroup = findValueCaseInsensitive(activityData, GROUP_KEY);
    const label = rawGroup ? String(rawGroup) : BLANK_LABEL;

    let value = 0;
    if (metric === "emission") {
      value = Number(emission.total_emission) || 0;
    } else {
      for (const columnName of activityColumns) {
        value += Number(findValueCaseInsensitive(activityData, columnName)) || 0;
      }
    }

    const entry = groups.get(label) || { total: 0, units: new Set<string>() };
    entry.total += value;
    if (metric === "consumption" && emission.activity_data_unit) {
      entry.units.add(emission.activity_data_unit);
    }
    groups.set(label, entry);
  }

  return [...groups.entries()]
    .map(([label, { total, units }]) => {
      let unit = EMISSION_UNIT;
      if (metric === "consumption") {
        unit =
          units.size === 1 ? [...units][0] : units.size > 1 ? UNIT_MIXED : "";
      }
      return { label, total, unit };
    })
    .sort((a, b) => b.total - a.total);
}

const EmissionsFilterSidebar = ({
  hasMultipleSites,
  siteOptions,
  categoryOptions,
  yearOptions,
  monthOptions,
  selectedSite,
  selectedCategory,
  selectedYear,
  selectedMonth,
  selectedStatus,
  onSiteChange,
  onCategoryChange,
  onYearChange,
  onMonthChange,
  onStatusChange,
  columnsForCategory,
}: EmissionsFilterSidebarProps) => {
  const [open, setOpen] = useState(false);

  // Breakdown state
  const [metric, setMetric] = useState<BreakdownMetric>("consumption");
  const [categoryEmissions, setCategoryEmissions] = useState<EmissionData[]>([]);
  const [breakdownLoading, setBreakdownLoading] = useState(false);

  // Numeric columns hold the activity data / consumption the user filled in.
  const activityColumns = useMemo(
    () =>
      columnsForCategory
        .filter((c) => c.column_type === "number")
        .map((c) => c.column_name),
    [columnsForCategory],
  );

  // Fetch this user's emissions for the selected site + category, honoring the
  // year/month filters, across all pages so the totals are complete.
  useEffect(() => {
    let cancelled = false;

    const fetchCategoryEmissions = async () => {
      if (!selectedSite || !selectedCategory) {
        setCategoryEmissions([]);
        return;
      }
      try {
        setBreakdownLoading(true);
        const pageSize = 500;
        const first = await getEmissionsPaginated({
          siteId: selectedSite,
          categoryId: selectedCategory,
          year: selectedYear,
          month: selectedMonth,
          page: 1,
          limit: pageSize,
        });

        let allRows = first.data;
        const totalPages = Math.ceil(first.total / pageSize);
        for (let page = 2; page <= totalPages; page++) {
          const next = await getEmissionsPaginated({
            siteId: selectedSite,
            categoryId: selectedCategory,
            year: selectedYear,
            month: selectedMonth,
            page,
            limit: pageSize,
          });
          allRows = allRows.concat(next.data);
        }

        if (!cancelled) setCategoryEmissions(allRows);
      } catch (error) {
        console.error("Error fetching category breakdown:", error);
        if (!cancelled) setCategoryEmissions([]);
      } finally {
        if (!cancelled) setBreakdownLoading(false);
      }
    };

    fetchCategoryEmissions();
    return () => {
      cancelled = true;
    };
  }, [selectedSite, selectedCategory, selectedYear, selectedMonth]);

  const breakdown = useMemo(() => {
    if (!selectedCategory) return [];
    return computeBreakdown(categoryEmissions, metric, activityColumns);
  }, [categoryEmissions, metric, selectedCategory, activityColumns]);

  const grandTotal = useMemo(
    () => breakdown.reduce((sum, row) => sum + row.total, 0),
    [breakdown],
  );

  return (
    <>
      {/* Right-edge hover trigger — always visible */}
      <div
        onMouseEnter={() => setOpen(true)}
        className="fixed top-0 right-0 z-30 flex h-full w-6 cursor-pointer items-center justify-center bg-blue-600/80 text-white transition-colors hover:bg-blue-600"
        title="Filters"
      >
        <span className="rotate-180 text-xs font-semibold tracking-wide [writing-mode:vertical-rl]">
          Filters
        </span>
      </div>

      {/* Click-away backdrop (dropdown menus portal above this at z-9999) */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/20"
        />
      )}

      {/* Sliding panel */}
      <div
        onMouseEnter={() => setOpen(true)}
        className={`fixed top-0 right-0 z-50 flex h-full w-[340px] max-w-full flex-col overflow-y-auto bg-white shadow-2xl transition-transform duration-300 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h2 className="text-lg font-semibold text-gray-800">Filters</h2>
          <button
            onClick={() => setOpen(false)}
            className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            title="Close"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-4 p-4">
          {hasMultipleSites && (
            <div>
              <label className="mb-1 block text-sm font-medium">Site</label>
              <Dropdown
                options={siteOptions}
                placeholder="Select Site"
                value={selectedSite}
                onChange={(option) => onSiteChange(option?.id as number)}
                searchable
              />
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium">Category</label>
            <Dropdown
              options={categoryOptions}
              placeholder="All Categories"
              value={selectedCategory}
              onChange={(option) =>
                onCategoryChange((option?.id as number) ?? null)
              }
              searchable
              clearable
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Year</label>
            <Dropdown
              options={yearOptions}
              placeholder="All Years"
              value={selectedYear}
              onChange={(option) => onYearChange((option?.id as number) ?? null)}
              searchable
              clearable
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Month</label>
            <Dropdown
              options={monthOptions}
              placeholder="All Months"
              value={selectedMonth}
              onChange={(option) =>
                onMonthChange((option?.id as number) ?? null)
              }
              searchable
              clearable
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Status</label>
            <Dropdown
              options={STATUS_OPTIONS}
              placeholder="All Statuses"
              value={selectedStatus}
              onChange={(option) =>
                onStatusChange((option?.id as EmissionStatus) ?? null)
              }
              clearable
            />
          </div>

          {/* Category-aware consumption / emission breakdown by fuel type */}
          <div className="mt-2 border-t border-gray-200 pt-4">
            <h3 className="mb-1 text-sm font-semibold text-gray-800">
              Consumption by Type
            </h3>
            <p className="mb-3 text-xs text-gray-500">
              Total activity data you entered for this category in the selected
              year/month, grouped by the fuel type / emission factor that drives
              it.
            </p>

            {!selectedCategory ? (
              <div className="rounded-md bg-gray-50 px-3 py-4 text-center text-sm text-gray-400">
                Select a category to see its breakdown.
              </div>
            ) : (
              <div className="space-y-3">
                {/* Metric toggle */}
                <div className="flex rounded-md border border-gray-200 p-0.5">
                  {(
                    [
                      { id: "consumption", label: "Consumption" },
                      { id: "emission", label: "Emission" },
                    ] as { id: BreakdownMetric; label: string }[]
                  ).map((option) => (
                    <button
                      key={option.id}
                      onClick={() => setMetric(option.id)}
                      className={`flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors ${
                        metric === option.id
                          ? "bg-blue-600 text-white"
                          : "text-gray-600 hover:bg-gray-100"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {/* Results */}
                {breakdownLoading ? (
                  <div className="py-4 text-center text-sm text-gray-400">
                    Calculating…
                  </div>
                ) : breakdown.length === 0 ? (
                  <div className="py-4 text-center text-sm text-gray-400">
                    No data entered for this category yet.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-md border border-gray-200">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-left text-xs text-gray-500">
                          <th className="px-3 py-2 font-medium">Type</th>
                          <th className="px-3 py-2 text-right font-medium">
                            {metric === "consumption"
                              ? "Consumption"
                              : "Emission"}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {breakdown.map((row) => (
                          <tr
                            key={row.label}
                            className="border-t border-gray-100"
                          >
                            <td className="px-3 py-2 text-gray-700">
                              {row.label}
                            </td>
                            <td className="px-3 py-2 text-right font-medium text-gray-900">
                              {row.total.toLocaleString(undefined, {
                                maximumFractionDigits: 2,
                              })}
                              {row.unit ? (
                                <span className="ml-1 text-xs font-normal text-gray-500">
                                  {row.unit}
                                </span>
                              ) : null}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t border-gray-200 bg-gray-50">
                          <td className="px-3 py-2 text-xs font-semibold text-gray-600">
                            Total
                          </td>
                          <td className="px-3 py-2 text-right text-xs font-bold text-gray-900">
                            {grandTotal.toLocaleString(undefined, {
                              maximumFractionDigits: 2,
                            })}
                            {metric === "emission" ? (
                              <span className="ml-1 font-normal text-gray-500">
                                {EMISSION_UNIT}
                              </span>
                            ) : null}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default EmissionsFilterSidebar;
