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
  opts: { sheetName?: string | null; mapping?: MappingOverride; batchUnits?: number; massPerUnitKg?: number | null; studyId?: number } = {},
): Promise<BomResponse> => {
  const form = new FormData();
  form.append("file", file);
  if (opts.sheetName) form.append("sheet_name", opts.sheetName);
  if (opts.mapping) form.append("mapping", JSON.stringify(opts.mapping));
  if (opts.batchUnits != null) form.append("batch_units", String(opts.batchUnits));
  if (opts.massPerUnitKg != null) form.append("mass_per_unit_kg", String(opts.massPerUnitKg));
  if (opts.studyId != null) form.append("study_id", String(opts.studyId));
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

/** True when the AI service never answered (down, blocked or no URL configured): the page falls back to what it can do alone. */
export function aiUnreachable(e: unknown): boolean {
  const status = (e as { response?: { status?: number } })?.response?.status;
  return status === undefined || status >= 500;
}
