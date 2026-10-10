import api from "../api/axios";

export const getCategories = async () => {
  const response = await api.get("/admin/categories");
  return response.data;
};

export const getCategoryById = async (id: string | number) => {
  const response = await api.get(`/admin/categories/${id}`);
  return response.data;
};

export const createCategory = async (data: {
  category_name: string;
  scope?: string | null;
  site_ids?: (string | number)[];
  assign_all_sites?: boolean;
}) => {
  const response = await api.post("/admin/categories", data);
  return response.data;
};

export const updateCategory = async (
  id: string | number,
  data: {
    category_name?: string;
    scope?: string | null;
    /** Replaces the category's site assignment when sent. */
    site_ids?: (string | number)[];
  }
) => {
  const response = await api.put(`/admin/categories/${id}`, data);
  return response.data;
};

export const deleteCategory = async (id: string | number) => {
  const response = await api.delete(`/admin/categories/${id}`);
  return response.data;
};