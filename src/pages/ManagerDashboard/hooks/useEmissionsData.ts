import { useState, useEffect, useCallback, useMemo } from "react";
import { getEmissionsBySite, EmissionData } from "../../../services/emissionService";
import { Site, KPIData, SiteEmissionsMap } from "../types";

interface UseEmissionsDataProps {
  selectedSites: number[];
  selectedCategory: number | null;
  selectedYear: number | null;
  availableSites?: Site[];
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
  selectedSites,
  selectedCategory,
  selectedYear,
  availableSites,
}: UseEmissionsDataProps): UseEmissionsDataReturn {
  const [emissions, setEmissions] = useState<EmissionData[]>([]);
  const [allSitesEmissions, setAllSitesEmissions] = useState<SiteEmissionsMap>({});
  const [loading, setLoading] = useState(false);

  // Fetch emissions for all selected sites
  const fetchEmissions = useCallback(async () => {
    if (selectedSites.length === 0) {
      setEmissions([]);
      return;
    }

    try {
      setLoading(true);
      // Fetch emissions for all selected sites in parallel
      const allEmissionsPromises = selectedSites.map((siteId) =>
        getEmissionsBySite(siteId)
      );
      const allEmissionsArrays = await Promise.all(allEmissionsPromises);
      // Merge all emissions into a single array
      setEmissions(allEmissionsArrays.flat());
    } catch (error) {
      console.error("Error fetching emissions:", error);
      setEmissions([]);
    } finally {
      setLoading(false);
    }
  }, [selectedSites]);

  useEffect(() => {
    fetchEmissions();
  }, [fetchEmissions]);

  // Fetch emissions for all sites (for comparison charts)
  const fetchAllSitesEmissions = useCallback(async () => {
    if (!availableSites || availableSites.length === 0) return;

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
      result[Number(siteId)] = emissions.filter((e:any) => e.status === "approved");
    });
    return result;
  }, [allSitesEmissions]);

  // Create a mapping of category_id to scope (including null for categories like Renewable Electricity)
  const categoryToScope = useMemo(() => {
    const mapping: Record<number, string | null> = {};
    availableSites?.forEach((site) => {
      site.categories?.forEach((cat) => {
        mapping[cat.category_id] = cat.scope;
      });
    });
    return mapping;
  }, [availableSites]);

  // Calculate KPIs
  const kpis = useMemo((): KPIData => {
    // Calculate scope emissions (from approved emissions only)
    let scope1Emissions = 0;
    let scope2Emissions = 0;
    let scope3Emissions = 0;
    let savedEmissions = 0;

    console.log("Calculating KPIs from approved emissions:", approvedEmissions);
    approvedEmissions.forEach((e) => {
      const categoryId = e.category?.category_id;
      // Prefer the scope carried on the emission's own joined category; fall back
      // to the availableSites-derived map. Relying on the map alone silently
      // dropped emissions whose category wasn't in it — undercounting the total
      // once multiple sites (with categories not all present in the map) were selected.
      // Use the emission's own joined category scope when present. A category
      // scope of `null` is meaningful (saved emissions, e.g. Renewable
      // Electricity), so only fall back to the map when scope is truly ABSENT
      // (undefined) — never when it's an explicit null.
      const catScope = (e.category as any)?.scope;
      const scope =
        catScope !== undefined
          ? catScope
          : categoryId
          ? categoryToScope[categoryId]
          : null;
      const emissionValue = Number(e.total_emission) || 0;

      if (scope === "Scope 1") {
        scope1Emissions += emissionValue;
      } else if (scope === "Scope 2") {
        scope2Emissions += emissionValue;
      } else if (scope === "Scope 3") {
        scope3Emissions += emissionValue;
      } else if (scope === null) {
        // Categories with null scope (e.g., Renewable Electricity) count as saved emissions
        savedEmissions += emissionValue;
      }
    });

    // Gross emissions = Scope 1 + Scope 2 + Scope 3
    const grossEmissions = scope1Emissions + scope2Emissions + scope3Emissions;

    // Net emissions = Gross - Saved (discounted by renewable electricity)
    const netEmissions = grossEmissions - savedEmissions;
    return {
      grossEmissions,
      netEmissions,
      scope1Emissions,
      scope2Emissions,
      scope3Emissions,
      savedEmissions,
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
