import { UnitData } from "../../services/unitService";

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

// Maps child column name to parent column name
// Example: { "disposal_method": "material" } - disposal_method depends on material
export interface ColumnDependencies {
    [childColumnName: string]: string;
}

// Options for dependent columns based on parent value
// Example: { "disposal_method": { "paper": [{id: "recycled", label: "Recycled"}] } }
export interface DependentOptionsMap {
    [childColumnName: string]: {
        [parentValue: string]: DropdownOptionValue[];
    };
}

// Maps column value combinations to emission_category_name
// Key format: "parentValue|childValue"
// Example: { "paper|recycled": "Paper - Recycled" }
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
    multiply: string[];      // column names whose values multiply together
    percent?: string[];      // subset of multiply entered as percentages (divided by 100)
    activity_unit?: string;  // unit the product is in (preselects activity_data_unit)
}

export interface CalculationSpec {
    mode: "per_method";
    method_column: string;               // select column that picks the method
    identity_columns?: string[];         // columns added to the duplicate identity (backend)
    methods: { [methodOptionId: string]: MethodCalculation };
}

// Definition for supplementary (extra) fields per category
// These fields don't affect emission calculation — stored separately in emission.extra_data
export interface ExtraFieldDefinition {
    key: string;          // e.g., "equipment", "po_number"
    label: string;        // e.g., "Equipment", "PO Number"
    type: "text" | "number" | "date" | "select" | "textarea";
    required: boolean;
    options?: string[];   // For type="select" only
    show_for?: string[];  // If set, only show when emission_category contains one of these strings
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

export interface EmissionFactor {
    emission_factor_id: number;
    emission_category_name: string;
    global_category_name?: string;
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
    _extra_data?: Record<string, any>;
    _ocrUnit?: string;
    _vendorName?: string;
    _invoiceIndex?: number;
    _activityDescription?: string;
    _invoiceNumber?: string;
    _invoiceDate?: string;
    _totalAmount?: number;
    _currency?: string;
    [key: string]: any;
}

export interface EmissionCalculationResult {
    value: number | null;
    status: "ok" | "converted" | string;
}

export type UploadStage = "upload" | "mapping" | "review";

export interface BulkReviewRow {
    id: number;
    mappedData: Record<string, string>;
    extra_data: Record<string, string>;
    emission_category: string | null;
    original_company_category: string | null;
    activity_data_unit: string | null;
    total_emission: number | null;
    isValid: boolean;
    errorReason: string | null;
}

export interface ColumnMappingEntry {
    requiredField: string;
    label: string;
    mappedTo: string;
    skipped: boolean;
    isRequired: boolean;
    // The site's own column this entry stands for, when it differs from
    // requiredField. emission_category is always sent to the backend under that
    // fixed key, so this preserves the configured name for display and automap.
    sourceColumn?: string;
}

export interface BulkUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    dynamicColumns: ColumnEntity[];
    emissionFactors: EmissionFactor[];
    units: UnitData[];
    extraFields: ExtraFieldDefinition[];
    siteId: number;
    categoryId: number;
    companyId?: number;
    selectedDate: string;
    getExpectedUnit: (category: string) => string | null | undefined;
    calculateEmission: (row: ModalRow) => EmissionCalculationResult;
    getAutoEmissionCategory: (row: ModalRow) => { key: string; category: string } | null;
    onImportComplete: (newEmissions: EmissionRow[]) => void;
    userId?: number;
    // Multi-field categories compute the value from the method's fields, so the
    // explicit "Value (Spend / Quantity)" mapping field is hidden for them.
    calculationSpec?: CalculationSpec | null;
}
