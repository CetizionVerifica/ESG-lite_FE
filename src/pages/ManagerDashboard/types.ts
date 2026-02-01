import { EmissionData } from "../../services/emissionService";

export interface Category {
  category_id: number;
  category_name: string;
  scope: string | null;
}

export interface Site {
  site_id: number;
  name: string;
  categories: Category[];
}

export interface KPIData {
  grossEmissions: number;
  netEmissions: number;
  scope1Emissions: number;
  scope2Emissions: number;
  scope3Emissions: number;
  savedEmissions: number;
  totalCount: number;
}

export interface SiteEmissionsMap {
  [siteId: number]: EmissionData[];
}

export interface ChartDataPoint {
  name: string;
  value: number;
}
