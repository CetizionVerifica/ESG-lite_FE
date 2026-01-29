import { useState, useEffect, useCallback } from "react";
import {
  getEmissionIntensity,
  getEmissionIntensityComparison,
  EmissionIntensityData,
  IntensityComparison,
} from "../../../services/productionDataService";
import { Site } from "../types";

interface UseEmissionIntensityProps {
  selectedSite: number | null;
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
  selectedSite,
  availableSites,
  selectedYear,
  startDate,
  endDate,
}: UseEmissionIntensityProps): UseEmissionIntensityReturn {
  const [intensityData, setIntensityData] = useState<EmissionIntensityData | null>(null);
  const [comparisonData, setComparisonData] = useState<IntensityComparison | null>(null);
  const [loading, setLoading] = useState(false);

  // Compute date range from selectedYear if startDate/endDate not provided
  const computedStartDate = startDate || (selectedYear ? `${selectedYear}-01-01` : undefined);
  const computedEndDate = endDate || (selectedYear ? `${selectedYear}-12-31` : undefined);

  const fetchIntensityData = useCallback(async () => {
    if (!selectedSite) return;

    try {
      setLoading(true);
      const params = computedStartDate && computedEndDate
        ? { startDate: computedStartDate, endDate: computedEndDate }
        : undefined;
      const data = await getEmissionIntensity(selectedSite, params);
      setIntensityData(data);
    } catch (error) {
      console.error("Error fetching emission intensity:", error);
      setIntensityData(null);
    } finally {
      setLoading(false);
    }
  }, [selectedSite, computedStartDate, computedEndDate]);

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
