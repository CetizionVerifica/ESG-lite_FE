import api from "../api/axios";

export const getCountries = async () => {
  const response = await api.get("/admin/countries");
  return response.data;
};

export const createCountry = async (name: string, code: string) => {
  const response = await api.post("/admin/countries", {
    name,
    code,
  });
  return response.data;
};

export const updateCountry = async (
  id: string | number,
  data: { name?: string; code?: string }
) => {
  const response = await api.put(`/admin/countries/${id}`, data);
  return response.data;
};

export const deleteCountry = async (id: string | number) => {
  const response = await api.delete(`/admin/countries/${id}`);
  return response.data;
};