import api from "../api/axios";

export const getCompanies = async () => {
  const response = await api.get(`/admin/companies`);
  return response.data;
};

export const getUserCompanies = async () => {
  const response = await api.get(`/user/companies`);
  return response.data;
};

export const createCompany = async (data: {
  name: string;
  [key: string]: any;
}) => {
  const response = await api.post(`/admin/companies`, data);
  return response.data;
};

export const updateCompany = async (
  id: string | number,
  data: { name?: string;[key: string]: any }
) => {
  const response = await api.put(`/admin/companies/${id}`, data);
  return response.data;
};

export const deleteCompany = async (id: string | number) => {
  const response = await api.delete(`/admin/companies/${id}`);
  return response.data;
};

export const onboardCompany = async (data: any) => {
  const response = await api.post(`/admin/onboarding/company`, data);
  return response.data;
};

export const getCompanyNameBySites = async (siteIds: number[]) => {
  const response = await api.post(`/user/companies/by-sites`, { siteIds });
  console.log("response", response)
  return response.data;
};

