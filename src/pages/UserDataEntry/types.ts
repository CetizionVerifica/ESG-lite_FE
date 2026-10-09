import { UnitData } from "../../services/unitService";
import type {
    CalculationSpec,
    ColumnEntity,
    DropdownOptionValue,
    EmissionCalculationResult,
    EmissionCategoryMapping,
    EmissionFactor,
    ModalRow,
} from "../../features/add-data/types";

// Calculation types moved to src/features/add-data/types.ts.
export type {
    CalculationSpec,
    ColumnEntity,
    DropdownOptionValue,
    EmissionCalculationResult,
    EmissionCategoryMapping,
    EmissionFactor,
    MethodCalculation,
    ModalRow,
} from "../../features/add-data/types";

export interface Category {
    category_id: number;
    category_name: string;
    scope: string;
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
