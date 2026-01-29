import api from "../api/axios";

export interface UnitData {
  unit_id: number;
  unit_name: string;
  description: string | null;
  site: {
    site_id: number;
    name: string;
  };
  category: {
    category_id: number;
    category_name: string;
  };
}

// Admin endpoints
export const getUnits = async () => {
  const response = await api.get("/admin/units");
  return response.data;
};

export const getUnitById = async (id: string | number) => {
  const response = await api.get(`/admin/units/${id}`);
  return response.data;
};

export const getUnitsBySiteAndCategory = async (
  siteId: string | number,
  categoryId: string | number
) => {
  const response = await api.get(`/admin/units/site/${siteId}/category/${categoryId}`);
  return response.data;
};

export const createUnit = async (data: {
  unit_name: string;
  description?: string;
  site_id: number;
  category_id: number;
}) => {
  const response = await api.post("/admin/units", data);
  return response.data;
};

export const updateUnit = async (
  id: string | number,
  data: {
    unit_name?: string;
    description?: string;
    site_id?: number;
    category_id?: number;
  }
) => {
  const response = await api.put(`/admin/units/${id}`, data);
  return response.data;
};

export const deleteUnit = async (id: string | number) => {
  const response = await api.delete(`/admin/units/${id}`);
  return response.data;
};

// User endpoint (non-admin)
export const getUserUnitsBySiteAndCategory = async (
  siteId: string | number,
  categoryId: string | number
) => {
  const response = await api.get(`/user/units/site/${siteId}/category/${categoryId}`);
  return response.data;
};
