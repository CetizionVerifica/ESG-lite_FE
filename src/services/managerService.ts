import api from "../api/axios";

export interface CategoryAccess {
  category_id: number;
  category_name: string;
  has_access: boolean;
}

export interface SiteCategoryAccess {
  site_id: number;
  site_name: string;
  categories: CategoryAccess[];
}

export interface ManagerUser {
  user_id: number;
  name: string;
  last_name: string;
  email: string;
  role: string;
  sites: SiteCategoryAccess[];
}

export const getManagerUsers = async (): Promise<ManagerUser[]> => {
  const response = await api.get("/manager/users");
  return response.data;
};

export const getUserCategories = async (userId: number) => {
  const response = await api.get(`/manager/users/${userId}/categories`);
  return response.data;
};

export const updateUserCategories = async (
  userId: number,
  categoryIds: number[]
) => {
  const response = await api.put(`/manager/users/${userId}/categories`, {
    category_ids: categoryIds,
  });
  return response.data;
};
