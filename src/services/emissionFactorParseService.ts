import ocrApi from "../api/ocrAxios";

export interface ParsedEmissionFactor {
  year: number;
  factor_value: number;
  denominator_unit?: string;
  source?: string;
  emission_category_name?: string;
  parent_category?: string;
}

export interface CategorySuggestion {
  parent_category: string;
  suggested_category_id: number | null;
  suggested_category_name: string | null;
  confidence: "high" | "medium" | "low";
}

export interface ColumnHeader {
  column_index: number;
  header_name: string;
  sample_values: string[];
}

export interface SchemaDetected {
  layout_type: string;
  descriptor_columns: { column_index: number; header_name: string }[];
  parent_category_column?: { column_index: number; header_name: string } | null;
  include_parent_in_name: boolean;
  source_column?: { column_index: number; header_name: string } | null;
  unit_column?: { column_index: number; header_name: string } | null;
  data_start_row: number;
  years: {
    year: number;
    value_column?: number | null;
    sub_columns?: { name: string; column_index: number }[] | null;
    primary_sub_column?: string | null;
    disposal_columns?: { name: string; column_index: number }[] | null;
  }[];
  descriptor_join_separator: string;
  notes?: string;
}

export interface ParseExcelResponse {
  filename: string;
  factors: ParsedEmissionFactor[];
  schema_detected: SchemaDetected;
  warnings: string[];
  total_records: number;
  available_years: number[];
  parent_categories: string[];
  category_suggestions: CategorySuggestion[];
  upload_id?: number;
  cloudinary_url?: string;
  sheet_names: string[];
  selected_sheet?: string;
  available_columns: ColumnHeader[];
}

export const parseEmissionFactorExcel = async (
  file: File,
  dbCategories?: { id: number; name: string }[],
  uploadedBy?: number,
  sheetName?: string
): Promise<ParseExcelResponse> => {
  const formData = new FormData();
  formData.append("file", file);

  if (dbCategories && dbCategories.length > 0) {
    formData.append("db_categories", JSON.stringify(dbCategories));
  }
  if (uploadedBy) {
    formData.append("uploaded_by", String(uploadedBy));
  }
  if (sheetName) {
    formData.append("sheet_name", sheetName);
  }

  const response = await ocrApi.post<ParseExcelResponse>(
    "/v1/emission-factors/parse-excel",
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
    }
  );
  return response.data;
};

export const reAnalyzeEmissionFactors = async (
  uploadId: number,
  options: {
    sheet_name?: string;
    schema_override?: Record<string, unknown>;
    db_categories?: { id: number; name: string }[];
  }
): Promise<ParseExcelResponse> => {
  const response = await ocrApi.post<ParseExcelResponse>(
    "/v1/emission-factors/re-analyze",
    {
      upload_id: uploadId,
      ...options,
    }
  );
  return response.data;
};

export const updateUploadResults = async (
  uploadId: number,
  data: {
    records_created: number;
    records_skipped: number;
    status?: string;
    site_id?: number;
    category_ids?: number[];
  }
): Promise<void> => {
  await ocrApi.patch(`/v1/emission-factors/uploads/${uploadId}`, data);
};

export const getEmissionFactorUploads = async (
  uploadedBy?: number
): Promise<any[]> => {
  const params = uploadedBy ? { uploaded_by: uploadedBy } : {};
  const response = await ocrApi.get("/v1/emission-factors/uploads", { params });
  return response.data;
};

export const deleteEmissionFactorUpload = async (
  uploadId: number
): Promise<void> => {
  await ocrApi.delete(`/v1/emission-factors/uploads/${uploadId}`);
};

export const bulkDeleteEmissionFactorUploads = async (
  ids: number[]
): Promise<{ deleted: number }> => {
  const response = await ocrApi.delete("/v1/emission-factors/uploads/bulk", {
    data: { ids },
  });
  return response.data;
};
