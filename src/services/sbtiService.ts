

import api from "../api/axios";

export type SbtiPathway = "15C" | "WB2C";

export interface NearTermTablesRequest {
  siteIds: number[];
  baseYear: number;
  targetYear: number;
  annualRate: number;
}

export interface NearTermTable1Row {
  year: number;
  n: number;
  calculation: string;
  targetEmission: number;
  reducedBy: number | null;
  reducedByPct: number | null;
}

export interface NearTermTable2Row {
  year: number;
  n: number;
  scope1Target: number;
  scope2Target: number;
  scope3Target: number | null;
  totalTarget: number;
  reducedBy: number | null;
  reducedByPct: number | null;
}

export interface NearTermTable3Row {
  year: number;
  actualScope1: number;
  actualScope2: number;
  actualScope3: number | null;
  actualTotal: number;
  targetTotal: number;
  variance: number;
  variancePct: number | null;
  status: "Base Year" | "Reached" | "Not Reached" | "No Data";
}

export interface NearTermTargetResponse {
  heading: string;
  method: string;
  annualRate: number;
  baseYear: number;
  targetYear: number;
  horizonYears: number;
  scope3Share: number;
  scope3TargetRequired: boolean;
  scope1And2CoveragePct: number;
  scope1And2CoverageValid: boolean;
  baseTotals: { scope1: number; scope2: number; scope3: number; total: number };
  targetBoundaryBase: number;
  tables: {
    table1: NearTermTable1Row[];
    table2: NearTermTable2Row[];
    table3: NearTermTable3Row[];
  };
}

export const getNearTermTargetTables = async (payload: NearTermTablesRequest) => {
  const res = await api.post("/user/targets/tables", payload);
  return res.data as NearTermTargetResponse;
};


export interface LongTermChartRequest {
  siteIds: number[];
  baseYear: number;
}

export interface LongTermChartRow {
  year: number;
  n: number;
  targetEmission: number;
  scope1Target: number;
  scope2Target: number;
  scope3Target: number | null;
  reducedBy: number | null;
  reducedByPct: number | null;
}

export interface LongTermActualVsTargetRow {
  year: number;
  actualScope1: number | null;
  actualScope2: number | null;
  actualScope3: number | null;
  actualTotal: number | null;
  targetTotal: number;
  variance: number | null;
  variancePct: number | null;
  status: "Base Year" | "Reached" | "Not Reached" | "No Data";
}

export interface LongTermChartResponse {
  heading: string;
  method: string;
  baseYear: number;
  targetYear: number;
  years: number;
  annualRate: number;
  baseEmissions: number;
  targetEmissions: number;
  totalReductionPct: number;
  scope3Share: number;
  scope3TargetRequired: boolean;
  baseTotals: { scope1: number; scope2: number; scope3: number; total: number };
  rows: LongTermChartRow[];
  actualVsTarget?: LongTermActualVsTargetRow[];
}

export const getLongTermTargetChart = async (payload: LongTermChartRequest) => {
  const res = await api.post("/user/targets/long-term-chart", payload);
  console.log("long term data", res.data);
  return res.data as LongTermChartResponse;
};









