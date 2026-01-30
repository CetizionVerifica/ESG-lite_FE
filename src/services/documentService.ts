import api from "../api/axios";

export type DocumentType = "invoice" | "receipt" | "report" | "certificate" | "other";

export interface EmissionDocument {
  document_id: number;
  file_name: string;
  original_name: string;
  cloudinary_public_id: string;
  cloudinary_url: string;
  secure_url: string;
  file_type: string;
  file_size: number;
  document_type: DocumentType;
  description?: string;
  emission?: {
    pk_id: number;
  };
  uploaded_by?: {
    user_id: number;
    name: string;
  };
  created_at: string;
  updated_at: string;
}

export const getDocuments = async (params?: {
  emission_id?: number;
  document_type?: DocumentType;
}) => {
  const response = await api.get<EmissionDocument[]>("/user/documents", { params });
  return response.data;
};

export const getDocumentById = async (id: number) => {
  const response = await api.get<EmissionDocument>(`/user/documents/${id}`);
  return response.data;
};

export const getDocumentsByEmission = async (emissionId: number) => {
  const response = await api.get<EmissionDocument[]>(`/user/documents/emission/${emissionId}`);
  return response.data;
};

export const uploadDocument = async (data: {
  file: File;
  emission_id?: number;
  document_type?: DocumentType;
  description?: string;
}) => {
  const formData = new FormData();
  formData.append("file", data.file);
  if (data.emission_id) formData.append("emission_id", data.emission_id.toString());
  if (data.document_type) formData.append("document_type", data.document_type);
  if (data.description) formData.append("description", data.description);

  const response = await api.post<{ message: string; document: EmissionDocument }>(
    "/user/documents",
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }
  );
  return response.data;
};

export const uploadMultipleDocuments = async (data: {
  files: File[];
  emission_id?: number;
  document_type?: DocumentType;
  description?: string;
}) => {
  const formData = new FormData();
  data.files.forEach((file) => formData.append("files", file));
  if (data.emission_id) formData.append("emission_id", data.emission_id.toString());
  if (data.document_type) formData.append("document_type", data.document_type);
  if (data.description) formData.append("description", data.description);

  const response = await api.post<{ message: string; documents: EmissionDocument[] }>(
    "/user/documents/multiple",
    formData,
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    }
  );
  return response.data;
};

export const updateDocument = async (
  id: number,
  data: {
    document_type?: DocumentType;
    description?: string;
    emission_id?: number | null;
  }
) => {
  const response = await api.put<{ message: string; document: EmissionDocument }>(
    `/user/documents/${id}`,
    data
  );
  return response.data;
};

export const deleteDocument = async (id: number) => {
  const response = await api.delete<{ message: string }>(`/user/documents/${id}`);
  return response.data;
};

export const bulkDeleteDocuments = async (ids: number[]) => {
  const response = await api.delete<{ message: string; deleted: number }>(
    "/user/documents/bulk-delete",
    { data: { ids } }
  );
  return response.data;
};

// Helper to format file size
export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

// Helper to get file icon based on type
export const getFileIcon = (fileType: string): string => {
  if (fileType.startsWith("image/")) return "image";
  if (fileType === "application/pdf") return "pdf";
  if (fileType.includes("spreadsheet") || fileType.includes("excel")) return "excel";
  if (fileType.includes("document") || fileType.includes("word")) return "word";
  return "file";
};
