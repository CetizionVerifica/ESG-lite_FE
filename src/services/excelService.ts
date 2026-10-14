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

async function refuse(response: Response, fallback: string, parsed?: unknown): Promise<never> {
  // A body can be read once: a caller that already parsed it passes it on.
  const error = parsed !== undefined ? parsed : await response.json().catch(() => ({}));
  const detail = (error as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") throw new ExcelServiceError(detail, response.status);
  const body = (detail ?? {}) as { code?: unknown; message?: unknown };
  const code = typeof body.code === "string" ? body.code : null;
  const message = typeof body.message === "string" ? body.message : fallback;
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
    await refuse(response, "Import failed.", error);
  }

  return response.json();
}

// ── Smart import (XI4): the mapping proposal path ───────────────────────────

/** The confirmed proposal as XI0 shapes it; the python twin validates it. See src/features/bulk-upload/smart/types.ts. */
export type SmartProposal = { document_id: number; site_id: number; sheets: unknown[]; model?: unknown };

/**
 * Asks the mapper what the workbook holds for one site (`POST /v1/excel/propose`,
 * XI2). The caller's own token scopes the context the model sees; a site the
 * caller doesn't hold is refused by ESG-lite (403 IMPORT_FORBIDDEN), a client
 * with Smart import off gets 403 AI_IMPORT_DISABLED_FOR_CLIENT.
 */
export async function proposeMapping(documentId: number, siteId: number): Promise<SmartProposal> {
  const response = await fetch(`${PYTHON_API_URL}/v1/excel/propose`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...ocrAuthHeaders() },
    body: JSON.stringify({ document_id: documentId, site_id: siteId }),
  });
  if (!response.ok) await refuse(response, "The mapper couldn't read the workbook.");
  return response.json();
}

export interface SmartPreviewOptions {
  page?: number;
  pageSize?: number;
  /** Only rows carrying this issue code (ESG-lite `GET /imports/plans/:id?code=`). */
  code?: string | null;
  /** Pages an existing plan instead of planning the workbook again. */
  planId?: string | null;
  /** The plan of an earlier preview, cancelled when a new one is made. */
  cancelPlanId?: string | null;
}

/**
 * Plans the confirmed proposal on ESG-lite (`POST /imports/plans`, channel
 * bulk_upload, with `mapping` so XI3 learns from it on commit) and returns the
 * plan with a page of rows, flattened like the column-mapped preview.
 */
export async function fetchSmartPreview(proposal: SmartProposal, opts: SmartPreviewOptions = {}): Promise<PreviewRowsResponse> {
  const response = await fetch(`${PYTHON_API_URL}/v1/excel/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...ocrAuthHeaders() },
    body: JSON.stringify({
      document_id: proposal.document_id,
      site_id: proposal.site_id,
      proposal,
      page: opts.page ?? 1,
      page_size: opts.pageSize ?? 100,
      ...(opts.code && { code: opts.code }),
      ...(opts.planId && { plan_id: opts.planId }),
      ...(opts.cancelPlanId && { cancel_plan_id: opts.cancelPlanId }),
    }),
  });
  if (!response.ok) await refuse(response, "Failed to fetch preview rows.");
  return response.json();
}

/** Commits the previewed plan of a confirmed proposal (`plan_id` at `version`); rows with issues must be skipped first. */
export async function importProposal(proposal: SmartProposal, plan: { plan_id: string; version: number }): Promise<ImportResponse> {
  const response = await fetch(`${PYTHON_API_URL}/v1/excel/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...ocrAuthHeaders() },
    body: JSON.stringify({ document_id: proposal.document_id, site_id: proposal.site_id, proposal, plan_id: plan.plan_id, version: plan.version }),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const detail = error?.detail;
    if (response.status === 409 && (typeof detail === "string" || !detail)) throw new ExcelServiceError(detail || ALREADY_IMPORTED_MESSAGE, 409);
    await refuse(response, "Import failed.");
  }
  return response.json();
}
