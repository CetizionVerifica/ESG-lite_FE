import api from "../api/axios";

export const getUsers = async () => {
  const response = await api.get("/admin/users");
  return response.data;
};

export const getUserById = async (id: string | number) => {
  const response = await api.get(`/admin/users/${id}`);
  return response.data;
};

export const createUser = async (data: {
  name?: string;
  email: string;
  password: string;
  role: string;
  site_id?: number;
  site_ids?: number[];
}) => {
  const response = await api.post("/admin/users", data);
  return response.data;
};

export const updateUser = async (
  id: string | number,
  data: {
    name?: string;
    email?: string;
    password?: string;
    role?: string;
    site_id?: number | null;
    site_ids?: number[];
  }
) => {
  const response = await api.put(`/admin/users/${id}`, data);
  return response.data;
};

export const deleteUser = async (id: string | number) => {
  const response = await api.delete(`/admin/users/${id}`);
  return response.data;
};
