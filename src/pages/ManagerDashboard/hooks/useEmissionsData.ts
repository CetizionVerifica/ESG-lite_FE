import { useState, useEffect, useCallback, useMemo } from "react";
import { getEmissionsBySite, EmissionData } from "../../../services/emissionService";
import { Site, KPIData, SiteEmissionsMap } from "../types";

interface UseEmissionsDataProps {
  selectedSite: number | null;
  selectedCategory: number | null;
  selectedYear: number | null;
  availableSites: Site[];
}

interface UseEmissionsDataReturn {
  emissions: EmissionData[];
  filteredEmissions: EmissionData[];
  approvedEmissions: EmissionData[];
  allSitesEmissions: SiteEmissionsMap;
  approvedSitesEmissions: SiteEmissionsMap;
  loading: boolean;
  kpis: KPIData;
  pendingEmissions: EmissionData[];
}

export function useEmissionsData({
  selectedSite,
  selectedCategory,
  selectedYear,
  availableSites,
}: UseEmissionsDataProps): UseEmissionsDataReturn {
  const [emissions, setEmissions] = useState<EmissionData[]>([]);
  const [allSitesEmissions, setAllSitesEmissions] = useState<SiteEmissionsMap>({});
  const [loading, setLoading] = useState(false);

  // Fetch emissions for selected site
  const fetchEmissions = useCallback(async () => {
    if (!selectedSite) {
      setEmissions([]);
      return;
    }

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

  // Fetch emissions for all sites (for comparison charts)
  const fetchAllSitesEmissions = useCallback(async () => {
    if (availableSites.length === 0) return;

    try {
      const allData: SiteEmissionsMap = {};
      await Promise.all(
        availableSites.map(async (site) => {
          const data = await getEmissionsBySite(site.site_id);
          allData[site.site_id] = data;
        })
      );
      setAllSitesEmissions(allData);
    } catch (error) {
      console.error("Error fetching all sites emissions:", error);
    }
  }, [availableSites]);

  useEffect(() => {
    fetchAllSitesEmissions();
  }, [fetchAllSitesEmissions]);

  // Filter emissions based on selected category and year
  const filteredEmissions = useMemo(() => {
    let result = emissions;

    if (selectedCategory) {
      result = result.filter(
        (emission) => emission.category?.category_id === selectedCategory
      );
    }

    if (selectedYear) {
      result = result.filter((emission) => {
        const emissionYear = parseInt(emission.date_of_reporting.substring(0, 4));
        return emissionYear === selectedYear;
      });
    }

    return result;
  }, [emissions, selectedCategory, selectedYear]);

  // Filter for approved emissions only (for charts and total emissions metric)
  const approvedEmissions = useMemo(() => {
    return filteredEmissions.filter((e) => e.status === "approved");
  }, [filteredEmissions]);

  // Filter all sites emissions for approved only (for comparison charts)
  const approvedSitesEmissions = useMemo((): SiteEmissionsMap => {
    const result: SiteEmissionsMap = {};
    Object.entries(allSitesEmissions).forEach(([siteId, emissions]) => {
      result[Number(siteId)] = emissions.filter((e) => e.status === "approved");
    });
    return result;
  }, [allSitesEmissions]);

  // Create a mapping of category_id to scope
  const categoryToScope = useMemo(() => {
    const mapping: Record<number, string> = {};
    availableSites.forEach((site) => {
      site.categories?.forEach((cat) => {
        mapping[cat.category_id] = cat.scope;
      });
    });
    return mapping;
  }, [availableSites]);

  // Calculate KPIs
  const kpis = useMemo((): KPIData => {
    // Total emissions only counts approved emissions
    const totalEmissions = approvedEmissions.reduce(
      (sum, e) => sum + (Number(e.total_emission) || 0),
      0
    );

    // Calculate scope emissions (from approved emissions only)
    let scope1Emissions = 0;
    let scope2Emissions = 0;
    let scope3Emissions = 0;

    approvedEmissions.forEach((e) => {
      const categoryId = e.category?.category_id;
      const scope = categoryId ? categoryToScope[categoryId] : null;
      const emissionValue = Number(e.total_emission) || 0;

      if (scope === "Scope 1") {
        scope1Emissions += emissionValue;
      } else if (scope === "Scope 2") {
        scope2Emissions += emissionValue;
      } else if (scope === "Scope 3") {
        scope3Emissions += emissionValue;
      }
    });

    return {
      totalEmissions,
      scope1Emissions,
      scope2Emissions,
      scope3Emissions,
      totalCount: filteredEmissions.length,
    };
  }, [filteredEmissions, approvedEmissions, categoryToScope]);

  // Get pending emissions list (top 5)
  const pendingEmissions = useMemo(() => {
    return filteredEmissions
      .filter((e) => e.status === "pending")
      .slice(0, 5);
  }, [filteredEmissions]);

  return {
    emissions,
    filteredEmissions,
    approvedEmissions,
    allSitesEmissions,
    approvedSitesEmissions,
    loading,
    kpis,
    pendingEmissions,
  };
}
