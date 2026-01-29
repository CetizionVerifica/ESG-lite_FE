import api from "../api/axios";

export const getSites = async () => {
  const response = await api.get("/admin/sites");
  return response.data;
};

export const getSiteById = async (id: string | number) => {
  const response = await api.get(`/user/sites/${id}`);
  return response.data;
};

export const createSite = async (data: {
  name: string;
  address: string;
  contact_person: string;
  company_id: number;
  country_id: number;
  category_ids?: (string | number)[];
}) => {
  const response = await api.post("/admin/sites", data);
  return response.data;
};

export const updateSite = async (
  id: string | number,
  data: {
    name?: string;
    address?: string;
    contact_person?: string;
    company_id?: number;
    country_id?: number;
    category_ids?: (string | number)[];
  }
) => {
  const response = await api.put(`/admin/sites/${id}`, data);
  return response.data;
};

export const deleteSite = async (id: string | number) => {
  const response = await api.delete(`/admin/sites/${id}`);
  return response.data;
};