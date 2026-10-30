import api from "../api/axios";
import type { CheckId, RowChecks } from "../lib/scope3/checks";

/** `draft` only with the company's review workflow switched on (S3-15 part 2). */
export type EmissionStatus = "draft" | "pending" | "approved" | "rejected";

export interface EmissionData {
  pk_id: number;
  activity_data: Record<string, any>;
  extra_data?: Record<string, any>;
  total_emission: number;
  unit: string;
  date_of_reporting: string;
  // 'monthly' (default) or 'yearly'. Yearly rows are dated at their period
  // end and cover the whole year — monthly charts must not bucket them.
  reporting_period?: "monthly" | "yearly";
  year_type?: "CY" | "FY" | null;
  activity_data_unit?: string;
  /** The entry's quantity in `activity_data_unit`, worked out by the server from its form (GET /user/emissions); null when it has none. Absent from older APIs. */
  quantity?: number | null;
  status: EmissionStatus;
  review_comment?: string;
  reviewed_at?: string;
  created_at: string;
  updated_at: string;
  site: {
    site_id: number;
    name: string;
  };
  category: {
    category_id: number;
    category_name: string;
    scope?: string | null;
    /** GHG Protocol category 1–15 (S3-1), when the server sends it; words the method label (S3-3). */
    ghg_category?: number | null;
  };
  reviewed_by?: {
    user_id: number;
    name: string;
  };
  created_by?: {
    user_id: number;
    name: string;
  };
  fera_linked_id?: number | null;
  /** FERA rows (S3-7): the Category 3 sub-activity; labels in src/lib/scope3/fera.ts. */
  scope3_sub?: string | null;
  /** S3-6: the supplier the goods came from (GET /user/emissions returns its id and name). */
  supplier?: { supplier_id: number; name: string } | null;
  parent_category_name?: string | null;
  /** FERA rows: status of the linked non-FERA entry; null when there is none. */
  fera_partner_status?: EmissionStatus | null;
  /** S3-15 review checks; null while a pending row hasn't been checked; absent on older APIs. */
  checks?: RowChecks | null;
  /** S3-3: how the row was calculated (a contracts §1 method key); null outside Scope 3 and on older APIs. */
  method?: string | null;
  /** S3-3: the row's data quality (contracts §3 `Dq`); read it with `readDq` (src/lib/scope3/dq.ts). */
  dq?: unknown;
  data_type?: "primary" | "secondary" | null;
  /** S3-3: the activity figure is an estimate (e.g. a distance from the route helper). */
  is_estimate?: boolean | null;
}

export type ReportFrequency = "yearly" | "monthly";


export interface ApprovedEmissionsReportPayload {
  siteIds ?: number[];
  categoryIds ?: number[];
  frequency: ReportFrequency;
  year: number;
  month ?: number;
}




export interface EmissionsSummary {
  total_emission: number;
  pending_count: number;
  /** Pending entries as the approvals list shows them (ESG-lite #82); absent on older APIs. */
  pending_review_count?: number;
  approved_count: number;
  rejected_count: number;
  /** With `batchId`: rows the smart import matched below 80 % or edited in the plan (XI5); absent on older APIs. */
  attention?: number;
  /** The same count under the name ESG-lite #127 first shipped; read through `attentionOf`. */
  attention_count?: number;
  /** S3-15: pending rows that pass every check (FERA twins folded); absent on older APIs. */
  ready?: number;
  /** S3-15: pending rows that don't (no checks yet counts here). */
  held?: number;
}

export interface PaginatedEmissions {
  data: EmissionData[];
  total: number;
  summary: EmissionsSummary;
}
export interface PeriodTotalParams {
  siteId: number;
  categoryId: number;
  emissionCategory: string;
  year: number;
  reportingPeriod: "monthly" | "yearly";
  month?: number;
  yearType?: "CY" | "FY";
  // "approved" (the default) is the reported basis — right for a period that is
  // finished. "entered" counts everything not rejected, the only basis with any
  // meaning for the period currently being entered.
  basis?: "approved" | "entered";
}
/** One category id, several (sent as `categoryIds=1,2`), or none. */
export type CategoryFilter = number | number[] | null | undefined;

/** Query params for a category filter; one id keeps the older `categoryId` form. */
export function categoryParams(c: CategoryFilter): { categoryId?: number; categoryIds?: string } {
  const ids = (Array.isArray(c) ? c : c != null ? [c] : []).filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length === 0) return {};
  return ids.length === 1 ? { categoryId: ids[0] } : { categoryIds: [...new Set(ids)].sort((a, b) => a - b).join(",") };
}

export const getEmissionsBySite = async (siteId: string | number) => {
  const response = await api.get("/user/emissions", {
    params: { siteId },
  });
  return response.data;
};

/** What the period is already filed as: monthly rows, or yearly data (of this or the other calendar). */
export interface PeriodModeConflict {
  conflicting_period: "monthly" | "yearly";
  /** Set when yearly data of the other calendar (CY vs FY) overlaps the year. */
  conflicting_year_type?: "CY" | "FY" | null;
}

/**
 * F-13/F-27: whether a period is already filed the other way (monthly vs yearly) on a site and
 * category: the save's own mode lock, asked before typing. `message` and `conflict` are null when
 * it is free; null overall from an API without the check.
 */
export const getPeriodMode = async (
  siteId: number,
  categoryId: number,
  period: { reporting_period: "monthly" | "yearly"; year_type?: "CY" | "FY" | null; date_of_reporting: string },
): Promise<{ message: string | null; conflict: PeriodModeConflict | null } | null> => {
  try {
    const response = await api.get(`/user/emissions/period-mode/site/${siteId}/category/${categoryId}`, { params: period });
    return { message: response.data?.message ?? null, conflict: response.data?.conflict ?? null };
  } catch (e) {
    if ((e as { response?: { status?: number } }).response?.status === 404) return null;
    throw e;
  }
};

export const getEmissionsPaginated = async (params: {
  siteId?: number;
  siteIds?: number[];
  categoryId?: CategoryFilter;
  scope?: string | null;
  year?: number | null;
  month?: number | null;
  status?: string | null;
  page: number;
  limit: number;
  // B6: server sort (id, date, total_emission, status, category, scope, site,
  // submitted_by, created_at, reviewed_at) and free-text search.
  sort?: string | null;
  order?: "asc" | "desc" | null;
  search?: string | null;
  /** Only this upload batch's rows (P07 "Review rows"). */
  batchId?: string | null;
  /** With `batchId`: only the rows that need attention (XI5 "Needs attention"). */
  attention?: boolean | null;
  /** S3-15, with `status=pending`: only rows whose checks are ready (true) or not (false). */
  ready?: boolean | null;
  /** S3-3: only rows calculated this way (a contracts §1 method key). */
  method?: string | null;
  /** S3-3: only rows whose overall data quality is at least this good (1 best). */
  dqMax?: 1 | 2 | 3 | null;
}): Promise<PaginatedEmissions> => {
  const query: Record<string, string | number> = {
    page: params.page,
    limit: params.limit,
  };
  // Prefer multi-site (siteIds); fall back to legacy single siteId.
  if (params.siteIds && params.siteIds.length > 0) {
    query.siteIds = params.siteIds.join(",");
  } else if (params.siteId != null) {
    query.siteId = params.siteId;
  }
  Object.assign(query, categoryParams(params.categoryId));
  if (params.scope) query.scope = params.scope;
  if (params.year != null) query.year = params.year;
  if (params.month != null) query.month = params.month;
  if (params.status) query.status = params.status;
  if (params.sort) query.sort = params.sort;
  if (params.sort && params.order) query.order = params.order;
  if (params.search?.trim()) query.search = params.search.trim();
  if (params.batchId) query.batchId = params.batchId;
  if (params.batchId && params.attention) query.attention = 1;
  if (params.ready != null) query.ready = params.ready ? 1 : 0;
  if (params.method) query.method = params.method;
  if (params.dqMax != null) query.dq_max = params.dqMax;

  const response = await api.get("/user/emissions", { params: query });
  return response.data;
};

export const getEmissionsBySiteAndCategory = async (
  siteId: string | number,
  categoryId: string | number,
  date?: string
) => {
  const params = date ? { date } : {};
  const response = await api.get(
    `/user/emissions/site/${siteId}/category/${categoryId}`,
    { params }
  );
  return response.data;
};

export const createEmission = async (
  data: {
    site_id: number;
    category_id: number;
    activity_data: Record<string, any>;
    extra_data?: Record<string, any>;
    total_emission?: number;
    unit?: string;
    date_of_reporting: string;
    activity_data_unit?: string;
    // Yearly data entry: 'monthly' (default) or 'yearly'; yearly rows carry
    // year_type 'CY' or 'FY' and are dated at the period end.
    reporting_period?: "monthly" | "yearly";
    year_type?: "CY" | "FY";
    /** S3-3: how the row was calculated; refused with METHOD_NOT_ALLOWED when the form doesn't offer it. */
    method?: string;
    /** S3-3: the figure is an estimate (the distance helper's estimate flag). */
    is_estimate?: boolean;
  },
  /** A duplicate (same site, category, month and activity) replaces the saved entry, or is saved beside it (F-06). */
  onDuplicate?: "replace" | "keep_both"
) => {
  const params = onDuplicate === "replace" ? { replace: "true" } : onDuplicate === "keep_both" ? { keep_both: "true" } : {};
  const response = await api.post("/user/emissions", data, { params });
  return response.data;
};

export const updateEmission = async (
  id: string | number,
  data: {
    activity_data?: Record<string, any>;
    extra_data?: Record<string, any>;
    total_emission?: number;
    unit?: string;
    date_of_reporting?: string;
    activity_data_unit?: string;
    reason?: string;
    /** The entry's updated_at when the form opened: the save is refused if it changed since. */
    expected_updated_at?: string;
  }
) => {
  const response = await api.put(`/user/emissions/${id}`, data);
  return response.data;
};

export const deleteEmission = async (id: string | number) => {
  const response = await api.delete(`/user/emissions/${id}`);
  return response.data;
};

// Approval-related functions

export const getPendingEmissions = async (params?: {
  siteId?: string | number;
  categoryId?: string | number;
}) => {
  const response = await api.get("/user/emissions/pending", { params });
  return response.data;
};

/** `keepalive` lets the request finish after the tab closes (sent with fetch instead of XHR). */
export const approveEmission = async (id: string | number, comment?: string, opts?: { keepalive?: boolean }) => {
  const config = opts?.keepalive ? { adapter: "fetch" as const, fetchOptions: { keepalive: true } } : undefined;
  const response = await api.put(`/user/emissions/${id}/approve`, { comment }, config);
  return response.data;
};

export const rejectEmission = async (id: string | number, comment: string) => {
  const response = await api.put(`/user/emissions/${id}/reject`, { comment });
  return response.data;
};

export const bulkApproveEmissions = async (ids: number[], comment?: string) => {
  const response = await api.put("/user/emissions/bulk-approve", { ids, comment });
  return response.data;
};

export interface BulkApproveReadyResult {
  message?: string;
  approved: number[];
  /** Rows not approved because their checks no longer pass. */
  skipped: { id: number; held: CheckId[] }[];
}

/** S3-15 "Approve all ready": the server approves only rows whose checks pass and returns the rest. */
export const bulkApproveReady = async (ids: number[], opts?: { keepalive?: boolean }): Promise<BulkApproveReadyResult> => {
  const config = opts?.keepalive ? { adapter: "fetch" as const, fetchOptions: { keepalive: true } } : undefined;
  const response = await api.put("/user/emissions/bulk-approve", { ids, only_ready: true }, config);
  const data = (response.data ?? {}) as Partial<BulkApproveReadyResult>;
  return { message: data.message, approved: Array.isArray(data.approved) ? data.approved : [], skipped: Array.isArray(data.skipped) ? data.skipped : [] };
};

export const bulkRejectEmissions = async (ids: number[], comment: string) => {
  const response = await api.put("/user/emissions/bulk-reject", { ids, comment });
  return response.data;
};

export const bulkDeleteEmissions = async (ids: number[]) => {
  const response = await api.delete("/user/emissions/bulk-delete", { data: { ids } });
  return response.data;
};

// Get the matched emission factor details for a given emission
export interface EmissionFactorDetails {
  emission_factor_id: number;
  emission_category_name: string;
  global_category_name?: string;
  /** Postgres numeric: the API sends it as text ("2.5600"). */
  factor_value: number | string;
  denominator_unit: string;
  source: string;
  year: number;
}

export const getEmissionFactorForEmission = async (emissionId: number): Promise<{
  emission_factor: EmissionFactorDetails | null;
  message?: string;
}> => {
  const response = await api.get(`/user/emissions/${emissionId}/factor`);
  return response.data;
};

// Approve all pending emissions from a specific upload batch
export const approveEmissionsByBatch = async (batchId: string, comment?: string) => {
  const response = await api.put(`/user/emissions/batch/${batchId}/approve`, { comment });
  return response.data;
};

// Reject all pending emissions from a specific upload batch
export const rejectEmissionsByBatch = async (batchId: string, comment?: string) => {
  const response = await api.put(`/user/emissions/batch/${batchId}/reject`, { comment });
  return response.data;
};

export const managerUpdateEmission = async (
  id: string | number,
  data: { activity_data?: any; date_of_reporting?: string; activity_data_unit?: string; reason?: string; expected_updated_at?: string }
) => {
  const response = await api.put(`/user/emissions/manager-edit/${id}`, data);
  return response.data;
};

// Delete all emissions from a specific upload batch
export const deleteEmissionsByBatch = async (batchId: string) => {
  const response = await api.delete(`/user/emissions/batch/${batchId}`);
  return response.data;
};

/** How a batch's rows came in (MCP import plan, 01-contracts §3): the Claude connector, the Bulk upload page, or the API. */
export type BatchChannel = "mcp" | "bulk_upload" | "api";

export interface EmissionUploadBatch {
  upload_batch_id: string;
  /** Absent on batches older than the import plans table (historical ones included); read as "bulk_upload". */
  channel?: BatchChannel | null;
  count: number;
  pending_count: number;
  approved_count: number;
  rejected_count: number;
  uploaded_at: string;
  site_id: number;
  site_name: string;
  category_id: number;
  category_name: string;
  uploaded_by?: string;
}

// Get all upload batches for emissions
export const getEmissionBatches = async (
  site?: number | number[] | null,
  categoryId?: CategoryFilter,
): Promise<EmissionUploadBatch[]> => {
  const params: Record<string, number | string> = {};
  if (Array.isArray(site)) {
    if (site.length > 0) params.siteIds = site.join(",");
  } else if (site != null) {
    params.siteId = site;
  }
  Object.assign(params, categoryParams(categoryId));
  const response = await api.get("/user/emissions/batches", { params });
  return response.data;
};

export const getApprovedEmissionsReport = async (
  payload :  ApprovedEmissionsReportPayload) => {
  const response = await api.post("/user/emissions/approved", payload);
  return response.data;
}

// Download emissions as Excel file
export const downloadEmissions = async (params: {
  siteId: number;
  categoryId?: number;
  date?: string;
  year?: number;
  month?: number;
}) => {
  const response = await api.get("/user/emissions/download", {
    params,
    responseType: "blob",
  });

  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", "emissions_export.xlsx");
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

// Export monthly emissions as Excel with status filter
export const exportMonthlyEmissions = async (params: {
  siteIds: number[];
  year: number;
  month: number;
  categoryId?: CategoryFilter;
  status?: string;
}) => {
  const query: Record<string, string | number> = {
    siteIds: params.siteIds.join(","),
    year: params.year,
    month: params.month,
  };
  Object.assign(query, categoryParams(params.categoryId));
  if (params.status) query.status = params.status;

  const response = await api.get("/user/emissions/export", {
    params: query,
    responseType: "blob",
  });

  // Extract filename from Content-Disposition header or use default
  const disposition = response.headers["content-disposition"];
  const match = disposition?.match(/filename="?([^"]+)"?/);
  const fileName = match?.[1] || `emissions_${params.year}_${params.month}.xlsx`;

  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
};

// B7: a whole calendar or financial year as one Excel file. For FY, `year`
// is the year the FY ends (FY 2024-25 → 2025), as the backend expects.
// `truncated` is true when the server cut the file at its row cap.
export const exportYearEmissions = async (params: {
  siteIds: number[];
  year: number;
  yearType: "CY" | "FY";
  categoryId?: CategoryFilter;
  status?: string;
}): Promise<{ truncated: boolean }> => {
  const query: Record<string, string | number> = {
    siteIds: params.siteIds.join(","),
    year: params.year,
    yearType: params.yearType,
  };
  Object.assign(query, categoryParams(params.categoryId));
  if (params.status) query.status = params.status;

  const response = await api.get("/user/emissions/export", { params: query, responseType: "blob" });
  const disposition = response.headers["content-disposition"];
  const match = disposition?.match(/filename="?([^"]+)"?/);
  const fileName = match?.[1] || `emissions_${params.yearType}_${params.year}.xlsx`;
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", fileName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
  return { truncated: response.headers["x-export-truncated"] === "true" };
};

export const getPeriodTotal = async (
  params: PeriodTotalParams,
): Promise<number> => {
  const query: Record<string, string | number> = {
    site_id: params.siteId,
    category_id: params.categoryId,
    emission_category: params.emissionCategory,
    year: params.year,
    reporting_period: params.reportingPeriod,
  };
  if (params.month != null) query.month = params.month;
  if (params.yearType) query.year_type = params.yearType;
  if (params.basis) query.basis = params.basis;

  const response = await api.get("/user/emissions/period-total", {
    params: query,
  });
  return response.data.total_emission;
};