import api from "../api/axios";

// Company Admin portal — manage Users and Managers within the admin's own company.

export interface CompanyUserPayload {
  name?: string;
  last_name?: string;
  phone_number?: string;
  email: string;
  password?: string;
  role: string;
  site_id?: number | null;
  site_ids?: number[];
}

export const getCompanyUsers = async () => {
  const response = await api.get("/company-admin/users");
  return response.data;
};

export const getCompanySites = async () => {
  const response = await api.get("/company-admin/sites");
  return response.data;
};

export const createCompanyUser = async (data: CompanyUserPayload) => {
  const response = await api.post("/company-admin/users", data);
  return response.data;
};

export const updateCompanyUser = async (
  id: string | number,
  data: Partial<CompanyUserPayload>,
) => {
  const response = await api.patch(`/company-admin/users/${id}`, data);
  return response.data;
};

export const deleteCompanyUser = async (id: string | number) => {
  const response = await api.delete(`/company-admin/users/${id}`);
  return response.data;
};
