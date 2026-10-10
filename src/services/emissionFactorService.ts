import api from "../api/axios";

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export const getEmissionFactors = async (params?: {
  page?: number;
  limit?: number;
  site_id?: number | null;
  category_id?: number | null;
  company_id?: number | null;
  year?: number | null;
  search?: string;
}): Promise<PaginatedResponse<any>> => {
  const query: Record<string, string | number> = {};
  if (params?.page) query.page = params.page;
  if (params?.limit) query.limit = params.limit;
  if (params?.site_id) query.site_id = params.site_id;
  if (params?.category_id) query.category_id = params.category_id;
  if (params?.company_id) query.company_id = params.company_id;
  if (params?.year) query.year = params.year;
  if (params?.search) query.search = params.search;
  const response = await api.get("/admin/emission-factors", { params: query });
  return response.data;
};

export const getEmissionFactorById = async (id: string | number) => {
  const response = await api.get(`/admin/emission-factors/${id}`);
  return response.data;
};

export const createEmissionFactor = async (data: {
  site_id: number;
  category_id: number;
  year: number;
  factor_value: number;
  denominator_unit?: string;
  source?: string;
  emission_category_name?: string;
}) => {
  const response = await api.post("/admin/emission-factors", data);
  return response.data;
};

export const updateEmissionFactor = async (
  id: string | number,
  data: {
    site_id?: number;
    category_id?: number;
    year?: number;
    factor_value?: number;
    denominator_unit?: string;
    source?: string;
    emission_category_name?: string;
  }
) => {
  const response = await api.put(`/admin/emission-factors/${id}`, data);
  return response.data;
};

export const deleteEmissionFactor = async (id: string | number) => {
  const response = await api.delete(`/admin/emission-factors/${id}`);
  return response.data;
};

export const getEmissionFactorsBySite = async (siteId: string | number) => {
  const response = await api.get(`/admin/emission-factors/site/${siteId}`);
  return response.data;
};

export const getEmissionFactorsByCategory = async (categoryId: string | number) => {
  const response = await api.get(`/admin/emission-factors/category/${categoryId}`);
  return response.data;
};

// For user access (non-admin)
export const getUserEmissionFactorsBySiteAndCategory = async (
  siteId: string | number,
  categoryId: string | number,
  year?: number
) => {
  const params = year ? { year } : {};
  const response = await api.get(`/user/emission-factors/site/${siteId}/category/${categoryId}`, { params });
  return response.data;
};

// Get distinct emission_category_name values for a category (optionally filtered by site)
export const getEmissionCategoryNames = async (
  categoryId: number,
  siteId?: number
): Promise<string[]> => {
  const params: Record<string, number> = { category_id: categoryId };
  if (siteId) params.site_id = siteId;
  const response = await api.get("/admin/emission-factors/category-names", { params });
  return response.data;
};

// Bulk create emission factors (chunked to avoid 413 payload limits)
export const bulkCreateEmissionFactors = async (factors: {
  site_id: number;
  category_id: number;
  year: number;
  factor_value: number;
  denominator_unit?: string;
  source?: string;
  emission_category_name?: string;
  global_category_name?: string;
}[]) => {
  const CHUNK_SIZE = 50;
  // Generate a single batch ID for the entire upload so all chunks share it
  const upload_batch_id = crypto.randomUUID();

  if (factors.length <= CHUNK_SIZE) {
    const response = await api.post("/admin/emission-factors/bulk", { factors, upload_batch_id });
    return response.data;
  }

  let totalCreated = 0;
  let totalSkipped = 0;
  const allErrors: string[] = [];

  for (let i = 0; i < factors.length; i += CHUNK_SIZE) {
    const chunk = factors.slice(i, i + CHUNK_SIZE);
    const response = await api.post("/admin/emission-factors/bulk", { factors: chunk, upload_batch_id });
    const data = response.data;
    totalCreated += data.created ?? 0;
    totalSkipped += data.skipped ?? 0;
    if (data.errors) allErrors.push(...data.errors);
  }

  return { created: totalCreated, skipped: totalSkipped, errors: allErrors.length ? allErrors : undefined, upload_batch_id };
};

// Bulk delete emission factors
export const bulkDeleteEmissionFactors = async (ids: number[]) => {
  const response = await api.delete("/admin/emission-factors/bulk", { data: { ids } });
  return response.data;
};

// Delete all emission factors from a specific upload batch
export const deleteEmissionFactorsByBatch = async (batchId: string) => {
  const response = await api.delete(`/admin/emission-factors/batch/${batchId}`);
  return response.data;
};

export interface UploadBatch {
  upload_batch_id: string;
  count: number;
  uploaded_at: string;
  site_id: number;
  site_name: string;
  category_id: number;
  category_name: string;
}

// Get all upload batches for emission factors
export const getEmissionFactorBatches = async (
  siteId?: number | null,
  categoryId?: number | null,
  companyId?: number | null,
): Promise<UploadBatch[]> => {
  const params: Record<string, number> = {};
  if (companyId) params.company_id = companyId;
  if (siteId) params.site_id = siteId;
  if (categoryId) params.category_id = categoryId;
  const response = await api.get("/admin/emission-factors/batches", { params });
  return response.data;
};

