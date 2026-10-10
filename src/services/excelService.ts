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

export interface PreviewRowsResponse {
  rows: Record<string, string>[];
  total_rows: number;
  page: number;
  page_size: number;
}

export interface ImportResponse {
  /** Rows saved, not counting FERA twins (newer AI service). */
  inserted: number;
  skipped: number;
  total_rows: number;
  upload_batch_id?: string;
  /** Newer AI service only: why each row was skipped, rows outside the chosen categories, FERA twins saved. */
  skipped_rows?: { row: number; reason: string }[];
  not_selected?: number;
  fera_inserted?: number;
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
    headers: { "Content-Type": "application/json", ...ocrAuthHeaders() },
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
  dateOfReporting: string,
  userId?: number
): Promise<ImportResponse> {
  const response = await fetch(`${PYTHON_API_URL}/v1/excel/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...ocrAuthHeaders() },
    body: JSON.stringify({
      document_id: documentId,
      mappings,
      selected_categories: selectedCategories,
      site_id: siteId,
      category_id: categoryId,
      date_of_reporting: dateOfReporting,
      ...(userId != null && { user_id: userId }),
    }),
  });



  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const detail = typeof error?.detail === "string" ? error.detail : null;
    if (response.status === 409) throw new Error(detail || ALREADY_IMPORTED_MESSAGE);
    throw new Error(detail || "Import failed.");
  }

  return response.json();
}