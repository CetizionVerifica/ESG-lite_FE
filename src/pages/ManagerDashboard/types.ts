import { EmissionData } from "../../services/emissionService";

export interface Category {
  category_id: number;
  category_name: string;
  scope: string;
}

export interface Site {
  site_id: number;
  name: string;
  categories: Category[];
}

export interface KPIData {
  totalEmissions: number;
  scope1Emissions: number;
  scope2Emissions: number;
  scope3Emissions: number;
  totalCount: number;
}

export interface SiteEmissionsMap {
  [siteId: number]: EmissionData[];
}

export interface ChartDataPoint {
  name: string;
  value: number;
}
