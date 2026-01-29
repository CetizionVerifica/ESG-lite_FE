import api from "../api/axios";

export const getCompanies = async () => {
  const response = await api.get(`/admin/companies`);
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
  data: { name?: string; [key: string]: any }
) => {
  const response = await api.put(`/admin/companies/${id}`, data);
  return response.data;
};

export const deleteCompany = async (id: string | number) => {
  const response = await api.delete(`/admin/companies/${id}`);
  return response.data;
};