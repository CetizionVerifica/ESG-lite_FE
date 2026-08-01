import api from "../api/axios";

export type YearType = "CY" | "FY";
export type Frequency = "monthly" | "quarterly" | "yearly";

export type PeriodBucket = {
  label: string;
  total: number;
  scope1: number;
  scope2: number;
  scope3: number;
};

export type PeriodBreakdown = {
  frequency: Frequency;
  periods: PeriodBucket[];
  total: number;
};

export type GhgReportTablesRequest = {
  siteIds: number[];
  categoryIds?: number[];
  yearType: YearType;
  year: number;
  compareYear?: number;
  frequency?: Frequency;
}

export type ScopeTotals = {
  scope1: number;
  scope2: number;
  scope3: number;
  total: number;
};

export type Table1YearValue = {
  emissions: number;
  pctOfTotal: number;
};

export type Table1Row = {
 scope: string;
  values: Record<string, Table1YearValue>;
};

export type OverviewRow = {
  scope: string;
  category: string;
  bySite: { siteId: number; siteName: string; value: number }[];
  total: number;
};

export type GhgReportTablesResponse = {
  filters: {
    siteIds: number[];
    categoryIds: number[] | null;
    yearType: YearType;
    year: number;
    compareYear: number;
    fiscalYearRule?: string; 
  };
  ranges: Record<string, { startDate: string; endDate: string }>;
  totals: Record<string, ScopeTotals>;
  tables: {
    table1_emissionsByScope_twoYears: Table1Row[];
    table_overviewByLocations_compareYear: { year: number; rows: OverviewRow[] };
    table_overviewByLocations_selectedYear: { year: number; rows: OverviewRow[] };
  };
  periodBreakdown?: PeriodBreakdown;
};

export const getGhgReportTables = async (payload: GhgReportTablesRequest) => {
  const { data } = await api.post<GhgReportTablesResponse>("/user/ghg/tables", payload);
 // console.log("data", data)
  return data;
};

export type GhgReportDetailsRequest = {
  siteIds: number[];
  categoryIds?: number[];
  yearType: YearType;
  year: number;
  compareYear?: number;
  frequency?: Frequency;
};

export type GhgDetailsRow = {
  scope: string;
  categoryId: number;
  categoryName: string;
  fuelType: string;
  siteId: number;
  siteName: string;
  compare: { consumption: number; unit: string; emissions: number };
  selected: { consumption: number; unit: string; emissions: number };
};

export type GhgReportDetailsResponse = {
  filters: {
    siteIds: number[];
    categoryIds: number[] | null;
    yearType: YearType;
    year: number;
    compareYear: number;
    fiscalYearRule?: string;
  };
  ranges: Record<string, { startDate: string; endDate: string }>;
  rows: GhgDetailsRow[];
};

export const getGhgReportDetails = async (payload: GhgReportDetailsRequest) => {
  const { data } = await api.post<GhgReportDetailsResponse>("/user/ghg/details", payload);
  console.log("data", data)
  return data;
};
