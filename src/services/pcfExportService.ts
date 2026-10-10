import api from "../api/axios";

// PCF declaration export (C05 backend, GET /pcf/studies/:id/export).

export type DeclarationStage = "A1" | "A2" | "A3_energy" | "A3_packaging" | "A3_waste";
export type FootprintStatus = "draft" | "in_review" | "approved" | "published" | "superseded";

export type DeclarationLine = {
  id: string;
  stage: DeclarationStage;
  name: string;
  data_type: "primary" | "secondary";
  kgco2e_per_unit: number | null;
  value_hidden: boolean;
};

export type Dqr = { technology: number; geography: number; time: number; overall: number };

export type Declaration = {
  pact_id: string;
  draft: boolean;
  status: FootprintStatus;
  version: number;
  company: { name: string };
  product: { name: string; description: string | null };
  site: { name: string; country: string | null };
  declared_unit: { quantity: number; unit: string; label: string };
  reference_period: { start: string; end: string; year_type: "CY" | "FY" };
  method: {
    standard: string;
    boundary: string;
    pcr: string | null;
    allocation_key: string;
    allocation_share_pct: number | null;
    cut_off_rule_pct: number;
    gwp_sets: string[];
  };
  total_kg_per_unit: number;
  by_stage: Record<DeclarationStage, number | null>;
  hidden_stages: DeclarationStage[];
  lines: DeclarationLine[];
  primary_data_share_pct: number | null;
  dqr: Dqr | null;
  cut_off: { below_threshold_total_pct: number | null; within_limit: boolean } | null;
  licensed_values_withheld: boolean;
  factor_sources: { name: string; version: string }[];
  warnings: string[];
  reviewed_by: string | null;
  reviewed_at: string | null;
  calculated_at: string;
  generated_at: string;
  engine_version: string;
};

export type DeclarationResponse = { declaration: Declaration; file_name: string };

export const getDeclaration = async (studyId: number): Promise<DeclarationResponse> => {
  const response = await api.get(`/pcf/studies/${studyId}/export`, { params: { format: "pdf-data" } });
  return response.data;
};

/** The PACT JSON or CSV file as a blob, with the server's file name. */
export const getExportFile = async (studyId: number, format: "pact" | "csv"): Promise<{ blob: Blob; disposition: string | null }> => {
  const response = await api.get(`/pcf/studies/${studyId}/export`, { params: { format }, responseType: "blob" });
  return { blob: response.data as Blob, disposition: (response.headers?.["content-disposition"] as string | undefined) ?? null };
};
