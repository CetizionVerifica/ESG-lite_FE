import api from "../api/axios";

export const getEmissionFactors = async () => {
  const response = await api.get("/admin/emission-factors");
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

  if (factors.length <= CHUNK_SIZE) {
    const response = await api.post("/admin/emission-factors/bulk", { factors });
    return response.data;
  }

  let totalCreated = 0;
  let totalSkipped = 0;
  const allErrors: string[] = [];

  for (let i = 0; i < factors.length; i += CHUNK_SIZE) {
    const chunk = factors.slice(i, i + CHUNK_SIZE);
    const response = await api.post("/admin/emission-factors/bulk", { factors: chunk });
    const data = response.data;
    totalCreated += data.created ?? 0;
    totalSkipped += data.skipped ?? 0;
    if (data.errors) allErrors.push(...data.errors);
  }

  return { created: totalCreated, skipped: totalSkipped, errors: allErrors.length ? allErrors : undefined };
};

// Bulk delete emission factors
export const bulkDeleteEmissionFactors = async (ids: number[]) => {
  const response = await api.delete("/admin/emission-factors/bulk", { data: { ids } });
  return response.data;
};

