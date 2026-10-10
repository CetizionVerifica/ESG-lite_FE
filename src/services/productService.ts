import api from "../api/axios";

export interface Product {
  product_id: number;
  name: string;
  description?: string;
  unit: string;
  site: {
    site_id: number;
    name: string;
  };
  created_at: string;
  updated_at: string;
}

// Admin functions
export const getProducts = async (): Promise<Product[]> => {
  const response = await api.get("/admin/products");
  return response.data;
};

export const getProductById = async (id: number | string): Promise<Product> => {
  const response = await api.get(`/admin/products/${id}`);
  return response.data;
};

export const createProduct = async (data: {
  name: string;
  description?: string;
  unit: string;
  site_id: number;
}): Promise<{ message: string; product: Product }> => {
  const response = await api.post("/admin/products", data);
  return response.data;
};

export const updateProduct = async (
  id: number | string,
  data: {
    name?: string;
    description?: string;
    unit?: string;
    site_id?: number;
  }
): Promise<{ message: string; product: Product }> => {
  const response = await api.put(`/admin/products/${id}`, data);
  return response.data;
};

export const deleteProduct = async (id: number | string): Promise<{ message: string }> => {
  const response = await api.delete(`/admin/products/${id}`);
  return response.data;
};

// User functions
export const getProductsBySite = async (siteId: number | string): Promise<Product[]> => {
  const response = await api.get(`/user/products/site/${siteId}`);
  return response.data;
};

/** A product's newest production records and their total (P25 drawer). */
export const getProductProduction = async (id: number | string, limit = 12) => {
  const response = await api.get(`/admin/products/${id}/production`, { params: { limit } });
  return response.data;
};
