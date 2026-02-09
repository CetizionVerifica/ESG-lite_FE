import React, { useEffect, useMemo } from "react";
import Dropdown, { DropdownOption } from "../../components/Dropdown";
import { generateYearOptions } from "../ManagerDashboard/utils/dateUtils";
import { Site, Category } from "../ManagerDashboard/types";

export type YearType = "CY" | "FY";

interface Props {
  availableSites: Site[];
  selectedSites: number[];
  setSelectedSites: React.Dispatch<React.SetStateAction<number[]>>;

  selectedCategoryIds: number[];
  setSelectedCategoryIds: React.Dispatch<React.SetStateAction<number[]>>;

  yearType: YearType;
  setYearType: React.Dispatch<React.SetStateAction<YearType>>;

  year: number;
  setYear: React.Dispatch<React.SetStateAction<number>>;
}

const GhgReportFilters = ({
  availableSites,
  selectedSites,
  setSelectedSites,
  selectedCategoryIds,
  setSelectedCategoryIds,
  yearType,
  setYearType,
  year,
  setYear,
}: Props) => {

useEffect(() => {
    if (availableSites.length > 0 && selectedSites.length === 0) {
      setSelectedSites([availableSites[0].site_id]);
    }
  }, [availableSites, selectedSites.length, setSelectedSites]);

  const siteOptions: DropdownOption[] = useMemo(
    () => availableSites.map((s) => ({ id: s.site_id, label: s.name })),
    [availableSites]
  );

   const categories: Category[] = useMemo(() => {
    const map = new Map<number, Category>();
    selectedSites.forEach((sid) => {
      const site = availableSites.find((s) => s.site_id === sid);
      site?.categories?.forEach((c) => {
        if (!map.has(c.category_id)) map.set(c.category_id, c);
      });
    });
    return Array.from(map.values());
  }, [selectedSites, availableSites]);

   const categoryOptions: DropdownOption[] = useMemo(
    () => categories.map((c) => ({ id: c.category_id, label: c.category_name })),
    [categories]
  );

  useEffect(() => {
    if (selectedCategoryIds.length === 0) return;

    const valid = new Set(categories.map((c) => c.category_id));
    const next = selectedCategoryIds.filter((id) => valid.has(id));

    if (next.length !== selectedCategoryIds.length) {
      setSelectedCategoryIds(next);
    }
  }, [categories, selectedCategoryIds, setSelectedCategoryIds]);

  const yearTypeOptions: DropdownOption[] = [
    { id: "CY", label: "Calendar Year (CY)" },
    { id: "FY", label: "Fiscal Year (FY)" },
  ];

  const yearOptions = useMemo(() => generateYearOptions(), []);

   return (
    <div className="flex flex-wrap items-end gap-3 bg-white rounded-lg shadow p-4">
      <div className="min-w-55">
        <div className="text-sm font-medium mb-1">Sites</div>
        <Dropdown
          options={siteOptions}
          placeholder="Select sites"
          multiple
          multipleValue={selectedSites}
          onMultipleChange={(opts) => setSelectedSites(opts.map((o) => o.id as number))}
          searchable
          clearable
        />
      </div>

      <div className="min-w-55">
        <div className="text-sm font-medium mb-1">Categories</div>
        <Dropdown
          options={categoryOptions}
          placeholder="Select categories"
          multiple
          multipleValue={selectedCategoryIds}
          onMultipleChange={(opts) => setSelectedCategoryIds(opts.map((o) => o.id as number))}
          searchable
          clearable
        />
      </div>

      <div className="min-w-55">
        <div className="text-sm font-medium mb-1">Reporting Calendar</div>
        <Dropdown
          options={yearTypeOptions}
          placeholder="Calendar Year (CY)"
          value={yearType}
          onChange={(opt) => setYearType((opt?.id as YearType) || "CY")}
          clearable={false}
        />
      </div>

      <div className="min-w-35">
        <div className="text-sm font-medium mb-1">Year</div>
        <Dropdown
          options={yearOptions}
          placeholder="Year"
          value={year}
          onChange={(opt) => setYear(opt?.id as number)}
          clearable={false}
          searchable
        />
      </div>
    </div>
  );
};

export default GhgReportFilters;
