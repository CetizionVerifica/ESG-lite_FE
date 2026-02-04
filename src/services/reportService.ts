import api from "../api/axios";

export type Frequency = "yearly" | "monthly";

export interface EdeReportRequest {
    siteIds : number[];
    categoryIds?: number[];
  frequency: Frequency;
  year: number;
  month ?: number;
}

export interface BySiteRow {
  siteId: number;
  siteName: string;
  scope1: number;
  scope2: number;
  scope3: number;
  total: number;
  pctOfTotal: number;
}

export interface SiteDonutRow {
  name: string;
  value: number;
  pct: number;
}
export interface MonthlyBySiteRow {

    month: string;
    siteId: number;
  siteName: string;
  total: number;

}

export interface SavedBySiteRow {
  siteId: number;
  siteName: string;
  saved: number; // tCO2e
}

export interface RenewableKwhBySiteRow {
  siteId: number;
  siteName: string;
  kwh: number;
  unit: string; // "kWh"
}
export interface IntensityMonthlyRow {
  month: string; // "YYYY-MM"
  siteName: string;
  emissions: number;
  production: number;
  intensity: number;
  unit: string;
}
export interface EdeReportResponse {
  totals: { scope1: number; scope2: number; scope3: number; total: number };

  bySite: BySiteRow[];
  siteDonut: SiteDonutRow[];

  monthlyBySite: MonthlyBySiteRow[];
  savedBySite: SavedBySiteRow[];
  renewableKwhBySite: RenewableKwhBySiteRow[];

  intensityMonthly: IntensityMonthlyRow[];
}

export const getEdeReport = async (payload: EdeReportRequest) => {
  const res = await api.post("/user/reports/ede", payload);
  return res.data;
};
