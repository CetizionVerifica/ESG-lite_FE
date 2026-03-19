import api from "../api/axios";

export type ProductionDataStatus = "pending" | "approved" | "rejected";

export interface ProductionData {
  production_id: number;
  quantity: number;
  unit: string;
  start_date: string;
  end_date: string;
  notes?: string;
  status: ProductionDataStatus;
  review_comment?: string;
  reviewed_at?: string;
  product: {
    product_id: number;
    name: string;
    unit: string;
  };
  site: {
    site_id: number;
    name: string;
  };
  created_by?: {
    user_id: number;
    name: string;
  };
  reviewed_by?: {
    user_id: number;
    name: string;
  };
  created_at: string;
  updated_at: string;
}

export interface EmissionIntensityData {
  totalEmissions: number;
  productionByUnit: Array<{
    unit: string;
    totalProduction: number;
    emissionIntensity: number;
  }>;
  monthlyData: Array<{
    month: string;
    emissions: number;
    production: number;
    intensity: number;
  }>;
  dateRange: {
    startDate: string;
    endDate: string;
  };
}

export interface IntensityComparison {
  comparison: Array<{
    siteId: number;
    totalEmissions: number;
    totalProduction: number;
    emissionIntensity: number;
  }>;
  dateRange: {
    startDate: string;
    endDate: string;
  };
}

export const getProductionDataBySite = async (
  siteId: number | string,
  params?: {
    startDate?: string;
    endDate?: string;
    productId?: number | string;
  }
): Promise<ProductionData[]> => {
  const response = await api.get(`/user/production-data/site/${siteId}`, { params });
  return response.data;
};

export const createProductionData = async (data: {
  product_id: number;
  site_id: number;
  quantity: number;
  unit: string;
  start_date: string;
  end_date: string;
  notes?: string;
}): Promise<{ message: string; productionData: ProductionData }> => {
  const response = await api.post("/user/production-data", data);
  return response.data;
};

export const updateProductionData = async (
  id: number | string,
  data: {
    quantity?: number;
    unit?: string;
    start_date?: string;
    end_date?: string;
    notes?: string;
  }
): Promise<{ message: string; productionData: ProductionData }> => {
  const response = await api.put(`/user/production-data/${id}`, data);
  return response.data;
};

export const deleteProductionData = async (
  id: number | string
): Promise<{ message: string }> => {
  const response = await api.delete(`/user/production-data/${id}`);
  return response.data;
};

export const getEmissionIntensity = async (
  siteId: number | string,
  params?: {
    startDate?: string;
    endDate?: string;
    productId?: number | string;
  }
): Promise<EmissionIntensityData> => {
  const response = await api.get(`/user/emission-intensity/site/${siteId}`, { params });
  return response.data;
};

export const getEmissionIntensityComparison = async (
  siteIds: number[],
  params?: {
    startDate?: string;
    endDate?: string;
  }
): Promise<IntensityComparison> => {
  const response = await api.get("/user/emission-intensity/comparison", {
    params: {
      siteIds: siteIds.join(","),
      ...params,
    },
  });
  return response.data;
};

// Manager APIs for production data
export const getProductionDataForManager = async (params?: {
  siteId?: number | string;
  startDate?: string;
  endDate?: string;
  status?: ProductionDataStatus;
  productId?: number | string;
}): Promise<ProductionData[]> => {
  const response = await api.get("/user/production-data/manager", { params });
  return response.data;
};

export const approveProductionData = async (
  id: number | string
): Promise<{ message: string; productionData: ProductionData }> => {
  const response = await api.put(`/user/production-data/${id}/approve`);
  return response.data;
};

export const managerUpdateProductionData = async (
  id: number | string,
  data: {
    quantity?: number;
    unit?: string;
    start_date?: string;
    end_date?: string;
    notes?: string;
  }
): Promise<{ message: string; productionData: ProductionData }> => {
  const response = await api.put(`/user/production-data/manager-edit/${id}`, data);
  return response.data;
};

export const rejectProductionData = async (
  id: number | string,
  comment?: string
): Promise<{ message: string; productionData: ProductionData }> => {
  const response = await api.put(`/user/production-data/${id}/reject`, { comment });
  return response.data;
};

export const bulkApproveProductionData = async (
  ids: number[]
): Promise<{ message: string }> => {
  const response = await api.put("/user/production-data/bulk-approve", { ids });
  return response.data;
};

export const bulkRejectProductionData = async (
  ids: number[],
  comment?: string
): Promise<{ message: string }> => {
  const response = await api.put("/user/production-data/bulk-reject", { ids, comment });
  return response.data;
};
