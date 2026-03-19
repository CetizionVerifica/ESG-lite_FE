import api from "../api/axios";

export type EmissionStatus = "pending" | "approved" | "rejected";

export interface EmissionData {
  pk_id: number;
  activity_data: Record<string, any>;
  extra_data?: Record<string, any>;
  total_emission: number;
  unit: string;
  date_of_reporting: string;
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

export const getEmissionsBySite = async (siteId: string | number) => {
  const response = await api.get("/user/emissions", {
    params: { siteId },
  });
  return response.data;
};

export const getEmissionsPaginated = async (params: {
  siteId: number;
  categoryId?: number | null;
  scope?: string | null;
  year?: number | null;
  month?: number | null;
  status?: string | null;
  page: number;
  limit: number;
}): Promise<PaginatedEmissions> => {
  const query: Record<string, string | number> = {
    siteId: params.siteId,
    page: params.page,
    limit: params.limit,
  };
  if (params.categoryId != null) query.categoryId = params.categoryId;
  if (params.scope) query.scope = params.scope;
  if (params.year != null) query.year = params.year;
  if (params.month != null) query.month = params.month;
  if (params.status) query.status = params.status;

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

export const createEmission = async (data: {
  site_id: number;
  category_id: number;
  activity_data: Record<string, any>;
  extra_data?: Record<string, any>;
  total_emission?: number;
  unit?: string;
  date_of_reporting: string;
  activity_data_unit?: string;
}) => {
  const response = await api.post("/user/emissions", data);
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

export const approveEmission = async (id: string | number, comment?: string) => {
  const response = await api.put(`/user/emissions/${id}/approve`, { comment });
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
  data: { activity_data?: any; date_of_reporting?: string }
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
  siteId?: number | null,
  categoryId?: number | null,
): Promise<EmissionUploadBatch[]> => {
  const params: Record<string, number> = {};
  if (siteId != null) params.siteId = siteId;
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