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
  site_id: number;
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

export interface ExtraFieldDefinition {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "textarea";
  required: boolean;
  options?: string[];
  show_for?: string[];
}

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
    extra_fields?: ExtraFieldDefinition[];
    rename_map?: Record<string, string>;
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

// ─── Auto-Generate Column Config Types ──────────────────────────────────────

export type PatternType = "FLAT" | "TWO_DIM" | "THREE_DIM";

export interface ProposedColumn {
  existing_id: number | null;
  column_name: string;
  column_type: "number" | "select";
  is_new: boolean;
}

export interface DimColumnNames {
  columns: ProposedColumn[];
  activity_column_name: string;
  ef_names?: string[];  // Emission factor names specific to this dimension count
}

export interface EfNamePair {
  display_name: string;
  lookup_name: string;
}

export interface ProposedConfigGroup {
  denominator_unit: string;
  pattern: PatternType;
  columns: ProposedColumn[];
  column_options: ColumnOptionsMap;
  column_dependencies: ColumnDependencies;
  dependent_options: DependentOptionsMap;
  emission_category_mapping: EmissionCategoryMapping;
  ef_names: string[];
  ef_name_pairs?: EfNamePair[];
  source?: "ecm" | "ef";
  column_names_by_dim: Record<number, DimColumnNames>;
}

export interface ProposedUnit {
  unit_name: string;
  already_exists: boolean;
}

export interface ColumnConfigProposal {
  config_name: string;
  site_id: number;
  category_id: number;
  site_name: string;
  category_name: string;
  configs: ProposedConfigGroup[];
  proposed_units: ProposedUnit[];
  existing_config_ids: number[];
}

export interface ConfirmAutoGenerateData {
  site_id: number;
  category_id: number;
  config_name: string;
  columns: ProposedColumn[];
  column_options: ColumnOptionsMap;
  column_dependencies: ColumnDependencies;
  dependent_options: DependentOptionsMap;
  emission_category_mapping: EmissionCategoryMapping;
  create_units: boolean;
  proposed_units: ProposedUnit[];
}

export interface ConfirmAutoGenerateResponse {
  message: string;
  columnConfig: any;
  units_created: string[];
}

// ─── Auto-Generate Column Config API ────────────────────────────────────────

export const previewAutoGenerateColumnConfig = async (
  siteId: number,
  categoryId: number
): Promise<ColumnConfigProposal> => {
  const response = await api.get("/admin/column-configs/auto-generate/preview", {
    params: { site_id: siteId, category_id: categoryId },
  });
  return response.data;
};

/**
 * Compress column_options and dependent_options before sending to reduce payload size.
 * When id === label, send just the string instead of {id, label}.
 */
function compressOptions(
  opts: Record<string, any>
): Record<string, any> {
  const compressed: Record<string, any> = {};
  for (const [key, value] of Object.entries(opts)) {
    if (Array.isArray(value)) {
      compressed[key] = value.map((item: any) =>
        typeof item === "object" && item.id === item.label ? item.id : item
      );
    } else if (typeof value === "object" && value !== null) {
      // dependent_options: nested object { parentVal: DropdownOptionValue[] }
      compressed[key] = compressOptions(value);
    } else {
      compressed[key] = value;
    }
  }
  return compressed;
}

export const confirmAutoGenerateColumnConfig = async (
  data: ConfirmAutoGenerateData
): Promise<ConfirmAutoGenerateResponse> => {
  const compressed = {
    ...data,
    column_options: compressOptions(data.column_options),
    dependent_options: compressOptions(data.dependent_options),
  };
  const response = await api.post("/admin/column-configs/auto-generate/confirm", compressed);
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
