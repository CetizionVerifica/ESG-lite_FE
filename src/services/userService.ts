import api from "../api/axios";

export const getUsers = async () => {
  const response = await api.get("/admin/users");
  return response.data;
};

export const getUserById = async (id: string | number) => {
  const response = await api.get(`/admin/users/${id}`);
  return response.data;
};

// Profile fields and category_ids need ESG-lite #70 (P20); older backends ignore them.
type UserProfileFields = {
  last_name?: string | null;
  phone_number?: string | null;
  timezone?: string | null;
  category_ids?: number[];
};

/** Without a password the backend generates one and returns it once as `temporary_password`. */
export const createUser = async (data: {
  name?: string;
  email: string;
  password?: string;
  role: string;
  site_id?: number;
  site_ids?: number[];
} & UserProfileFields) => {
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
  } & UserProfileFields
) => {
  const response = await api.patch(`/admin/users/${id}`, data);

  return response.data;
};

export const deleteUser = async (id: string | number) => {
  const response = await api.delete(`/admin/users/${id}`);
  return response.data;
};

//comment
/** Superadmin: email the person a link to choose a password (a fresh link each time). */
export const sendUserInvite = async (id: number): Promise<{ message: string; expiresAt: string }> => {
  const response = await api.post(`/admin/users/${id}/invite`);
  return response.data;
};
