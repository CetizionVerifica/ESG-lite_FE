import { ocrAuthHeaders } from "../api/ocrAxios";

const PYTHON_API_URL = import.meta.env.VITE_OCR_API_URL;

export interface UploadHeadersResponse {
  document_id: number;
  headers: string[];
}

export interface UniqueCategoriesResponse {
  unique_categories: string[];
  total_rows: number;
}

/** The plan ESG-lite made for the sheet (IM0 `ImportPlan` without its rows), as `/v1/excel/preview` returns it. */
export interface PlanSummary {
  /** Null when every row was refused before a plan could be made. */
  plan_id: string | null;
  version: number;
  status: "draft" | "committed" | "cancelled" | "expired";
  counts: { rows: number; ready: number; issue: number; skipped: number; warnings: number };
  totals: { tco2e: number; by_category: { category_id: number; name: string; scope: string | null; tco2e: number; rows: number }[]; by_month: { month: string; tco2e: number }[] };
  issues_summary: { code: string; count: number; example_row_refs: string[]; local?: boolean }[];
  expires_at?: string;
}

export interface PreviewRowsResponse {
  plan: PlanSummary;
  rows: Record<string, unknown>[];
  /** Rows in the plan (plus the ones refused before planning), not the page. */
  total_rows: number;
  page: number;
  page_size: number;
  /** Rows left out because their category wasn't ticked. */
  not_selected: number;
  /** Data rows in the sheet. */
  sheet_rows: number;
}

export interface ImportResponse {
  /** Rows saved, not counting FERA twins. */
  inserted: number;
  skipped: number;
  total_rows: number;
  upload_batch_id?: string | null;
  /** Each skipped row with its data row number (1 = first under the header), category and reason. Capped at 1000. */
  skipped_rows?: { row: number; emission_category: string | null; reason: string }[];
  /** Rows outside the chosen categories, and FERA twins saved. */
  not_selected?: number;
  fera_inserted?: number;
  plan_id?: string | null;
  plan?: PlanSummary;
}

/** An ESG-lite refusal passed on by the AI service: its status and IM0 body (`{ code, message, details }`). */
export class ExcelServiceError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string | null = null,
  ) {
    super(message);
    this.name = "ExcelServiceError";
  }
}

/** Rows changed between the preview and the import (ESG-lite re-checks them on commit). */
export const PLAN_CHANGED_MESSAGE = "Some rows changed since the preview. Go back to the preview, check them again and import from there.";

async function refuse(response: Response, fallback: string): Promise<never> {
  const error = await response.json().catch(() => ({}));
  const detail = error?.detail;
  if (typeof detail === "string") throw new ExcelServiceError(detail, response.status);
  const code = typeof detail?.code === "string" ? detail.code : null;
  const message = typeof detail?.message === "string" ? detail.message : fallback;
  throw new ExcelServiceError(code === "IMPORT_PLAN_VERSION_CONFLICT" ? PLAN_CHANGED_MESSAGE : message, response.status, code);
}

/** Shown when the AI service refuses a second import of the same file (HTTP 409). */
export const ALREADY_IMPORTED_MESSAGE =
  "This file has already been imported, or is being imported now. Upload a new file to import more rows.";

export async function uploadExcelGetHeaders(file: File): Promise<UploadHeadersResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${PYTHON_API_URL}/v1/excel/upload`, {
    method: "POST",
    headers: ocrAuthHeaders(),
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.detail || "Failed to upload file.");
  }

  return response.json();
}

export async function fetchUniqueCategories(
  documentId: number,
  mappings: Record<string, string>
): Promise<UniqueCategoriesResponse> {
  const response = await fetch(`${PYTHON_API_URL}/v1/excel/unique-categories`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...ocrAuthHeaders() },
    body: JSON.stringify({ document_id: documentId, mappings }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.detail || "Failed to fetch unique categories.");
  }

  return response.json();
}


export interface SheetArgs {
  documentId: number;
  mappings: Record<string, string>;
  selectedCategories: string[];
  siteId: number;
  categoryId: number;
  /** The date rows without a date cell are filed on (the chosen month's last day). */
  dateOfReporting: string;
}

const sheetBody = (a: SheetArgs) => ({
  document_id: a.documentId,
  mappings: a.mappings,
  selected_categories: a.selectedCategories,
  site_id: a.siteId,
  category_id: a.categoryId,
  date_of_reporting: a.dateOfReporting,
});

/**
 * Plans the sheet on ESG-lite (`POST /imports/plans`, channel bulk_upload) and
 * returns the plan with its first page of rows. `cancelPlanId` frees the plan
 * of an earlier preview of the same sheet; `planId` only pages an existing plan.
 */
export async function fetchPreviewRows(
  args: SheetArgs,
  opts: { page?: number; pageSize?: number; state?: "ready" | "issue" | "skipped"; planId?: string | null; cancelPlanId?: string | null } = {},
): Promise<PreviewRowsResponse> {
  const response = await fetch(`${PYTHON_API_URL}/v1/excel/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...ocrAuthHeaders() },
    body: JSON.stringify({
      ...sheetBody(args),
      page: opts.page ?? 1,
      page_size: opts.pageSize ?? 100,
      ...(opts.state && { state: opts.state }),
      ...(opts.planId && { plan_id: opts.planId }),
      ...(opts.cancelPlanId && { cancel_plan_id: opts.cancelPlanId }),
    }),
  });

  if (!response.ok) await refuse(response, "Failed to fetch preview rows.");
  return response.json();
}

/** Commits the previewed plan (`plan_id` at `version`); rows with issues are skipped. */
export async function importAllRows(args: SheetArgs, plan: { plan_id: string; version: number }): Promise<ImportResponse> {
  const response = await fetch(`${PYTHON_API_URL}/v1/excel/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...ocrAuthHeaders() },
    body: JSON.stringify({ ...sheetBody(args), plan_id: plan.plan_id, version: plan.version }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const detail = error?.detail;
    if (response.status === 409 && (typeof detail === "string" || !detail)) throw new ExcelServiceError(detail || ALREADY_IMPORTED_MESSAGE, 409);
    await refuse(response, "Import failed.");
  }

  return response.json();
}
