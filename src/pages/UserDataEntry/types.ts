export interface Category {
  category_id: number;
  category_name: string;
  scope: string;
}

export interface DropdownOptionValue {
  id: string | number;
  label: string;
}

export interface ColumnOptionsMap {
  [columnId: string]: DropdownOptionValue[];
}

export interface ColumnEntity {
  pk_id: number;
  column_name: string;
  column_type: string;
  dropdown_options?: DropdownOptionValue[] | null;
}

export interface ColumnConfig {
  pk_id: number;
  config_name: string;
  columns: ColumnEntity[];
  column_options?: ColumnOptionsMap;
}

export interface EmissionFactor {
  emission_factor_id: number;
  emission_category_name: string;
  factor_value: number;
  denominator_unit: string;
  year: number;
}

export type EmissionStatus = "pending" | "approved" | "rejected";

export interface ReviewedBy {
  user_id: number;
  name: string;
}

export interface EmissionRow {
  pk_id: number;
  total_emission: number;
  unit: string;
  status: EmissionStatus;
  reviewed_by?: ReviewedBy;
  review_comment?: string;
  [key: string]: any;
}

export interface ModalRow {
  id: number;
  emission_category?: string;
  activity_data_unit?: string;
  [key: string]: any;
}

export interface EmissionCalculationResult {
  value: number | null;
  status: "ok" | "converted" | string;
}
