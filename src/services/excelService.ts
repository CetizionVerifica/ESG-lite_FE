
const PYTHON_API_URL = import.meta.env.VITE_OCR_API_URL;

export interface UploadHeadersResponse {
  document_id: number;
  headers: string[];
}

export interface UniqueCategoriesResponse {
  unique_categories: string[];
  total_rows: number;
}

export interface PreviewRowsResponse {
  rows: Record<string, string>[];
  total_rows: number;
  page: number;
  page_size: number;
}

export interface ImportResponse {
  inserted: number;
  skipped: number;
  total_rows: number;
}

export async function uploadExcelGetHeaders(file: File): Promise<UploadHeadersResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${PYTHON_API_URL}/v1/excel/upload`, {
    method: "POST",
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
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document_id: documentId, mappings }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.detail || "Failed to fetch unique categories.");
  }

  return response.json();
}


export async function fetchPreviewRows(
  documentId: number,
  mappings: Record<string, string>,
  selectedCategories: string[],
  siteId: number,
  categoryId: number,
  dateOfReporting: string,
  page = 1,
  pageSize = 100
): Promise<PreviewRowsResponse> {
  const response = await fetch(`${PYTHON_API_URL}/v1/excel/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      document_id: documentId,
      mappings,
      selected_categories: selectedCategories,
      page,
      page_size: pageSize,

      // ✅ NEW
      site_id: siteId,
      category_id: categoryId,
      date_of_reporting: dateOfReporting,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.detail || "Failed to fetch preview rows.");
  }

  return response.json();
}

export async function importAllRows(
  documentId: number,
  mappings: Record<string, string>,
  selectedCategories: string[],
  siteId: number,
  categoryId: number,
  dateOfReporting: string
): Promise<ImportResponse> {
  const response = await fetch(`${PYTHON_API_URL}/v1/excel/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      document_id: documentId,
      mappings,
      selected_categories: selectedCategories,
      site_id: siteId,
      category_id: categoryId,
      date_of_reporting: dateOfReporting,
    }),
  });



  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.detail || "Import failed.");
  }

  return response.json();
}