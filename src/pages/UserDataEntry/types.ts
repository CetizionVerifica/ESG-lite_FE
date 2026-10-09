import { UnitData } from "../../services/unitService";
import type {
    CalculationSpec,
    ColumnEntity,
    EmissionCalculationResult,
    EmissionFactor,
    ExtraFieldDefinition,
    ModalRow,
} from "../../features/add-data/types";

// Calculation types moved to src/features/add-data/types.ts.
export type {
    CalculationSpec,
    ColumnConfig,
    ColumnDependencies,
    ColumnEntity,
    ColumnOptionsMap,
    DependentOptionsMap,
    DropdownOptionValue,
    EmissionCalculationResult,
    EmissionCategoryMapping,
    EmissionFactor,
    ExtraFieldDefinition,
    MethodCalculation,
    ModalRow,
} from "../../features/add-data/types";

export interface Category {
    category_id: number;
    category_name: string;
    scope: string;
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
