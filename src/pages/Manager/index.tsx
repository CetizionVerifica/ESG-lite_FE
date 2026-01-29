import { useState, useEffect, useCallback, useMemo } from "react";
import Dropdown, { DropdownOption } from "../../components/Dropdown";
import { useAuth } from "../../context/AuthContext";
import {
  getEmissionsBySite,
  approveEmission,
  rejectEmission,
  bulkApproveEmissions,
  bulkDeleteEmissions,
  EmissionData,
} from "../../services/emissionService";
import EmissionsTable from "./EmissionsTable";

interface Category {
  category_id: number;
  category_name: string;
  scope: string;
}

interface Site {
  site_id: number;
  name: string;
  categories: Category[];
}

function generateDateOptions(): DropdownOption[] {
  const options: DropdownOption[] = [];
  const startYear = 2018;
  const endYear = 2030;

  // Generate from most recent to oldest (December 2026 to January 2021)
  for (let year = endYear; year >= startYear; year--) {
    for (let month = 11; month >= 0; month--) {
      const date = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0).getDate();
      const value = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      const label = date.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      });
      options.push({ id: value, label });
    }
  }

  return options;
}

const ManagerPage = () => {
  const { user } = useAuth();

  // For managers with multiple sites
  const sites: Site[] = user?.sites || [];
  // Fallback to single site for backward compatibility
  const singleSite: Site | null = user?.site || null;

  // Use sites array if available, otherwise use single site
  const availableSites = sites.length > 0 ? sites : singleSite ? [singleSite] : [];

  const [selectedSite, setSelectedSite] = useState<number | null>(
    availableSites.length > 0 ? availableSites[0].site_id : null
  );
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [emissions, setEmissions] = useState<EmissionData[]>([]);
  const [loading, setLoading] = useState(false);

  // Get the currently selected site object
  const currentSite = availableSites.find((s) => s.site_id === selectedSite);

  // Categories from the selected site
  const categories: Category[] = currentSite?.categories || [];

  const siteOptions: DropdownOption[] = availableSites.map((site) => ({
    id: site.site_id,
    label: site.name,
  }));

  const categoryOptions: DropdownOption[] = categories.map((category) => ({
    id: category.category_id,
    label: category.category_name,
  }));

  const dateOptions = generateDateOptions();

  // Reset category when site changes
  useEffect(() => {
    setSelectedCategory(null);
  }, [selectedSite]);

  // Fetch all emissions for the selected site
  const fetchEmissions = useCallback(async () => {
    if (!selectedSite) return;

    try {
      setLoading(true);
      const data = await getEmissionsBySite(selectedSite);
      setEmissions(data);
    } catch (error) {
      console.error("Error fetching emissions:", error);
      setEmissions([]);
    } finally {
      setLoading(false);
    }
  }, [selectedSite]);

  useEffect(() => {
    fetchEmissions();
  }, [fetchEmissions]);

  // Handle approve emission
  const handleApprove = useCallback(async (id: number, comment?: string) => {
    const response = await approveEmission(id, comment);
    // Update the emission with the full response data including reviewed_by
    setEmissions((prev) =>
      prev.map((e) =>
        e.pk_id === id ? response.emission : e
      )
    );
  }, []);

  // Handle reject emission
  const handleReject = useCallback(async (id: number, comment: string) => {
    const response = await rejectEmission(id, comment);
    // Update the emission with the full response data including reviewed_by
    setEmissions((prev) =>
      prev.map((e) =>
        e.pk_id === id ? response.emission : e
      )
    );
  }, []);

  // Handle bulk approve emissions
  const handleBulkApprove = useCallback(async (ids: number[]) => {
    await bulkApproveEmissions(ids);
    // Refresh emissions after bulk approval
    await fetchEmissions();
  }, [fetchEmissions]);

  // Handle bulk delete emissions
  const handleBulkDelete = useCallback(async (ids: number[]) => {
    await bulkDeleteEmissions(ids);
    // Refresh emissions after bulk delete
    await fetchEmissions();
  }, [fetchEmissions]);

  // Filter emissions based on selected category and date
  const filteredEmissions = useMemo(() => {
    let result = emissions;

    if (selectedCategory) {
      result = result.filter(
        (emission) => emission.category?.category_id === selectedCategory
      );
    }

    if (selectedDate) {
      result = result.filter((emission) => {
        // Compare year-month portion only (selectedDate is now YYYY-MM-DD format)
        const emissionYearMonth = emission.date_of_reporting.substring(0, 7);
        const selectedYearMonth = selectedDate.substring(0, 7);
        return emissionYearMonth === selectedYearMonth;
      });
    }

    return result;
  }, [emissions, selectedCategory, selectedDate]);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Manage data</h1>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Site Selection - only show if manager has multiple sites */}
        <div>
          <label className="block text-sm font-medium mb-1">Site</label>
          <Dropdown
            options={siteOptions}
            placeholder="Select Site"
            value={selectedSite}
            onChange={(option) => setSelectedSite(option?.id as number)}
            searchable={true}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Category</label>
          <Dropdown
            options={categoryOptions}
            placeholder="All Categories"
            value={selectedCategory}
            onChange={(option) => setSelectedCategory(option?.id as number)}
            searchable={true}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Date</label>
          <Dropdown
            options={dateOptions}
            placeholder="All Dates"
            value={selectedDate}
            onChange={(option) => setSelectedDate(option?.id as string)}
            searchable={true}
          />
        </div>
      </div>

      {/* Current Site Info */}
      {currentSite && (
        <div className="mb-4">
          <span className="text-sm font-medium text-gray-700">
            Viewing: {currentSite.name}
          </span>
          <span className="text-sm text-gray-500 ml-4">
            {filteredEmissions.length} emission{filteredEmissions.length !== 1 ? "s" : ""} found
          </span>
        </div>
      )}

      {/* Emissions Table */}
      <EmissionsTable
        emissions={filteredEmissions}
        loading={loading}
        onApprove={handleApprove}
        onReject={handleReject}
        onBulkApprove={handleBulkApprove}
        onBulkDelete={handleBulkDelete}
      />
    </div>
  );
};

export default ManagerPage;
