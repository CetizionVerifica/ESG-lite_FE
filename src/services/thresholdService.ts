import api from "../api/axios";

export interface EmissionThreshold {
  threshold_id: number;
  threshold_percentage: number;
  created_at: string;
  updated_at: string;
  company: {
    company_id: number;
    name: string;
  };
}

export const getThresholds = async (): Promise<EmissionThreshold[]> => {
  const response = await api.get("/admin/thresholds");
  return response.data;
};

export const createThreshold = async (data: {
  company_id: number;
  threshold_percentage: number;
}): Promise<EmissionThreshold> => {
  const response = await api.post("/admin/thresholds", data);
  return response.data;
};

export const updateThreshold = async (
  id: number,
  data: { threshold_percentage: number }
): Promise<EmissionThreshold> => {
  const response = await api.put(`/admin/thresholds/${id}`, data);
  return response.data;
};

export const deleteThreshold = async (id: number): Promise<{ message: string }> => {
  const response = await api.delete(`/admin/thresholds/${id}`);
  return response.data;
};

export const getThresholdByCompany = async (companyId: number): Promise<number> => {
  const response = await api.get(`/user/thresholds/company/${companyId}`);
  return response.data.threshold_percentage;
};