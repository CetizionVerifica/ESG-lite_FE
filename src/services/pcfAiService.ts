import ocrApi from "../api/ocrAxios";

/**
 * PCF AI assist (E2) on the AI service: factor sheet reading, BOM reading
 * and material → factor matching. Every suggestion carries a confidence
 * (0–100) and a reason; nothing here saves anything, the pages do that
 * once the person has confirmed.
 */

export type ColumnMatch = { header: string; confidence: number; reason: string; by: "header" | "ai" | "person" };

export type SheetUnit = { unit: string; reason: string };

export type AiFactorRow = {
  /** Row number as people see it in Excel (header is row 1). */
  line: number;
  /** Body for one row of POST /pcf/material-factors/import. */
  values: Record<string, unknown>;
  confidence: number;
  reason: string;
  warnings: string[];
  /** ESG-lite would refuse the row as it is. */
  problems: string[];
};

export type FactorSheetResponse = {
  file_name: string;
  sheet_names: string[];
  sheet_name: string | null;
  header_line: number;
  headers: string[];
  mapping: Record<string, ColumnMatch>;
  sheet_unit: SheetUnit | null;
  rows: AiFactorRow[];
  total_rows: number;
  rows_with_problems: number;
  low_confidence_rows: number;
  warnings: string[];
  ai_used: boolean;
};

export type BomLine = {
  /** Row number in the sheet, or the line's order in a PDF. */
  line: number;
  /** Body for one line of PUT /pcf/studies/:id/inputs. */
  values: Record<string, unknown>;
  confidence: number;
  reason: string;
  warnings: string[];
  problems: string[];
  by: "sheet" | "ai";
};

export type BomEvidence = { id: number; document_name: string; url: string; stored: "cloud" | "local" };

export type BomResponse = {
  file_name: string;
  sheet_names: string[];
  sheet_name: string | null;
  header_line: number;
  headers: string[];
  mapping: Record<string, ColumnMatch>;
  batch_units: number;
  lines: BomLine[];
  total_lines: number;
  lines_with_problems: number;
  low_confidence_lines: number;
  warnings: string[];
  ai_used: boolean;
  /** The raw file kept as evidence; null when it couldn't be stored. */
  evidence: BomEvidence | null;
};

export type MatchLine = {
  id?: string | number | null;
  name: string;
  unit?: string | null;
  stage?: string | null;
  material_group?: string | null;
  origin_country?: string | null;
  supplier_name?: string | null;
  recycled_share_pct?: number | null;
};

export type FactorCandidate = {
  material_factor_id: number;
  name: string;
  material_group?: string | null;
  unit?: string | null;
  geography?: string | null;
  source?: string | null;
  source_year?: number | null;
  licence?: string | null;
  recycled_variant?: boolean;
};

export type MatchRequest = { lines: MatchLine[]; factors: FactorCandidate[]; geography_hint?: string | null };

export type MatchSuggestion = { material_factor_id: number; name: string | null; confidence: number; reason: string; by: "rule" | "ai" };

export type MatchedLine = { id: string | number | null; name: string; suggestions: MatchSuggestion[]; unmatched: boolean };

export type MatchResponse = { lines: MatchedLine[]; total_lines: number; unmatched_lines: number; ai_used: boolean };

/** `{ field: header | null }`: the columns the person picked; null drops a detected one. */
export type MappingOverride = Record<string, string | null>;

const multipart = { headers: { "Content-Type": "multipart/form-data" } };

export const parseMaterialFactorSheet = async (file: File, opts: { sheetName?: string | null; mapping?: MappingOverride } = {}): Promise<FactorSheetResponse> => {
  const form = new FormData();
  form.append("file", file);
  if (opts.sheetName) form.append("sheet_name", opts.sheetName);
  if (opts.mapping) form.append("mapping", JSON.stringify(opts.mapping));
  const response = await ocrApi.post<FactorSheetResponse>("/v1/pcf/material-factors/parse-excel", form, multipart);
  return response.data;
};

export const parseBom = async (
  file: File,
  opts: { sheetName?: string | null; mapping?: MappingOverride; batchUnits?: number; massPerUnitKg?: number | null; studyId?: number; keepEvidence?: boolean } = {},
): Promise<BomResponse> => {
  const form = new FormData();
  form.append("file", file);
  if (opts.sheetName) form.append("sheet_name", opts.sheetName);
  if (opts.mapping) form.append("mapping", JSON.stringify(opts.mapping));
  if (opts.batchUnits != null) form.append("batch_units", String(opts.batchUnits));
  if (opts.massPerUnitKg != null) form.append("mass_per_unit_kg", String(opts.massPerUnitKg));
  if (opts.studyId != null) form.append("study_id", String(opts.studyId));
  // A re-read of a file already kept as evidence must not store it again.
  if (opts.keepEvidence === false) form.append("keep_evidence", "false");
  const response = await ocrApi.post<BomResponse>("/v1/pcf/parse-bom", form, multipart);
  return response.data;
};

export const matchFactors = async (body: MatchRequest): Promise<MatchResponse> => {
  const response = await ocrApi.post<MatchResponse>("/v1/pcf/match-factors", body);
  return response.data;
};

/** The AI service's own message (FastAPI `detail`), or the fallback. */
export function aiErrorMessage(e: unknown, fallback: string): string {
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (typeof detail === "string" && detail) return detail;
  return fallback;
}

/**
 * True when the AI service can't do this job: it never answered (down, blocked
 * or no URL configured), failed, has no such route (an older deployment), or
 * refused the token. The page then falls back to what it can do alone. A 4xx
 * that carries the service's own `detail` is an answer about the file.
 */
export function aiUnreachable(e: unknown): boolean {
  const res = (e as { response?: { status?: number; data?: { detail?: unknown } } })?.response;
  const status = res?.status;
  if (status === undefined || status >= 500) return true;
  if ([401, 403, 404, 405].includes(status)) return true;
  return res?.data?.detail === undefined;
}

// ---- supplier declaration reading (E2 phase 3, for C06) ----

export type DeclarationFieldName =
  | "product_name"
  | "supplier_name"
  | "declared_unit"
  | "value_kgco2e"
  | "boundary"
  | "standard"
  | "gwp_set"
  | "reference_start"
  | "reference_end"
  | "valid_from"
  | "valid_to"
  | "verifier";

export type DeclarationField = { value: string | number | null; confidence: number; reason: string; by: "pact" | "ai" | "rule" };

export type DeclarationResponse = {
  file_name: string;
  kind: "pact" | "pdf";
  fields: Record<DeclarationFieldName, DeclarationField>;
  /** The boundary differs from the footprint's; the figure must not be accepted as it is. */
  boundary_mismatch: boolean;
  unit_mismatch: boolean;
  low_confidence_fields: string[];
  warnings: string[];
  problems: string[];
  ai_used: boolean;
  evidence: BomEvidence | null;
};

/** A supplier's PCF/EPD (.pdf) or PACT (.json) → the fields to review, each with a confidence and a reason. */
export const parseDeclaration = async (
  file: File,
  opts: { expectedBoundary?: string; expectedUnit?: string; studyId?: number; keepEvidence?: boolean } = {},
): Promise<DeclarationResponse> => {
  const form = new FormData();
  form.append("file", file, file.name);
  if (opts.expectedBoundary) form.append("expected_boundary", opts.expectedBoundary);
  if (opts.expectedUnit) form.append("expected_unit", opts.expectedUnit);
  if (opts.studyId !== undefined) form.append("study_id", String(opts.studyId));
  if (opts.keepEvidence === false) form.append("keep_evidence", "false");
  const response = await ocrApi.post("/pcf/parse-declaration", form, { headers: { "Content-Type": "multipart/form-data" } });
  return response.data;
};
