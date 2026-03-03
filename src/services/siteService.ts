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

export const getSiteMasterData = async (
  id: string | number,
  categoryId?: number,
  subcategoryIds?: number[]
) => {
  let url = `/admin/sites/${id}/master-data`;
  const params = new URLSearchParams();
  if (categoryId) params.append("categoryId", categoryId.toString());
  if (subcategoryIds && subcategoryIds.length > 0) {
    subcategoryIds.forEach((sid) => params.append("subcategoryIds", sid.toString()));
  }
  if (params.toString()) url += `?${params.toString()}`;

  const response = await api.get(url);
  return response.data;
};

export const updateSiteMasterData = async (
  id: string | number,
  items: { master_data_id: number; is_active: boolean; unit?: string }[]
) => {
  const response = await api.put(`/admin/sites/${id}/master-data`, { items });
  return response.data;
};

export const initializeSiteMasterData = async (id: string | number) => {
  const response = await api.post(`/admin/sites/${id}/master-data/init`);
  return response.data;
};