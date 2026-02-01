import { useState, useEffect, useCallback } from "react";
import {
  getEmissionIntensity,
  getEmissionIntensityComparison,
  EmissionIntensityData,
  IntensityComparison,
} from "../../../services/productionDataService";
import { Site } from "../types";

interface UseEmissionIntensityProps {
  selectedSites: number[];
  availableSites: Site[];
  selectedYear?: number | null;
  startDate?: string;
  endDate?: string;
}

interface UseEmissionIntensityReturn {
  intensityData: EmissionIntensityData | null;
  comparisonData: IntensityComparison | null;
  loading: boolean;
  refetch: () => void;
}

export function useEmissionIntensity({
  selectedSites,
  availableSites,
  selectedYear,
  startDate,
  endDate,
}: UseEmissionIntensityProps): UseEmissionIntensityReturn {
  const [intensityData, setIntensityData] = useState<EmissionIntensityData | null>(null);
  const [comparisonData, setComparisonData] = useState<IntensityComparison | null>(null);
  const [loading, setLoading] = useState(false);

  // Compute date range from selectedYear if startDate/endDate not provided
  // When no year is selected, use a wide range to get all years data
  const computedStartDate = startDate || (selectedYear ? `${selectedYear}-01-01` : "2000-01-01");
  const computedEndDate = endDate || (selectedYear ? `${selectedYear}-12-31` : `${new Date().getFullYear()}-12-31`);

  const fetchIntensityData = useCallback(async () => {
    if (selectedSites.length === 0) {
      setIntensityData(null);
      return;
    }

    try {
      setLoading(true);
      const params = computedStartDate && computedEndDate
        ? { startDate: computedStartDate, endDate: computedEndDate }
        : undefined;

      if (selectedSites.length === 1) {
        // Single site - use existing API
        const data = await getEmissionIntensity(selectedSites[0], params);
        setIntensityData(data);
      } else {
        // Multiple sites - fetch comparison data and aggregate
        const compData = await getEmissionIntensityComparison(selectedSites, params);

        // Filter for selected sites only
        const selectedSiteData = compData.comparison.filter((site) =>
          selectedSites.includes(site.siteId)
        );

        // Aggregate totals
        const totalEmissions = selectedSiteData.reduce(
          (sum, site) => sum + site.totalEmissions,
          0
        );
        const totalProduction = selectedSiteData.reduce(
          (sum, site) => sum + (site.totalProduction || 0),
          0
        );

        // Calculate combined intensity
        const combinedIntensity =
          totalProduction > 0 ? totalEmissions / totalProduction : 0;

        // Create aggregated data structure
        const aggregatedData: EmissionIntensityData = {
          totalEmissions,
          productionByUnit: [
            {
              unit: "Combined",
              totalProduction,
              emissionIntensity: combinedIntensity,
            },
          ],
          monthlyData: [],
          dateRange: compData.dateRange,
        };

        setIntensityData(aggregatedData);
      }
    } catch (error) {
      console.error("Error fetching emission intensity:", error);
      setIntensityData(null);
    } finally {
      setLoading(false);
    }
  }, [selectedSites, computedStartDate, computedEndDate]);

  const fetchComparisonData = useCallback(async () => {
    if (availableSites.length < 2) return;

    try {
      const siteIds = availableSites.map((s) => s.site_id);
      const params = computedStartDate && computedEndDate
        ? { startDate: computedStartDate, endDate: computedEndDate }
        : undefined;
      const data = await getEmissionIntensityComparison(siteIds, params);
      setComparisonData(data);
    } catch (error) {
      console.error("Error fetching intensity comparison:", error);
      setComparisonData(null);
    }
  }, [availableSites, computedStartDate, computedEndDate]);

  useEffect(() => {
    fetchIntensityData();
  }, [fetchIntensityData]);

  useEffect(() => {
    fetchComparisonData();
  }, [fetchComparisonData]);

  const refetch = useCallback(() => {
    fetchIntensityData();
    fetchComparisonData();
  }, [fetchIntensityData, fetchComparisonData]);

  return {
    intensityData,
    comparisonData,
    loading,
    refetch,
  };
}
