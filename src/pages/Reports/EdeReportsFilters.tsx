import { useEffect, useMemo, useState } from "react";
import Dropdown, { DropdownOption } from "../../components/Dropdown";
import { generateYearOptions, getMonthLabels } from "../ManagerDashboard/utils/dateUtils";
import { Site, Category } from "../ManagerDashboard/types";

type Frequency = "yearly" | "monthly";


interface Props {
  availableSites: Site[];
  selectedSites: number[];
  setSelectedSites: React.Dispatch<React.SetStateAction<number[]>>;

  selectedCategoryIds: number[];
  setSelectedCategoryIds: React.Dispatch<React.SetStateAction<number[]>>;

  frequency: "yearly" | "monthly";
  setFrequency: React.Dispatch<React.SetStateAction<"yearly" | "monthly">>;

  year: number;
  setYear: React.Dispatch<React.SetStateAction<number>>;

  month: number;
  setMonth: React.Dispatch<React.SetStateAction<number>>;
}

const EdeReportsFilters = ({
     availableSites,
  selectedSites,
  setSelectedSites,
  selectedCategoryIds,
  setSelectedCategoryIds,
  frequency,
  setFrequency,
  year,
  setYear,
  month,
  setMonth,
}: Props) => {

      useEffect(() => {
    if (availableSites.length > 0 && selectedSites.length === 0) {
      setSelectedSites([availableSites[0].site_id]);
    }
  }, [availableSites, selectedSites.length]);

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

  const frequencyOptions: DropdownOption[] = [
    { id: "yearly", label: "Yearly" },
    { id: "monthly", label: "Monthly" },
  ];

  const yearOptions = useMemo(() => generateYearOptions(), []);

  const monthOptions: DropdownOption[] = useMemo(
    () =>
      getMonthLabels().map((label, idx) => ({
        id: idx + 1,
        label,
      })),
    []
  );

  return(
        <div className="flex flex-wrap items-end gap-3 bg-white rounded-lg shadow p-4">

<div className="min-w-55">
        <div className="text-sm font-medium mb-1">Sites</div>
        <Dropdown
          options={siteOptions}
          placeholder="Select sites"
          multiple
          multipleValue={selectedSites}
          onMultipleChange={(opts) =>
            setSelectedSites(opts.map((o) => o.id as number))
          }
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
          onMultipleChange={(opts) =>
            setSelectedCategoryIds(opts.map((o) => o.id as number))
          }
          searchable
          clearable
        />
      </div>
       <div className="min-w-40">
        <div className="text-sm font-medium mb-1">Frequency</div>
        <Dropdown
          options={frequencyOptions}
          placeholder="Yearly"
          value={frequency}
          onChange={(opt) =>
            setFrequency((opt?.id as Frequency) || "yearly")
          }
          clearable={false}
        />
      </div>
       <div className="flex gap-3">
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
        {frequency === "monthly" && (
          <div className="min-w-35">
            <div className="text-sm font-medium mb-1">Month</div>
            <Dropdown
              options={monthOptions}
              placeholder="Month"
              value={month}
              onChange={(opt) => setMonth(opt?.id as number)}
              clearable={false}
            />
          </div>
        )}

        </div>
        </div>
  )

}

export default EdeReportsFilters;
