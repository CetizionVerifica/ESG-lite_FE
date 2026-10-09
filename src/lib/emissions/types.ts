// Calculation types for Add data. Moved from pages/UserDataEntry/types.ts,
// which re-exports them until P03-C deletes the legacy page.

export interface DropdownOptionValue {
  id: string | number;
  label: string;
}

// Maps column value combinations to emission_category_name.
// Key format: "parentValue|childValue", e.g. { "paper|recycled": "Paper - Recycled" }
export interface EmissionCategoryMapping {
  [key: string]: string;
}

export interface ColumnEntity {
  pk_id: number;
  column_name: string;
  column_type: string;
  dropdown_options?: DropdownOptionValue[] | null;
}

// Per-method multi-field calculation (mirrors backend services/calculationSpec.ts).
// When a config carries this, the activity value is the PRODUCT of the listed
// columns for the chosen method — not a single sniffed field. First user:
// Use of Sold Products (Scope 3 Category 11).
export interface MethodCalculation {
  multiply: string[]; // column names whose values multiply together
  percent?: string[]; // subset of multiply entered as percentages (divided by 100)
  activity_unit?: string; // unit the product is in (preselects activity_data_unit)
}

export interface CalculationSpec {
  // per_method: a select column picks the fields (Use of Sold Products).
  // per_unit:   the row's unit picks them (transport: tonne.km = Weight × Distance,
  //             km = Distance alone); keys are normalized unit names.
  mode: "per_method" | "per_unit";
  method_column?: string; // per_method only
  identity_columns?: string[]; // columns added to the duplicate identity (backend)
  methods: { [methodKeyOrUnit: string]: MethodCalculation };
  legacy_field?: string; // per_unit: pre-spec rows hold the product here
}

export interface EmissionFactor {
  emission_factor_id: number;
  emission_category_name: string;
  global_category_name?: string;
  factor_value: number;
  denominator_unit: string;
  year: number;
}

export interface ModalRow {
  id: number;
  emission_category?: string;
  activity_data_unit?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- extra_fields values of any type
  _extra_data?: Record<string, any>;
  _ocrUnit?: string;
  _vendorName?: string;
  _invoiceIndex?: number;
  _activityDescription?: string;
  _invoiceNumber?: string;
  _invoiceDate?: string;
  _totalAmount?: number;
  _currency?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- rows carry ColumnConfig-defined fields
  [key: string]: any;
}

export interface EmissionCalculationResult {
  value: number | null;
  status: "ok" | "converted" | string;
}

export interface ColumnOptionsMap {
  [columnId: string]: DropdownOptionValue[];
}

// Child column name → parent column name, e.g. { disposal_method: "material" }.
export interface ColumnDependencies {
  [childColumnName: string]: string;
}

// Options of a dependent column per parent value (label), or per
// "grandparent|parent" composite key for 3-level configs.
export interface DependentOptionsMap {
  [childColumnName: string]: { [parentValue: string]: DropdownOptionValue[] };
}

// Supplementary fields per category, stored in emission.extra_data; they
// don't affect the calculation.
export interface ExtraFieldDefinition {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "select" | "textarea";
  required: boolean;
  options?: string[];
  show_for?: string[]; // only when emission_category contains one of these
}

export interface ColumnConfig {
  pk_id: number;
  config_name: string;
  columns: ColumnEntity[];
  column_options?: ColumnOptionsMap;
  column_dependencies?: ColumnDependencies;
  dependent_options?: DependentOptionsMap;
  emission_category_mapping?: EmissionCategoryMapping;
  extra_fields?: ExtraFieldDefinition[];
  calculation?: CalculationSpec | null;
}
