import api from "../api/axios";
import { DropdownOptionValue } from "./columnService";

// Interface for column options map (column_id as string key -> options array)
export interface ColumnOptionsMap {
  [columnId: string]: DropdownOptionValue[];
}

// Maps child column name to parent column name
export interface ColumnDependencies {
  [childColumnName: string]: string;
}

// Options for dependent columns based on parent value
export interface DependentOptionsMap {
  [childColumnName: string]: {
    [parentValue: string]: DropdownOptionValue[];
  };
}

// Maps column value combinations to emission_category_name
export interface EmissionCategoryMapping {
  [key: string]: string;
}

export interface ColumnConfigData {
  pk_id?: number;
  config_name: string;
  site_id: number;
  category_id: number;
  column_ids?: number[];
  column_options?: ColumnOptionsMap;
  column_dependencies?: ColumnDependencies;
  dependent_options?: DependentOptionsMap;
  emission_category_mapping?: EmissionCategoryMapping;
}

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
  site_id?: number;
  category_id: number;
  column_ids?: number[];
  column_options?: ColumnOptionsMap;
  column_dependencies?: ColumnDependencies;
  dependent_options?: DependentOptionsMap;
  emission_category_mapping?: EmissionCategoryMapping;
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
    column_options?: ColumnOptionsMap;
    column_dependencies?: ColumnDependencies;
    dependent_options?: DependentOptionsMap;
    emission_category_mapping?: EmissionCategoryMapping;
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

// Get dropdown options for a specific column within a config
export const getColumnOptions = async (
  configId: string | number,
  columnId: string | number
) => {
  const response = await api.get(`/admin/column-configs/${configId}/column/${columnId}/options`);
  return response.data;
};

// Update dropdown options for a specific column within a config
export const updateColumnOptions = async (
  configId: string | number,
  columnId: string | number,
  options: DropdownOptionValue[]
) => {
  const response = await api.put(`/admin/column-configs/${configId}/column/${columnId}/options`, {
    options,
  });
  return response.data;
};
