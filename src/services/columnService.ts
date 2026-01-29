import api from "../api/axios";

export const getColumns = async () => {
  const response = await api.get("/admin/columns");
  return response.data;
};

export const getColumnById = async (id: string | number) => {
  const response = await api.get(`/admin/columns/${id}`);
  return response.data;
};

export const createColumn = async (data: {
  column_name: string;
  column_type: string;
}) => {
  const response = await api.post("/admin/columns", data);
  return response.data;
};

export const updateColumn = async (
  id: string | number,
  data: {
    column_name?: string;
    column_type?: string;
  }
) => {
  const response = await api.put(`/admin/columns/${id}`, data);
  return response.data;
};

export const deleteColumn = async (id: string | number) => {
  const response = await api.delete(`/admin/columns/${id}`);
  return response.data;
};

export const getColumnsByType = async (type: string) => {
  const response = await api.get(`/admin/columns/type/${type}`);
  return response.data;
};

export const bulkCreateColumns = async (columns: Array<{
  column_name: string;
  column_type: string;
}>) => {
  const response = await api.post("/admin/columns/bulk", { columns });
  return response.data;
};
