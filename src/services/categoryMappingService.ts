import api from "../api/axios";
import ocrApi from "../api/ocrAxios";

// --- Types ---

export interface ParsedMappingRow {
  company_category_name: string;
  global_category_name: string;
  factor_value?: number | null;
  unit?: string | null;
}

export interface ParseMappingExcelResponse {
  filename: string;
  mappings: ParsedMappingRow[];
  warnings: string[];
  total_records: number;
}

export interface CategoryMapping {
  id: number;
  company_id: number;
  company_name: string;
  site_id: number | null;
  category_id: number;
  company_category_name: string;
  global_category_name: string;
  emission_factor_id: number | null;
  created_by: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateMappingPayload {
  company_id: number;
  company_name: string;
  site_id?: number | null;
  category_id: number;
  company_category_name: string;
  global_category_name: string;
  created_by?: number | null;
}

export interface BulkCreateResult {
  message: string;
  created: number;
  skipped: number;
  errors: string[];
}

// --- Python: Parse Excel ---

export const parseMappingExcel = async (
  file: File
): Promise<ParseMappingExcelResponse> => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await ocrApi.post<ParseMappingExcelResponse>(
    "/v1/category-mappings/parse-excel",
    formData,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
  return response.data;
};

// --- Node.js: CRUD ---

export const getMappings = async (
  companyId?: number,
  categoryId?: number
): Promise<CategoryMapping[]> => {
  const params: Record<string, string> = {};
  if (companyId) params.company_id = String(companyId);
  if (categoryId) params.category_id = String(categoryId);

  const response = await api.get("/admin/category-mappings", { params });
  return response.data;
};

export const getMappingsByCompany = async (
  companyId: number,
  siteId?: number,
  categoryId?: number
): Promise<CategoryMapping[]> => {
  const params: Record<string, string> = {};
  if (siteId) params.site_id = String(siteId);
  if (categoryId) params.category_id = String(categoryId);

  const response = await api.get(
    `/user/category-mappings/company/${companyId}`,
    { params }
  );
  return response.data;
};

export const createMapping = async (
  data: CreateMappingPayload
): Promise<{ message: string; mapping: CategoryMapping }> => {
  const response = await api.post("/admin/category-mappings", data);
  return response.data;
};

export const updateMapping = async (
  id: number,
  data: Partial<Pick<CategoryMapping, "company_category_name" | "global_category_name" | "site_id" | "emission_factor_id">>
): Promise<{ message: string; mapping: CategoryMapping }> => {
  const response = await api.put(`/admin/category-mappings/${id}`, data);
  return response.data;
};

export const deleteMapping = async (id: number): Promise<void> => {
  await api.delete(`/admin/category-mappings/${id}`);
};

export const bulkCreateMappings = async (
  mappings: CreateMappingPayload[]
): Promise<BulkCreateResult> => {
  const response = await api.post("/admin/category-mappings/bulk", {
    mappings,
  });
  return response.data;
};

export const bulkDeleteMappings = async (
  ids: number[]
): Promise<{ deleted: number }> => {
  const response = await api.delete("/admin/category-mappings/bulk", {
    data: { ids },
  });
  return response.data;
};

// --- Resolution (for user data entry) ---

export const resolveCompanyCategory = async (
  globalCategoryName: string,
  companyId: number,
  categoryId: number,
  siteId?: number
): Promise<string | null> => {
  const params: Record<string, string> = {
    global_category_name: globalCategoryName,
    company_id: String(companyId),
    category_id: String(categoryId),
  };
  if (siteId) params.site_id = String(siteId);

  const response = await api.get("/admin/category-mappings/resolve", {
    params,
  });
  return response.data.company_category_name ?? null;
};

export const bulkResolveCompanyCategories = async (
  globalCategoryNames: string[],
  companyId: number,
  categoryId: number,
  siteId?: number
): Promise<Record<string, string | null>> => {
  const response = await api.post("/admin/category-mappings/resolve-bulk", {
    global_category_names: globalCategoryNames,
    company_id: companyId,
    category_id: categoryId,
    site_id: siteId,
  });
  return response.data;
};
