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
  data: { name?: string;[key: string]: any } | FormData
) => {
  const isFormData = typeof FormData !== "undefined" && data instanceof FormData;
  const response = await api.put(
    `/admin/companies/${id}`,
    data,
    isFormData
      ? { headers: { "Content-Type": "multipart/form-data" } }
      : undefined
  );
  return response.data;
};

export const deleteCompany = async (id: string | number) => {
  const response = await api.delete(`/admin/companies/${id}`);
  return response.data;
};

export const onboardCompany = async (data: any) => {
  const isFormData = typeof FormData !== "undefined" && data instanceof FormData;
  const response = await api.post(
    `/admin/onboarding/company`,
    data,
    isFormData
      ? { headers: { "Content-Type": "multipart/form-data" } }
      : undefined
  );
  return response.data;
};

export type CompanyBySitesResponse = {
  companyName: string;
  /** Backend-owned fiscal-year start month, 1-12. */
  fiscalYearStartMonth: number;
  /** Human-readable form of the same rule, e.g. "Apr 1 → Mar 31". */
  fiscalYearRule: string;
};

export const getCompanyNameBySites = async (siteIds: number[]) => {
  const response = await api.post<CompanyBySitesResponse>(`/user/companies/by-sites`, { siteIds });
  return response.data;
};

