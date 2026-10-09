import api from "../api/axios";

export type EmissionStatus = "pending" | "approved" | "rejected";

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
  parent_category_name?: string | null;
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
  approved_count: number;
  rejected_count: number;
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
export const getEmissionsBySite = async (siteId: string | number) => {
  const response = await api.get("/user/emissions", {
    params: { siteId },
  });
  return response.data;
};

export const getEmissionsPaginated = async (params: {
  siteId?: number;
  siteIds?: number[];
  categoryId?: number | null;
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
  if (params.categoryId != null) query.categoryId = params.categoryId;
  if (params.scope) query.scope = params.scope;
  if (params.year != null) query.year = params.year;
  if (params.month != null) query.month = params.month;
  if (params.status) query.status = params.status;
  if (params.sort) query.sort = params.sort;
  if (params.sort && params.order) query.order = params.order;
  if (params.search?.trim()) query.search = params.search.trim();

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
  },
  replace?: boolean
) => {
  const params = replace ? { replace: "true" } : {};
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
  factor_value: number;
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
  data: { activity_data?: any; date_of_reporting?: string; activity_data_unit?: string; reason?: string }
) => {
  const response = await api.put(`/user/emissions/manager-edit/${id}`, data);
  return response.data;
};

// Delete all emissions from a specific upload batch
export const deleteEmissionsByBatch = async (batchId: string) => {
  const response = await api.delete(`/user/emissions/batch/${batchId}`);
  return response.data;
};

export interface EmissionUploadBatch {
  upload_batch_id: string;
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
  categoryId?: number | null,
): Promise<EmissionUploadBatch[]> => {
  const params: Record<string, number | string> = {};
  if (Array.isArray(site)) {
    if (site.length > 0) params.siteIds = site.join(",");
  } else if (site != null) {
    params.siteId = site;
  }
  if (categoryId != null) params.categoryId = categoryId;
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
  categoryId?: number;
  status?: string;
}) => {
  const query: Record<string, string | number> = {
    siteIds: params.siteIds.join(","),
    year: params.year,
    month: params.month,
  };
  if (params.categoryId != null) query.categoryId = params.categoryId;
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