import api from "../api/axios";

export const getColumnConfigs = async () => {
  const response = await api.get("/admin/column-configs");
  return response.data;
};

export const getColumnConfigById = async (id: string | number) => {
  const response = await api.get(`/admin/column-configs/${id}`);
  return response.data;
};

export const getColumnConfigsByCategory = async (categoryId: string | number) => {
  const response = await api.get(`/admin/column-configs/category/${categoryId}`);
  return response.data;
};

export const getColumnConfigsBySite = async (siteId: string | number) => {
  const response = await api.get(`/admin/column-configs/site/${siteId}`);
  return response.data;
};

export const getColumnConfigsBySiteAndCategory = async (
  siteId: string | number,
  categoryId: string | number
) => {
  const response = await api.get(`/admin/column-configs/site/${siteId}/category/${categoryId}`);
  return response.data;
};

// User-accessible endpoint (doesn't require superadmin)
export const getUserColumnConfigsBySiteAndCategory = async (
  siteId: string | number,
  categoryId: string | number
) => {
  const response = await api.get(`/user/column-configs/site/${siteId}/category/${categoryId}`);
  return response.data;
};

export const createColumnConfig = async (data: {
  config_name: string;
  site_id: number;
  category_id: number;
  column_ids?: number[];
}) => {
  const response = await api.post("/admin/column-configs", data);
  return response.data;
};

export const updateColumnConfig = async (
  id: string | number,
  data: {
    config_name?: string;
    site_id?: number;
    category_id?: number;
    column_ids?: number[];
  }
) => {
  const response = await api.put(`/admin/column-configs/${id}`, data);
  return response.data;
};

export const deleteColumnConfig = async (id: string | number) => {
  const response = await api.delete(`/admin/column-configs/${id}`);
  return response.data;
};

export const addColumnsToConfig = async (
  id: string | number,
  column_ids: number[]
) => {
  const response = await api.post(`/admin/column-configs/${id}/columns`, { column_ids });
  return response.data;
};

export const removeColumnsFromConfig = async (
  id: string | number,
  column_ids: number[]
) => {
  const response = await api.delete(`/admin/column-configs/${id}/columns`, {
    data: { column_ids },
  });
  return response.data;
};
