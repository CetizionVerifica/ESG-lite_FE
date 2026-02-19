import api from "../api/axios";

export type EmissionStatus = "pending" | "approved" | "rejected";

export interface EmissionData {
  pk_id: number;
  activity_data: Record<string, any>;
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




export const getEmissionsBySite = async (siteId: string | number) => {
  const response = await api.get("/user/emissions", {
    params: { siteId },
  });
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

export const getApprovedEmissionsReport = async (
  payload :  ApprovedEmissionsReportPayload) => {
  const response = await api.post("/user/emissions/approved", payload);
  return response.data;
}