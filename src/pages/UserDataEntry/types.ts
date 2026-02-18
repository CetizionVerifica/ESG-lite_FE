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

export interface ColumnConfig {
    pk_id: number;
    config_name: string;
    columns: ColumnEntity[];
    column_options?: ColumnOptionsMap;
    column_dependencies?: ColumnDependencies;
    dependent_options?: DependentOptionsMap;
    emission_category_mapping?: EmissionCategoryMapping;
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
    _ocrUnit?: string;
    _vendorName?: string;
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
    emission_category: string | null;
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
}

export interface BulkUploadModalProps {
    isOpen: boolean;
    onClose: () => void;
    dynamicColumns: ColumnEntity[];
    emissionFactors: EmissionFactor[];
    units: UnitData[];
    siteId: number;
    categoryId: number;
    selectedDate: string;
    getExpectedUnit: (category: string) => string | null | undefined;
    calculateEmission: (row: ModalRow) => EmissionCalculationResult;
    getAutoEmissionCategory: (row: ModalRow) => string | null;
    onImportComplete: (newEmissions: EmissionRow[]) => void;
}
