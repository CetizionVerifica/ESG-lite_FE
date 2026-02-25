import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Dropdown, { DropdownOption } from "../../components/Dropdown";
import { Table, Column } from "../../components/Table";
import Modal from "../../components/Modal";
import { useAuth } from "../../context/AuthContext";
import { getUserColumnConfigsBySiteAndCategory } from "../../services/columnConfigService";
import {
    getEmissionsBySiteAndCategory,
    createEmission,
    updateEmission,
    deleteEmission,
    EmissionData,
} from "../../services/emissionService";
import { getUserEmissionFactorsBySiteAndCategory } from "../../services/emissionFactorService";
import {
    getUserUnitsBySiteAndCategory,
    UnitData,
} from "../../services/unitService";
import { canConvert, unitsMatchExact } from "../../utils/unitConversions";
import { useEmissionCalculation } from "./useEmissionCalculation";
import {
    UnitSelector,
    EmissionPreview,
    ValidationError,
    DocumentUploadModal,
} from "./components";
import {
    Category,
    ColumnEntity,
    ColumnConfig,
    ColumnDependencies,
    DependentOptionsMap,
    EmissionCategoryMapping,
    ColumnOptionsMap,
    DropdownOptionValue,
    EmissionFactor,
    EmissionRow,
    EmissionStatus,
    ModalRow,
} from "./types";
import BulkUploadModal from "../BulkUpload";
import {
    uploadAndExtractInvoice,
    getInvoices,
    deleteInvoice,
    bulkDeleteInvoices,
    reextractInvoice,
    type Invoice,
} from "../../services/invoiceService";

interface Site {
    site_id: number;
    name: string;
    categories?: Category[];
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

const toColumnTitle = (name: string) =>
    name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const EXTRACTION_STAGES = [
    "Uploading document...",
    "Extracting text from document...",
    "Analysing with AI...",
    "Almost done...",
];

const UserDataEntryPage = () => {
    const { user } = useAuth();

    // ---------------------------------------------------------------------------
    // Derived Data - Available Sites
    // ---------------------------------------------------------------------------
    // Get available sites from user (supports both single site and multiple sites)
    const availableSites: Site[] = useMemo(() => {
        const sites = user?.sites || [];
        const singleSite = user?.site || null;
        return sites.length > 0 ? sites : singleSite ? [singleSite] : [];
    }, [user?.sites, user?.site]);

    const hasMultipleSites = availableSites.length > 1;

    // ---------------------------------------------------------------------------
    // State
    // ---------------------------------------------------------------------------
    const [selectedSite, setSelectedSite] = useState<number | null>(
        availableSites.length > 0 ? availableSites[0].site_id : null,
    );
    const [selectedCategory, setSelectedCategory] = useState<number | null>(
        null,
    );
    const [selectedDate, setSelectedDate] = useState<string | null>(null);
    const [dynamicColumns, setDynamicColumns] = useState<ColumnEntity[]>([]);
    const [emissions, setEmissions] = useState<EmissionRow[]>([]);
    const [emissionFactors, setEmissionFactors] = useState<EmissionFactor[]>(
        [],
    );
    const [units, setUnits] = useState<UnitData[]>([]);
    const [loading, setLoading] = useState(false);
    const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
const rowsPerPage = 10;

    // Dependent dropdown configuration state
    const [columnOptions, setColumnOptions] = useState<ColumnOptionsMap>({});
    const [columnDependencies, setColumnDependencies] =
        useState<ColumnDependencies>({});
    const [dependentOptions, setDependentOptions] =
        useState<DependentOptionsMap>({});
    const [emissionCategoryMapping, setEmissionCategoryMapping] =
        useState<EmissionCategoryMapping>({});

    // Modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [modalRows, setModalRows] = useState<ModalRow[]>([]);
    const [isAdding, setIsAdding] = useState(false);
    const [nextRowId, setNextRowId] = useState(1);
    const [saveError, setSaveError] = useState<string | null>(null);

    // Document modal state
    const [documentModalOpen, setDocumentModalOpen] = useState(false);
    const [selectedEmissionForDocs, setSelectedEmissionForDocs] =
        useState<EmissionRow | null>(null);

    // Invoice upload state
    const [invoiceUploading, setInvoiceUploading] = useState(false);
    const invoiceFileRef = useRef<HTMLInputElement>(null);
    const [invoiceReviewOpen, setInvoiceReviewOpen] = useState(false);
    const [invoiceRows, setInvoiceRows] = useState<ModalRow[]>([]);
    const [isSavingInvoice, setIsSavingInvoice] = useState(false);
    const [invoiceCloudinaryUrl, setInvoiceCloudinaryUrl] = useState<string | null>(null);
    const [invoiceWarnings, setInvoiceWarnings] = useState<string[]>([]);
    const [extractionStage, setExtractionStage] = useState(0);

    // Invoice library state
    const [invoiceListOpen, setInvoiceListOpen] = useState(false);
    const [invoiceList, setInvoiceList] = useState<Invoice[]>([]);
    const [invoiceListLoading, setInvoiceListLoading] = useState(false);
    const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<number>>(new Set());
    const [deletingInvoiceIds, setDeletingInvoiceIds] = useState<Set<number>>(new Set());
    const [reusingInvoiceId, setReusingInvoiceId] = useState<number | null>(null);
    const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);

    // ---------------------------------------------------------------------------
    // Derived Data
    // ---------------------------------------------------------------------------
    // Calculate target year for emission factors (reporting year - 1)
    const targetYear = selectedDate
        ? parseInt(selectedDate.substring(0, 4)) - 1
        : undefined;

    // Compute select column names (columns that are dropdowns, not numeric activity data)
    const selectColumnNames = useMemo(() => {
        const names = new Set<string>();
        // Add columns with configured options
        dynamicColumns.forEach((col) => {
            if (columnOptions[col.pk_id.toString()]?.length > 0) {
                names.add(col.column_name);
            }
        });
        // Add parent columns (from columnDependencies values)
        Object.values(columnDependencies).forEach((parentName) =>
            names.add(parentName),
        );
        // Add child columns (from columnDependencies keys)
        Object.keys(columnDependencies).forEach((childName) =>
            names.add(childName),
        );
        return Array.from(names);
    }, [dynamicColumns, columnOptions, columnDependencies]);

    // ---------------------------------------------------------------------------
    // Hooks
    // ---------------------------------------------------------------------------
    const { getExpectedUnit, calculateEmission } = useEmissionCalculation(
        emissionFactors,
        targetYear,
        dynamicColumns,
        selectColumnNames,
    );

    // ---------------------------------------------------------------------------
    // Derived Data (continued)
    // ---------------------------------------------------------------------------
    // Get current site and its categories
    const currentSite = availableSites.find((s) => s.site_id === selectedSite);
    const categories: Category[] = currentSite?.categories || [];
    const siteId = selectedSite;

    const siteOptions: DropdownOption[] = availableSites.map((site) => ({
        id: site.site_id,
        label: site.name,
    }));

    const categoryOptions: DropdownOption[] = categories.map((category) => ({
        id: category.category_id,
        label: category.category_name,
    }));

    const dateOptions = generateDateOptions();

    // Set initial site when availableSites becomes available
    useEffect(() => {
        if (availableSites.length > 0 && selectedSite === null) {
            setSelectedSite(availableSites[0].site_id);
        }
    }, [availableSites, selectedSite]);

    // Reset category when site changes
    useEffect(() => {
        setSelectedCategory(null);
    }, [selectedSite]);

    const filteredColumns = dynamicColumns.filter(
        (col) => col.column_name.toLowerCase() !== "emission_category",
    );

    // ---------------------------------------------------------------------------
    // Data Fetching
    // ---------------------------------------------------------------------------
    const fetchData = useCallback(async () => {
        if (!selectedCategory || !selectedDate || !siteId) {
            setDynamicColumns([]);
            setEmissions([]);
            setEmissionFactors([]);
            setUnits([]);
            return;
        }

        try {
            setLoading(true);

            // Calculate target year for emission factors (reporting year - 1)
            const factorYear = parseInt(selectedDate.substring(0, 4)) - 1;

            const [configs, emissionsData, factors, unitsData] =
                await Promise.all([
                    getUserColumnConfigsBySiteAndCategory(
                        siteId,
                        selectedCategory,
                    ),
                    getEmissionsBySiteAndCategory(
                        siteId,
                        selectedCategory,
                        selectedDate,
                    ),
                    getUserEmissionFactorsBySiteAndCategory(
                        siteId,
                        selectedCategory,
                        factorYear,
                    ),
                    getUserUnitsBySiteAndCategory(siteId, selectedCategory),
                ]);

            const config = configs[0] as ColumnConfig | undefined;
            setDynamicColumns(config?.columns || []);
            setColumnOptions(config?.column_options || {});
            setColumnDependencies(config?.column_dependencies || {});
            setDependentOptions(config?.dependent_options || {});
            setEmissionCategoryMapping(config?.emission_category_mapping || {});
            setEmissions(flattenEmissions(emissionsData));
            setEmissionFactors(factors);
            setUnits(unitsData);
        } catch (error) {
            console.error("Error fetching data:", error);
            resetDataState();
        } finally {
            setLoading(false);
        }
    }, [selectedCategory, selectedDate, siteId]);

    useEffect(() => {
  setCurrentPage(1);
}, [emissions]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // Proactively fetch emission factors, units, and column configs as soon as
    // site + category are selected, so the Invoice Review Modal dropdowns are
    // populated even before the user picks a reporting date.
    useEffect(() => {
        if (!siteId || !selectedCategory || selectedDate) {
            // Skip: either missing required fields, or fetchData() will handle it
            return;
        }
        const factorYear = new Date().getFullYear() - 1;
        Promise.all([
            getUserColumnConfigsBySiteAndCategory(siteId, selectedCategory),
            getUserEmissionFactorsBySiteAndCategory(siteId, selectedCategory, factorYear),
            getUserUnitsBySiteAndCategory(siteId, selectedCategory),
        ])
            .then(([configs, factors, unitsData]) => {
                const config = configs[0] as ColumnConfig | undefined;
                if (config) {
                    setDynamicColumns(config.columns || []);
                    setColumnOptions(config.column_options || {});
                    setColumnDependencies(config.column_dependencies || {});
                    setDependentOptions(config.dependent_options || {});
                    setEmissionCategoryMapping(config.emission_category_mapping || {});
                }
                setEmissionFactors(factors);
                setUnits(unitsData);
            })
            .catch(() => {
                // Non-critical — dropdowns will fall back to text inputs
            });
    }, [siteId, selectedCategory, selectedDate]);

    // Close the full-screen invoice preview on Escape
    useEffect(() => {
        if (!previewInvoice) return;
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") setPreviewInvoice(null);
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [previewInvoice]);

    // Cycle extraction stage messages while an OCR operation is in progress
    useEffect(() => {
        const isActive = invoiceUploading || reusingInvoiceId !== null;
        if (!isActive) {
            setExtractionStage(0);
            return;
        }
        setExtractionStage(0);
        const timer = setInterval(() => {
            setExtractionStage((prev) =>
                Math.min(prev + 1, EXTRACTION_STAGES.length - 1),
            );
        }, 3500);
        return () => clearInterval(timer);
    }, [invoiceUploading, reusingInvoiceId]);

    // ---------------------------------------------------------------------------
    // Dependent Dropdown Helpers
    // ---------------------------------------------------------------------------

    // Check if a column is a parent column (has dependents) - case-insensitive
    const isParentColumn = (columnName: string): boolean => {
        const columnNameLower = columnName.toLowerCase();
        return Object.values(columnDependencies).some(
            (parent) => parent.toLowerCase() === columnNameLower,
        );
    };

    // Check if a column is a dependent column - case-insensitive
    const isDependentColumn = (columnName: string): boolean => {
        const columnNameLower = columnName.toLowerCase();
        return Object.keys(columnDependencies).some(
            (child) => child.toLowerCase() === columnNameLower,
        );
    };

    // Get the parent column name for a dependent column - case-insensitive
    const getParentColumnName = (columnName: string): string | null => {
        // First try exact match
        if (columnName in columnDependencies) {
            return columnDependencies[columnName];
        }
        // Try case-insensitive match
        const columnNameLower = columnName.toLowerCase();
        for (const [child, parent] of Object.entries(columnDependencies)) {
            if (child.toLowerCase() === columnNameLower) {
                return parent;
            }
        }
        return null;
    };

    // Helper to get a value from row with case-insensitive key lookup
    // This handles potential case mismatches between column_dependencies and actual column names
    const getRowValue = (
        row: ModalRow | EmissionRow,
        key: string,
    ): string | undefined => {
        // First try exact match
        if (key in row) {
            return row[key] as string | undefined;
        }
        // Try case-insensitive match
        const keyLower = key.toLowerCase();
        for (const rowKey of Object.keys(row)) {
            if (rowKey.toLowerCase() === keyLower) {
                return row[rowKey] as string | undefined;
            }
        }
        return undefined;
    };

    // Get dropdown options for a column
    const getColumnDropdownOptions = (
        columnName: string,
        columnId: number,
        parentValue?: string,
    ): DropdownOptionValue[] => {
        // If it's a dependent column and we have a parent value, use dependent_options
        if (isDependentColumn(columnName) && parentValue) {
            // First, find the dependent options for this column (case-insensitive lookup)
            const columnNameLower = columnName.toLowerCase();
            let childDeps = dependentOptions[columnName];
            if (!childDeps) {
                for (const [key, value] of Object.entries(dependentOptions)) {
                    if (key.toLowerCase() === columnNameLower) {
                        childDeps = value;
                        break;
                    }
                }
            }

            if (childDeps) {
                // The parentValue is the stored ID, but dependent_options is keyed by label
                // We need to convert the parent ID to its label
                const parentColName = getParentColumnName(columnName);
                let parentLabel = parentValue;

                // Try to convert parent ID to label
                if (parentColName) {
                    // IMPORTANT: If the parent column is ALSO a dependent column, we need to look up
                    // its label from dependentOptions (using grandparent value), not columnOptions!
                    const grandparentColName =
                        getParentColumnName(parentColName);

                    if (
                        grandparentColName &&
                        isDependentColumn(parentColName)
                    ) {
                        // Parent is also dependent - look up in dependentOptions
                        // Search through all grandparent values to find which one contains our parentValue
                        const parentDepOptions =
                            dependentOptions[parentColName];
                        if (parentDepOptions) {
                            // Search through all grandparent values to find which one contains our parentValue
                            for (const [_gpValue, options] of Object.entries(
                                parentDepOptions,
                            )) {
                                const matchingOpt = options.find(
                                    (opt) => String(opt.id) === parentValue,
                                );
                                if (matchingOpt) {
                                    parentLabel = matchingOpt.label;
                                    break;
                                }
                            }
                        }
                    }

                    // Fallback to columnOptions if not found in dependentOptions
                    if (parentLabel === parentValue) {
                        const parentColNameLower = parentColName.toLowerCase();
                        const parentColEntity = dynamicColumns.find(
                            (col) =>
                                col.column_name.toLowerCase() ===
                                parentColNameLower,
                        );
                        if (parentColEntity) {
                            const parentOptions =
                                columnOptions[parentColEntity.pk_id.toString()];
                            if (parentOptions) {
                                let parentOption = parentOptions.find(
                                    (opt) => String(opt.id) === parentValue,
                                );
                                if (!parentOption) {
                                    const parentValueLower =
                                        parentValue.toLowerCase();
                                    parentOption = parentOptions.find(
                                        (opt) =>
                                            opt.label.toLowerCase() ===
                                                parentValueLower ||
                                            String(opt.id).toLowerCase() ===
                                                parentValueLower,
                                    );
                                }
                                if (parentOption) {
                                    parentLabel = parentOption.label;
                                }
                            }
                        }
                    }
                }

                // Try multiple lookup strategies:
                // 1. Exact match with converted label
                let depOptions = childDeps[parentLabel];

                // 2. Case-insensitive match with converted label
                if (!depOptions || depOptions.length === 0) {
                    const parentLabelLower = parentLabel.toLowerCase();
                    for (const [key, options] of Object.entries(childDeps)) {
                        if (key.toLowerCase() === parentLabelLower) {
                            depOptions = options;
                            break;
                        }
                    }
                }

                // 3. Try with raw parentValue (in case dependent_options is keyed by ID)
                if (!depOptions || depOptions.length === 0) {
                    depOptions = childDeps[parentValue];
                }

                // 4. Case-insensitive match with raw parentValue
                if (!depOptions || depOptions.length === 0) {
                    const parentValueLower = parentValue.toLowerCase();
                    for (const [key, options] of Object.entries(childDeps)) {
                        if (key.toLowerCase() === parentValueLower) {
                            depOptions = options;
                            break;
                        }
                    }
                }

                if (depOptions && depOptions.length > 0) {
                    return depOptions;
                }
            }
        }

        // If it's a parent column, use column_options (by column id)
        if (isParentColumn(columnName)) {
            const options = columnOptions[columnId.toString()];
            if (options && options.length > 0) {
                return options;
            }
        }

        // Fallback to column_options by column id for any select column
        const options = columnOptions[columnId.toString()];
        if (options && options.length > 0) {
            return options;
        }

        return [];
    };

    // Helper to find label by searching through ALL parent values in dependentOptions
    // This is needed for columns that are both parent AND dependent (like Material)
    const findLabelInDependentOptions = (
        columnName: string,
        storedValue: string,
    ): string | null => {
        const columnNameLower = columnName.toLowerCase();
        let depOptionsForColumn = dependentOptions[columnName];
        if (!depOptionsForColumn) {
            for (const [key, value] of Object.entries(dependentOptions)) {
                if (key.toLowerCase() === columnNameLower) {
                    depOptionsForColumn = value;
                    break;
                }
            }
        }

        if (depOptionsForColumn) {
            // Search through ALL parent values to find the matching option
            for (const [_parentVal, options] of Object.entries(
                depOptionsForColumn,
            )) {
                const option = options.find(
                    (opt) => String(opt.id) === storedValue,
                );
                if (option) {
                    return option.label;
                }
                // Also try case-insensitive match
                const storedValueLower = storedValue.toLowerCase();
                const optionCI = options.find(
                    (opt) =>
                        String(opt.id).toLowerCase() === storedValueLower ||
                        opt.label.toLowerCase() === storedValueLower,
                );
                if (optionCI) {
                    return optionCI.label;
                }
            }
        }
        return null;
    };

    // Helper to get the label for a stored option ID
    const getOptionLabel = (
        columnName: string,
        columnId: number,
        storedValue: string,
        parentValue?: string,
    ): string => {
        // For dependent columns, first try with specific parent value if provided
        if (isDependentColumn(columnName)) {
            // Case-insensitive lookup for column name in dependentOptions
            const columnNameLower = columnName.toLowerCase();
            let depOptionsForColumn = dependentOptions[columnName];
            if (!depOptionsForColumn) {
                for (const [key, value] of Object.entries(dependentOptions)) {
                    if (key.toLowerCase() === columnNameLower) {
                        depOptionsForColumn = value;
                        break;
                    }
                }
            }

            if (depOptionsForColumn) {
                // If we have a specific parent value, try that first
                if (parentValue) {
                    let depOptions = depOptionsForColumn[parentValue];
                    if (!depOptions) {
                        const parentValueLower = parentValue.toLowerCase();
                        for (const [key, options] of Object.entries(
                            depOptionsForColumn,
                        )) {
                            if (key.toLowerCase() === parentValueLower) {
                                depOptions = options;
                                break;
                            }
                        }
                    }
                    if (depOptions) {
                        let option = depOptions.find(
                            (opt) => String(opt.id) === storedValue,
                        );
                        if (!option) {
                            const storedValueLower = storedValue.toLowerCase();
                            option = depOptions.find(
                                (opt) =>
                                    String(opt.id).toLowerCase() ===
                                        storedValueLower ||
                                    opt.label.toLowerCase() ===
                                        storedValueLower,
                            );
                        }
                        if (option) return option.label;
                    }
                }

                // If no parent value or not found, search through ALL parent values
                const foundLabel = findLabelInDependentOptions(
                    columnName,
                    storedValue,
                );
                if (foundLabel) return foundLabel;
            }
        }

        // Check column_options
        const options = columnOptions[columnId.toString()];
        if (options) {
            // Try exact match first
            let option = options.find((opt) => String(opt.id) === storedValue);
            // If not found, try case-insensitive or label match
            if (!option) {
                const storedValueLower = storedValue.toLowerCase();
                option = options.find(
                    (opt) =>
                        String(opt.id).toLowerCase() === storedValueLower ||
                        opt.label.toLowerCase() === storedValueLower,
                );
            }
            if (option) return option.label;
        }

        // Fallback to stored value if no label found
        return storedValue;
    };

    // Determine emission category from mapping based on row values
    const getAutoEmissionCategory = (row: ModalRow): string | null => {
        if (Object.keys(emissionCategoryMapping).length === 0) {
            return null;
        }

        // Find "terminal" child columns - columns that are children but NOT parents of anything else
        // These are the columns that directly determine the emission category
        const allChildCols = Object.keys(columnDependencies);
        const allParentCols = new Set(Object.values(columnDependencies));
        const terminalChildCols = allChildCols.filter(
            (child) => !allParentCols.has(child),
        );

        // If no terminal children, fall back to all child columns
        const childColsToUse =
            terminalChildCols.length > 0 ? terminalChildCols : allChildCols;

        // Build the mapping key from terminal parent-child pairs only
        const keyParts: string[] = [];

        for (const childCol of childColsToUse.sort()) {
            const parentCol = columnDependencies[childCol];
            if (!parentCol) continue;

            // Use case-insensitive lookup to handle potential key mismatches
            const parentValue = getRowValue(row, parentCol);
            if (!parentValue) return null;

            const childValue = getRowValue(row, childCol);
            if (!childValue) return null;

            // Get labels for both parent and child (case-insensitive column lookup)
            const parentColLower = parentCol.toLowerCase();
            const parentColEntity = dynamicColumns.find(
                (col) => col.column_name.toLowerCase() === parentColLower,
            );
            const parentLabel = parentColEntity
                ? getOptionLabel(
                      parentCol,
                      parentColEntity.pk_id,
                      String(parentValue),
                  )
                : String(parentValue);

            const childColLower = childCol.toLowerCase();
            const childColEntity = dynamicColumns.find(
                (col) => col.column_name.toLowerCase() === childColLower,
            );
            const childLabel = childColEntity
                ? getOptionLabel(
                      childCol,
                      childColEntity.pk_id,
                      String(childValue),
                      parentLabel,
                  )
                : String(childValue);

            keyParts.push(parentLabel);
            keyParts.push(childLabel);
        }

        const mappingKey = keyParts.join("|");

        // First try exact match
        if (emissionCategoryMapping[mappingKey]) {
            return emissionCategoryMapping[mappingKey];
        }

        // If no exact match, try case-insensitive lookup
        const mappingKeyLower = mappingKey.toLowerCase();
        for (const [key, value] of Object.entries(emissionCategoryMapping)) {
            if (key.toLowerCase() === mappingKeyLower) {
                return value;
            }
        }

        return null;
    };

    // Check if a column should show as a select dropdown
    const isSelectColumn = (column: ColumnEntity): boolean => {
        const hasColumnOptions =
            columnOptions[column.pk_id.toString()]?.length > 0;
        const isParent = isParentColumn(column.column_name);
        const isDependent = isDependentColumn(column.column_name);
        return (
            column.column_type === "select" ||
            hasColumnOptions ||
            isParent ||
            isDependent
        );
    };

    // ---------------------------------------------------------------------------
    // Modal Handlers
    // ---------------------------------------------------------------------------
    const openModal = () => {
        const initialRow = createModalRow(1, dynamicColumns);
        setModalRows([initialRow]);
        setNextRowId(2);
        setSaveError(null);
        setModalOpen(true);
    };

    const closeModal = () => {
        setModalOpen(false);
        setSaveError(null);
    };

    const handleAddModalRow = () => {
        const newRow = createModalRow(nextRowId, dynamicColumns);
        setModalRows((prev) => [...prev, newRow]);
        setNextRowId((prev) => prev + 1);
    };

    const handleRemoveModalRow = (rowId: number) => {
        setModalRows((prev) => prev.filter((row) => row.id !== rowId));
    };

    const handleModalRowChange = (
        rowId: number,
        columnName: string,
        value: string,
    ) => {
        setModalRows((prev) =>
            prev.map((row) => {
                if (row.id !== rowId) return row;

                const updatedRow = { ...row, [columnName]: value };

                // If this is a parent column, clear dependent column values
                if (isParentColumn(columnName)) {
                    // Find all columns that depend on this parent (case-insensitive comparison)
                    const columnNameLower = columnName.toLowerCase();
                    Object.keys(columnDependencies).forEach((childCol) => {
                        const parentInDeps = columnDependencies[childCol];
                        if (parentInDeps.toLowerCase() === columnNameLower) {
                            // Find the actual key in the row (case-insensitive)
                            const actualChildKey = Object.keys(updatedRow).find(
                                (k) =>
                                    k.toLowerCase() === childCol.toLowerCase(),
                            );
                            if (actualChildKey) {
                                updatedRow[actualChildKey] = "";
                            }
                        }
                    });
                }

                // Check if we should auto-set the emission_category
                const autoCategory = getAutoEmissionCategory(updatedRow);
                if (autoCategory) {
                    updatedRow.emission_category = autoCategory;
                } else if (
                    isParentColumn(columnName) ||
                    isDependentColumn(columnName)
                ) {
                    // Clear emission_category when a mapped column changes but no valid mapping exists yet
                    // This ensures the old value doesn't persist when user changes dropdown selections
                    updatedRow.emission_category = "";
                }

                return updatedRow;
            }),
        );
    };

    // ---------------------------------------------------------------------------
    // Save Handlers
    // ---------------------------------------------------------------------------
    const validateRows = (): { valid: boolean; errors: string[] } => {
        const errors: string[] = [];

        modalRows.forEach((row, index) => {
            if (!row.emission_category) {
                errors.push(
                    `Row ${index + 1}: Please select an emission category`,
                );
                return;
            }

            if (!row.activity_data_unit) {
                errors.push(`Row ${index + 1}: Please select an activity unit`);
                return;
            }

            const expectedUnit = getExpectedUnit(row.emission_category);
            if (
                expectedUnit &&
                !unitsMatchExact(expectedUnit, row.activity_data_unit)
            ) {
                if (!canConvert(row.activity_data_unit, expectedUnit)) {
                    errors.push(
                        `Row ${index + 1}: Unit mismatch - Expected "${expectedUnit}" but got "${row.activity_data_unit}". No conversion available.`,
                    );
                    return;
                }
            }

            // Validate that emission can be calculated
            const emissionResult = calculateEmission(row);
            if (emissionResult.value === null) {
                errors.push(`Row ${index + 1}: ${emissionResult.status}`);
            }
        });

        return { valid: errors.length === 0, errors };
    };

    const handleSaveAll = async () => {
        const allRowsHaveDates = modalRows.every(
            (row) => row.date_of_reporting,
        );
        if (
            !selectedCategory ||
            (!selectedDate && !allRowsHaveDates) ||
            !siteId ||
            modalRows.length === 0
        )
            return;

        setSaveError(null);

        const validation = validateRows();
        if (!validation.valid) {
            setSaveError(validation.errors.join("\n"));
            return;
        }

        try {
            setIsAdding(true);

            // selectedDate is now in YYYY-MM-DD format (last day of month)
            const dateOfReporting = selectedDate;

            const newEmissions: EmissionRow[] = [];

            for (const row of modalRows) {
                const {
                    id,
                    activity_data_unit,
                    date_of_reporting: rowDate,
                    ...activityData
                } = row;

                const result = await createEmission({
                    site_id: siteId,
                    category_id: selectedCategory,
                    activity_data: activityData,
                    total_emission: 0,
                    unit: "kg CO2e",
                    date_of_reporting: rowDate || dateOfReporting,
                    activity_data_unit: activity_data_unit || undefined,
                });

                newEmissions.push(flattenEmission(result.emission));
            }

            setEmissions((prev) => [...newEmissions, ...prev]);
            closeModal();
            setModalRows([]);
        } catch (error: any) {
            console.error("Error creating emissions:", error);
            setSaveError(
                error?.response?.data?.message ||
                    error?.message ||
                    "Failed to save emissions. Please try again.",
            );
        } finally {
            setIsAdding(false);
        }
    };

    // ---------------------------------------------------------------------------
    // Table Handlers
    // ---------------------------------------------------------------------------
    const handleEdit = async (
        row: EmissionRow,
        updates: Partial<EmissionRow>,
    ) => {
        try {
            // Exclude non-activity fields from activity data
            const {
                total_emission: _te,
                unit: _u,
                pk_id: _pk,
                status: _s,
                reviewed_by: _rb,
                review_comment: _rc,
                ...existingActivityData
            } = row;
            const {
                total_emission: _te2,
                unit: _u2,
                pk_id: _pk2,
                status: _s2,
                reviewed_by: _rb2,
                review_comment: _rc2,
                ...updateActivityData
            } = updates as EmissionRow;

            const mergedActivityData = {
                ...existingActivityData,
                ...updateActivityData,
            };

            const result = await updateEmission(row.pk_id, {
                activity_data: mergedActivityData,
            });

            setEmissions((prev) =>
                prev.map((item) =>
                    item.pk_id === row.pk_id
                        ? flattenEmission(result.emission)
                        : item,
                ),
            );
        } catch (error) {
            console.error("Error updating emission:", error);
            throw error;
        }
    };

    const handleDelete = async (row: EmissionRow) => {
        try {
            await deleteEmission(row.pk_id);
            setEmissions((prev) =>
                prev.filter((item) => item.pk_id !== row.pk_id),
            );
        } catch (error) {
            console.error("Error deleting emission:", error);
            throw error;
        }
    };

    const handleOpenDocuments = (row: EmissionRow) => {
        setSelectedEmissionForDocs(row);
        setDocumentModalOpen(true);
    };

    const handleCloseDocuments = () => {
        setDocumentModalOpen(false);
        setSelectedEmissionForDocs(null);
    };

    // ---------------------------------------------------------------------------
    // Invoice Upload Handler
    // ---------------------------------------------------------------------------
    const closeInvoiceReview = () => {
        setInvoiceReviewOpen(false);
        setInvoiceCloudinaryUrl(null);
        setInvoiceWarnings([]);
        setSaveError(null);
    };

    const handleInvoiceRowChange = (
        rowId: number,
        key: string,
        value: string,
    ) => {
        setInvoiceRows((prev) =>
            prev.map((row) =>
                row.id === rowId ? { ...row, [key]: value } : row,
            ),
        );
    };

    const handleSaveInvoiceRows = async () => {
        if (!selectedCategory || !siteId || invoiceRows.length === 0) return;

        try {
            setIsSavingInvoice(true);
            setSaveError(null);
            const newEmissions: EmissionRow[] = [];

            for (const row of invoiceRows) {
                const {
                    id,
                    date_of_reporting,
                    activity_data_unit,
                    _ocrUnit: _,
                    _vendorName: __,
                    ...activityData
                } = row;

                const result = await createEmission({
                    site_id: siteId,
                    category_id: selectedCategory,
                    activity_data: activityData,
                    total_emission: 0,
                    unit: "kg CO2e",
                    date_of_reporting: date_of_reporting || selectedDate || "",
                    activity_data_unit: activity_data_unit || undefined,
                });

                newEmissions.push(flattenEmission(result.emission));
            }

            setEmissions((prev) => [...newEmissions, ...prev]);
            closeInvoiceReview();
        } catch (error: any) {
            console.error("Error saving invoice emissions:", error);
            setSaveError(
                error?.response?.data?.message ||
                    error?.message ||
                    "Failed to save invoice data.",
            );
        } finally {
            setIsSavingInvoice(false);
        }
    };

    const handleInvoiceUpload = async (
        e: React.ChangeEvent<HTMLInputElement>,
    ) => {
        const file = e.target.files?.[0];
        if (!file || !siteId || !selectedCategory) return;

        try {
            setInvoiceUploading(true);
            setSaveError(null);

            const response = await uploadAndExtractInvoice({
                file,
                site_id: siteId,
                category_id: selectedCategory,
                uploaded_by: user?.user_id,
                unit_names: units.length ? units.map((u) => u.unit_name) : undefined,
            });

            if (response.error) {
                setSaveError(`Invoice extraction error: ${response.error}`);
                return;
            }

            if (response.emission && response.emission.length > 0) {
                // Fetch units if not already loaded, so we can normalize the OCR unit
                let availableUnits = units;
                if (availableUnits.length === 0) {
                    try {
                        availableUnits = await getUserUnitsBySiteAndCategory(
                            siteId,
                            selectedCategory,
                        );
                        setUnits(availableUnits);
                    } catch {
                        // continue — unit field will fall back to text input
                    }
                }

                // Fetch emission factors if not already loaded, so we can populate the emission category dropdown
                let availableFactors = emissionFactors;
                if (availableFactors.length === 0) {
                    try {
                        const factorYear = new Date().getFullYear() - 1;
                        availableFactors = await getUserEmissionFactorsBySiteAndCategory(
                            siteId,
                            selectedCategory,
                            factorYear,
                        );
                        setEmissionFactors(availableFactors);
                    } catch {
                        // continue — emission category field will fall back to text input
                    }
                }

                const rows: ModalRow[] = response.emission.map((em, index) => {
                    // Pre-seed all configured dynamic columns (e.g. Disposal Method,
                    // Waste Type) so they appear in the review form for user input.
                    const row: ModalRow = { id: index + 1 };
                    filteredColumns.forEach((col) => {
                        row[col.column_name] = "";
                    });

                    if (em.activity_data) {
                        Object.entries(em.activity_data).forEach(
                            ([key, value]) => {
                                row[key] = String(value);
                            },
                        );
                    }

                    // Normalize OCR unit to exactly match a configured unit name
                    if (em.activity_data_unit) {
                        const ocrUnit = em.activity_data_unit;
                        const match = availableUnits.find(
                            (u) =>
                                u.unit_name.toLowerCase() ===
                                ocrUnit.toLowerCase(),
                        );
                        row.activity_data_unit = match
                            ? match.unit_name
                            : ocrUnit;
                        row._ocrUnit = ocrUnit;
                    }

                    // Normalize OCR emission_category to match a configured factor name
                    if (row.emission_category && availableFactors.length > 0) {
                        const ecLower = String(row.emission_category).toLowerCase();
                        const match = availableFactors.find(
                            (f) => f.emission_category_name.toLowerCase() === ecLower,
                        );
                        if (match) row.emission_category = match.emission_category_name;
                    }

                    if (em.date_of_reporting)
                        row.date_of_reporting = em.date_of_reporting;

                    row._vendorName = em.vendor_name ?? undefined;

                    return row;
                });

                setInvoiceRows(rows);
                setInvoiceCloudinaryUrl(response.cloudinary_url ?? null);
                // Collect any failed validation checks as user-visible warnings
                const warnings = (response.validations ?? [])
                    .flat()
                    .filter((v) => !v.ok && v.message)
                    .map((v) => v.message as string);
                setInvoiceWarnings(warnings);
                setInvoiceReviewOpen(true);
            } else {
                setSaveError(
                    "No emission data could be extracted from the invoice.",
                );
            }
        } catch (error: any) {
            console.error("Error uploading invoice:", error);
            setSaveError(
                error?.response?.data?.detail ||
                    error?.message ||
                    "Failed to extract data from invoice.",
            );
        } finally {
            setInvoiceUploading(false);
            if (invoiceFileRef.current) invoiceFileRef.current.value = "";
        }
    };

    // ---------------------------------------------------------------------------
    // Invoice Library Handlers
    // ---------------------------------------------------------------------------
    const handleViewInvoices = async () => {
        if (!siteId || !selectedCategory) return;
        setInvoiceListOpen(true);
        setInvoiceListLoading(true);
        try {
            const data = await getInvoices({
                site_id: siteId,
                category_id: selectedCategory,
            });
            setInvoiceList(data);
        } catch {
            setInvoiceList([]);
        } finally {
            setInvoiceListLoading(false);
        }
    };

    const handleReuseInvoice = async (invoice: Invoice) => {
        if (!siteId || !selectedCategory) return;
        setReusingInvoiceId(invoice.invoice_id);
        try {
            const response = await reextractInvoice(invoice.invoice_id, {
                site_id: siteId,
                category_id: selectedCategory,
                unit_names: units.length ? units.map((u) => u.unit_name) : undefined,
            });

            if (response.error) {
                setSaveError(`Invoice extraction error: ${response.error}`);
                return;
            }

            if (response.emission && response.emission.length > 0) {
                let availableUnits = units;
                if (availableUnits.length === 0) {
                    try {
                        availableUnits = await getUserUnitsBySiteAndCategory(siteId, selectedCategory);
                        setUnits(availableUnits);
                    } catch { /* fall back to text input */ }
                }

                let availableFactors = emissionFactors;
                if (availableFactors.length === 0) {
                    try {
                        const factorYear = new Date().getFullYear() - 1;
                        availableFactors = await getUserEmissionFactorsBySiteAndCategory(
                            siteId, selectedCategory, factorYear,
                        );
                        setEmissionFactors(availableFactors);
                    } catch { /* fall back to text input */ }
                }

                const rows: ModalRow[] = response.emission.map((em, index) => {
                    // Pre-seed all configured dynamic columns so they appear in review form.
                    const row: ModalRow = { id: index + 1 };
                    filteredColumns.forEach((col) => {
                        row[col.column_name] = "";
                    });
                    if (em.activity_data) {
                        Object.entries(em.activity_data).forEach(([key, value]) => {
                            row[key] = String(value);
                        });
                    }
                    if (em.activity_data_unit) {
                        const ocrUnit = em.activity_data_unit;
                        const match = availableUnits.find(
                            (u) => u.unit_name.toLowerCase() === ocrUnit.toLowerCase(),
                        );
                        row.activity_data_unit = match ? match.unit_name : ocrUnit;
                        row._ocrUnit = ocrUnit;
                    }
                    if (row.emission_category && availableFactors.length > 0) {
                        const ecLower = String(row.emission_category).toLowerCase();
                        const match = availableFactors.find(
                            (f) => f.emission_category_name.toLowerCase() === ecLower,
                        );
                        if (match) row.emission_category = match.emission_category_name;
                    }
                    if (em.date_of_reporting) row.date_of_reporting = em.date_of_reporting;
                    row._vendorName = em.vendor_name ?? undefined;
                    return row;
                });

                setInvoiceRows(rows);
                setInvoiceCloudinaryUrl(response.cloudinary_url ?? invoice.cloudinary_url);
                // Collect any failed validation checks as user-visible warnings
                const warnings = (response.validations ?? [])
                    .flat()
                    .filter((v) => !v.ok && v.message)
                    .map((v) => v.message as string);
                setInvoiceWarnings(warnings);
                setInvoiceListOpen(false);
                setInvoiceReviewOpen(true);
            } else {
                setSaveError("No emission data could be extracted from this invoice.");
            }
        } catch (error: any) {
            setSaveError(
                error?.response?.data?.detail ||
                    error?.message ||
                    "Failed to re-extract invoice data.",
            );
        } finally {
            setReusingInvoiceId(null);
        }
    };

    const handleDeleteFromList = async (id: number) => {
        setDeletingInvoiceIds((prev) => new Set(prev).add(id));
        try {
            await deleteInvoice(id);
            setInvoiceList((prev) => prev.filter((i) => i.invoice_id !== id));
            setSelectedInvoiceIds((prev) => {
                const s = new Set(prev);
                s.delete(id);
                return s;
            });
        } catch {
            /* leave in list on error */
        } finally {
            setDeletingInvoiceIds((prev) => {
                const s = new Set(prev);
                s.delete(id);
                return s;
            });
        }
    };

    const handleBulkDeleteFromList = async () => {
        const ids = [...selectedInvoiceIds];
        if (ids.length === 0) return;
        try {
            await bulkDeleteInvoices(ids);
            setInvoiceList((prev) =>
                prev.filter((i) => !selectedInvoiceIds.has(i.invoice_id)),
            );
            setSelectedInvoiceIds(new Set());
        } catch { /* leave list unchanged on error */ }
    };

    // ---------------------------------------------------------------------------
    // Table Columns
    // ---------------------------------------------------------------------------
    const tableColumns: Column<EmissionRow>[] = [
        {
            key: "emission_category" as keyof EmissionRow,
            label: "Emission Category",
            editable: false,
            type: "text" as const,
        },
        ...filteredColumns.map((col) => {
            const isDropdown = isSelectColumn(col);
            return {
                key: col.column_name as keyof EmissionRow,
                label: col.column_name,
                editable: true,
                type: (col.column_type === "number" ? "number" : "text") as
                    | "number"
                    | "text",
                // For dropdown columns, render the label instead of the stored ID
                ...(isDropdown && {
                    render: (value: string, row: EmissionRow) => {
                        if (!value) return "";
                        // For dependent columns, we need the parent value to look up the correct label
                        const parentColName = getParentColumnName(
                            col.column_name,
                        );
                        // Use case-insensitive lookup to handle potential key mismatches
                        const parentValue = parentColName
                            ? getRowValue(row, parentColName)
                            : undefined;
                        // Convert parent ID to label if needed
                        let parentLabel = parentValue;
                        if (parentValue && parentColName) {
                            const parentColEntity = dynamicColumns.find(
                                (c) => c.column_name === parentColName,
                            );
                            if (parentColEntity) {
                                parentLabel = getOptionLabel(
                                    parentColName,
                                    parentColEntity.pk_id,
                                    parentValue,
                                );
                            }
                        }
                        return getOptionLabel(
                            col.column_name,
                            col.pk_id,
                            String(value),
                            parentLabel,
                        );
                    },
                }),
            };
        }),
        {
            key: "activity_data_unit" as keyof EmissionRow,
            label: "Activity Unit",
            editable: false,
            type: "text" as const,
        },
        {
            key: "total_emission",
            label: "Total Emission (tCO2e)",
            editable: false,
            type: "number" as const,
        },
        {
            key: "unit",
            label: "Unit",
            editable: false,
            type: "text" as const,
        },
        {
            key: "status",
            label: "Status",
            editable: false,
            type: "text" as const,
            render: (value: EmissionStatus) => {
                const statusStyles: Record<EmissionStatus, string> = {
                    pending: "bg-yellow-100 text-yellow-800",
                    approved: "bg-green-100 text-green-800",
                    rejected: "bg-red-100 text-red-800",
                };
                return (
                    <span
                        className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${statusStyles[value] || "bg-gray-100 text-gray-800"}`}>
                        {value}
                    </span>
                );
            },
        },
    ];

    // ---------------------------------------------------------------------------
    // Helper Functions
    // ---------------------------------------------------------------------------
    const resetDataState = () => {
        setDynamicColumns([]);
        setColumnOptions({});
        setColumnDependencies({});
        setDependentOptions({});
        setEmissionCategoryMapping({});
        setEmissions([]);
        setEmissionFactors([]);
        setUnits([]);
    };

    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------

    const totalPages = Math.ceil(emissions.length / rowsPerPage);
const paginatedEmissions = emissions.slice(
  (currentPage - 1) * rowsPerPage,
  currentPage * rowsPerPage
);

    return (
        <div className="p-6">
            <h1 className="text-2xl font-bold mb-6">
                Data Entry for {currentSite?.name || "No Site"}
            </h1>

            {/* Filters */}
            <div
                className={`grid grid-cols-1 gap-4 mb-6 ${hasMultipleSites ? "md:grid-cols-3" : "md:grid-cols-2"}`}>
                {/* Site Selector - only show when user has multiple sites */}
                {hasMultipleSites && (
                    <div>
                        <label className="block text-sm font-medium mb-1">
                            Site
                        </label>
                        <Dropdown
                            options={siteOptions}
                            placeholder="Select Site"
                            value={selectedSite}
                            onChange={(option) =>
                                setSelectedSite(option?.id as number)
                            }
                            searchable={true}
                        />
                    </div>
                )}
                <div>
                    <label className="block text-sm font-medium mb-1">
                        Category
                    </label>
                    <Dropdown
                        options={categoryOptions}
                        placeholder="Select Category"
                        value={selectedCategory}
                        onChange={(option) =>
                            setSelectedCategory(option?.id as number)
                        }
                        searchable={true}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1">
                        Date
                    </label>
                    <Dropdown
                        options={dateOptions}
                        placeholder="Select Date"
                        value={selectedDate}
                        onChange={(option) =>
                            setSelectedDate(option?.id as string)
                        }
                        searchable={true}
                    />
                </div>
            </div>

            {/* Invoice Upload Error (shown outside modal) */}
            {saveError && !modalOpen && !invoiceReviewOpen && (
                <ValidationError
                    error={saveError}
                    onDismiss={() => setSaveError(null)}
                />
            )}

            {/* Action Buttons */}
            {selectedCategory && siteId && (
                <div className="mb-6 flex gap-3">
                    {/* Add New Entries & Bulk Upload require columns configured */}
                    {selectedDate && dynamicColumns.length > 0 && (
                        <>
                            <button
                                onClick={openModal}
                                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
                                Add New Entries
                            </button>
                            <button
                                onClick={() => setBulkUploadOpen(true)}
                                className="px-4 py-2 bg-white border border-blue-600 text-blue-600 rounded hover:bg-blue-50 flex items-center gap-2">
                                <svg
                                    className="w-4 h-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24">
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                                    />
                                </svg>
                                Bulk Upload
                            </button>
                        </>
                    )}

                    {/* Upload Invoice only needs site + category (date comes from invoice) */}
                    <button
                        onClick={() => invoiceFileRef.current?.click()}
                        disabled={invoiceUploading}
                        className="px-4 py-2 bg-white border border-emerald-600 text-emerald-600 rounded hover:bg-emerald-50 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
                        <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24">
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                            />
                        </svg>
                        {invoiceUploading ? "Extracting..." : "Upload Invoice"}
                    </button>
                    <input
                        ref={invoiceFileRef}
                        type="file"
                        accept=".pdf,image/*"
                        onChange={handleInvoiceUpload}
                        className="hidden"
                    />
                    {/* View previously uploaded invoices */}
                    <button
                        onClick={handleViewInvoices}
                        disabled={!siteId || !selectedCategory}
                        className="px-4 py-2 bg-white border border-emerald-600 text-emerald-600 rounded hover:bg-emerald-50 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                d="M3 7h18M3 12h18M3 17h18" />
                        </svg>
                        View Invoices
                    </button>
                </div>
            )}

            {/* Entry Modal */}
            <Modal
                isOpen={modalOpen}
                onClose={closeModal}
                title="Add New Entries"
                className="max-w-6xl! max-h-[85vh]!">
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse border border-gray-300">
                        <thead>
                            <tr className="bg-gray-100">
                                <th className="border border-gray-300 px-4 py-2 text-left text-sm font-semibold">
                                    Emission Category
                                </th>
                                {filteredColumns.map((col) => (
                                    <th
                                        key={col.pk_id}
                                        className="border border-gray-300 px-4 py-2 text-left text-sm font-semibold">
                                        {col.column_name}
                                    </th>
                                ))}
                                <th className="border border-gray-300 px-4 py-2 text-left text-sm font-semibold">
                                    Activity Unit
                                </th>
                                <th className="border border-gray-300 px-4 py-2 text-left text-sm font-semibold">
                                    Total Emission (tCO2e)
                                </th>
                                <th className="border border-gray-300 px-4 py-2 text-left text-sm font-semibold w-20">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {modalRows.map((row) => (
                                <tr key={row.id} className="hover:bg-gray-50">
                                    {/* Emission Category Select */}
                                    <td className="border border-gray-300 px-2 py-2">
                                        {Object.keys(emissionCategoryMapping)
                                            .length > 0 ? (
                                            // Auto-mapped mode: show read-only field with auto-determined value
                                            <div className="relative">
                                                <input
                                                    type="text"
                                                    value={
                                                        row.emission_category ||
                                                        ""
                                                    }
                                                    readOnly
                                                    className={`w-full border px-2 py-1 rounded ${
                                                        row.emission_category
                                                            ? "border-green-400 bg-green-50 text-green-800"
                                                            : "border-gray-300 bg-gray-100 text-gray-500"
                                                    }`}
                                                    placeholder="Auto-determined from selections"
                                                />
                                                {row.emission_category && (
                                                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-green-600">
                                                        Auto
                                                    </span>
                                                )}
                                            </div>
                                        ) : (
                                            // Manual mode: show dropdown for selection
                                            <select
                                                value={
                                                    row.emission_category || ""
                                                }
                                                onChange={(e) =>
                                                    handleModalRowChange(
                                                        row.id,
                                                        "emission_category",
                                                        e.target.value,
                                                    )
                                                }
                                                className="w-full border border-gray-300 px-2 py-1 rounded focus:outline-none focus:ring focus:ring-blue-300">
                                                <option value="">
                                                    Select Category
                                                </option>
                                                {emissionFactors.map(
                                                    (factor) => (
                                                        <option
                                                            key={
                                                                factor.emission_factor_id
                                                            }
                                                            value={
                                                                factor.emission_category_name
                                                            }>
                                                            {
                                                                factor.emission_category_name
                                                            }
                                                        </option>
                                                    ),
                                                )}
                                            </select>
                                        )}
                                    </td>

                                    {/* Dynamic Columns */}
                                    {filteredColumns.map((col) => {
                                        const parentColName =
                                            getParentColumnName(
                                                col.column_name,
                                            );
                                        // Use case-insensitive lookup to handle potential key mismatches
                                        const parentValue = parentColName
                                            ? getRowValue(row, parentColName)
                                            : undefined;
                                        const options =
                                            getColumnDropdownOptions(
                                                col.column_name,
                                                col.pk_id,
                                                parentValue,
                                            );
                                        const showAsSelect =
                                            isSelectColumn(col) &&
                                            options.length > 0;
                                        const isDisabledDependent =
                                            isDependentColumn(
                                                col.column_name,
                                            ) && !parentValue;

                                        return (
                                            <td
                                                key={col.pk_id}
                                                className="border border-gray-300 px-2 py-2">
                                                {showAsSelect ? (
                                                    <select
                                                        value={
                                                            row[
                                                                col.column_name
                                                            ] || ""
                                                        }
                                                        onChange={(e) =>
                                                            handleModalRowChange(
                                                                row.id,
                                                                col.column_name,
                                                                e.target.value,
                                                            )
                                                        }
                                                        disabled={
                                                            isDisabledDependent
                                                        }
                                                        className={`w-full border border-gray-300 px-2 py-1 rounded focus:outline-none focus:ring focus:ring-blue-300 ${
                                                            isDisabledDependent
                                                                ? "bg-gray-100 cursor-not-allowed"
                                                                : ""
                                                        }`}>
                                                        <option value="">
                                                            {isDisabledDependent
                                                                ? `Select ${toColumnTitle(parentColName!)} first`
                                                                : `Select ${toColumnTitle(col.column_name)}`}
                                                        </option>
                                                        {options.map(
                                                            (option) => (
                                                                <option
                                                                    key={
                                                                        option.id
                                                                    }
                                                                    value={
                                                                        option.id
                                                                    }>
                                                                    {
                                                                        option.label
                                                                    }
                                                                </option>
                                                            ),
                                                        )}
                                                    </select>
                                                ) : (
                                                    <input
                                                        type={
                                                            col.column_type ===
                                                            "number"
                                                                ? "number"
                                                                : "text"
                                                        }
                                                        value={
                                                            row[
                                                                col.column_name
                                                            ] || ""
                                                        }
                                                        onChange={(e) =>
                                                            handleModalRowChange(
                                                                row.id,
                                                                col.column_name,
                                                                e.target.value,
                                                            )
                                                        }
                                                        className="w-full border border-gray-300 px-2 py-1 rounded focus:outline-none focus:ring focus:ring-blue-300"
                                                        placeholder={
                                                            col.column_name
                                                        }
                                                    />
                                                )}
                                            </td>
                                        );
                                    })}

                                    {/* Unit Selector */}
                                    <td className="border border-gray-300 px-2 py-2">
                                        <UnitSelector
                                            currentUnit={row.activity_data_unit}
                                            expectedUnit={getExpectedUnit(
                                                row.emission_category || "",
                                            )}
                                            units={units}
                                            onChange={(value) =>
                                                handleModalRowChange(
                                                    row.id,
                                                    "activity_data_unit",
                                                    value,
                                                )
                                            }
                                        />
                                    </td>

                                    {/* Emission Preview */}
                                    <td className="border border-gray-300 px-2 py-2">
                                        <EmissionPreview
                                            result={calculateEmission(row)}
                                        />
                                    </td>

                                    {/* Actions */}
                                    <td className="border border-gray-300 px-2 py-2">
                                        <button
                                            onClick={() =>
                                                handleRemoveModalRow(row.id)
                                            }
                                            disabled={modalRows.length === 1}
                                            className="px-2 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:bg-gray-400">
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    
                </div>

                {/* Error Display */}
                {saveError && (
                    <ValidationError
                        error={saveError}
                        onDismiss={() => setSaveError(null)}
                    />
                )}

                {/* Modal Actions */}
                <div className="flex justify-between mt-4">
                    <button
                        onClick={handleAddModalRow}
                        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">
                        + Add Row
                    </button>

                    <div className="flex gap-2">
                        <button
                            onClick={closeModal}
                            className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400">
                            Cancel
                        </button>
                        <button
                            onClick={handleSaveAll}
                            disabled={isAdding || modalRows.length === 0}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400">
                            {isAdding
                                ? "Saving..."
                                : `Save All (${modalRows.length})`}
                        </button>
                    </div>
                </div>
            </Modal>

            {selectedCategory && selectedDate && siteId && (
                <BulkUploadModal
                    isOpen={bulkUploadOpen}
                    onClose={() => setBulkUploadOpen(false)}
                    dynamicColumns={dynamicColumns}
                    emissionFactors={emissionFactors}
                    units={units}
                    siteId={siteId}
                    categoryId={selectedCategory}
                    selectedDate={selectedDate}
                    getExpectedUnit={getExpectedUnit}
                    calculateEmission={calculateEmission}
                    getAutoEmissionCategory={getAutoEmissionCategory}
                    onImportComplete={(newEmissions) => {
                        setEmissions((prev) => [...newEmissions, ...prev]);
                    }}
                />
            )}

            {/* Emissions Table */}
            {selectedCategory && selectedDate && (
                <div>
                    {loading ? (
                        <div className="text-center py-4">Loading data...</div>
                    ) : dynamicColumns.length > 0 ? (
                        <>
                        <Table<EmissionRow>
                            data={paginatedEmissions}
                            columns={tableColumns}
                            keyField="pk_id"
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                            loading={loading}
                            showActions={true}
                            renderActions={(
                                row,
                                { editButton, deleteButton },
                            ) => {
                                const docsButton = (
                                    <button
                                        onClick={() => handleOpenDocuments(row)}
                                        className="px-3 py-1 bg-purple-600 text-white rounded text-sm hover:bg-purple-700"
                                        title="Manage Documents">
                                        Docs
                                    </button>
                                );

                                if (row.status === "approved") {
                                    return (
                                        <div className="flex flex-col gap-1">
                                            <span className="text-sm text-green-700">
                                                Approved by{" "}
                                                {row.reviewed_by?.name ||
                                                    "Manager"}
                                            </span>
                                            <div className="flex gap-2">
                                                {docsButton}
                                            </div>
                                        </div>
                                    );
                                }
                                if (row.status === "rejected") {
                                    return (
                                        <div className="flex flex-col gap-1">
                                            <span className="text-sm text-red-700">
                                                Rejected
                                                {row.review_comment
                                                    ? `: ${row.review_comment}`
                                                    : ""}
                                            </span>
                                            <div className="flex gap-2">
                                                {editButton}
                                                {docsButton}
                                            </div>
                                        </div>
                                    );
                                }
                                // Pending status - show default actions
                                return (
                                    <div className="flex gap-2">
                                        {editButton}
                                        {deleteButton}
                                        {docsButton}
                                    </div>
                                );
                            }}
                        />

 {totalPages > 1 && (
                    <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-white mt-2">
                        <p className="text-sm text-gray-600">
                            Showing{" "}
                            <span className="font-medium">
                                {(currentPage - 1) * rowsPerPage + 1}
                            </span>{" "}
                            to{" "}
                            <span className="font-medium">
                                {Math.min(currentPage * rowsPerPage, emissions.length)}
                            </span>{" "}
                            of{" "}
                            <span className="font-medium">{emissions.length}</span> entries
                        </p>

                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setCurrentPage(1)}
                                disabled={currentPage === 1}
                                className="px-2 py-1 text-sm rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                            >«</button>

                            <button
                                onClick={() => setCurrentPage((p) => p - 1)}
                                disabled={currentPage === 1}
                                className="px-2 py-1 text-sm rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                            >‹</button>

                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                                .filter(
                                    (page) =>
                                        page === 1 ||
                                        page === totalPages ||
                                        Math.abs(page - currentPage) <= 2
                                )
                                .reduce<(number | "...")[]>((acc, page, idx, arr) => {
                                    if (idx > 0 && page - (arr[idx - 1] as number) > 1)
                                        acc.push("...");
                                    acc.push(page);
                                    return acc;
                                }, [])
                                .map((item, idx) =>
                                    item === "..." ? (
                                        <span key={`ellipsis-${idx}`} className="px-2 text-gray-400">…</span>
                                    ) : (
                                        <button
                                            key={item}
                                            onClick={() => setCurrentPage(item as number)}
                                            className={`px-3 py-1 text-sm rounded border transition-colors ${
                                                currentPage === item
                                                    ? "bg-blue-600 text-white border-blue-600"
                                                    : "border-gray-300 hover:bg-gray-50 text-gray-700"
                                            }`}
                                        >{item}</button>
                                    )
                                )}

                            <button
                                onClick={() => setCurrentPage((p) => p + 1)}
                                disabled={currentPage === totalPages}
                                className="px-2 py-1 text-sm rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                            >›</button>

                            <button
                                onClick={() => setCurrentPage(totalPages)}
                                disabled={currentPage === totalPages}
                                className="px-2 py-1 text-sm rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                            >»</button>
                        </div>
                    </div>
                )}

</>
                    ) : (
                        <div className="text-center py-4 text-gray-500">
                            No columns configured for this category.
                        </div>
                    )}
                </div>
            )}

            {/* Invoice Review Modal */}
            <Modal
                isOpen={invoiceReviewOpen}
                onClose={closeInvoiceReview}
                title={`Review Extracted Invoice Data (${invoiceRows.length} invoice${invoiceRows.length !== 1 ? "s" : ""})`}
                className={invoiceCloudinaryUrl ? "max-w-7xl! max-h-[92vh]!" : "max-w-4xl! max-h-[88vh]!"}>
                {/* Two-column layout when a PDF URL is available; single column otherwise */}
                <div className={invoiceCloudinaryUrl ? "flex gap-4" : ""}>
                    {/* Left: embedded invoice document */}
                    {invoiceCloudinaryUrl && (
                        <div className="w-[45%] shrink-0">
                            <p className="text-xs font-medium text-gray-500 mb-2">Invoice Document</p>
                            {/\.pdf(\?.*)?$/i.test(invoiceCloudinaryUrl) ? (
                                <object
                                    data={invoiceCloudinaryUrl}
                                    type="application/pdf"
                                    className="w-full rounded border"
                                    style={{ height: "580px" }}>
                                    <div className="flex flex-col items-center justify-center h-145 bg-gray-50 rounded border text-center p-4">
                                        <p className="text-sm text-gray-500 mb-3">PDF cannot be displayed inline.</p>
                                        <a
                                            href={invoiceCloudinaryUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="px-3 py-2 bg-emerald-600 text-white text-sm rounded hover:bg-emerald-700">
                                            Open PDF ↗
                                        </a>
                                    </div>
                                </object>
                            ) : (
                                <img
                                    src={invoiceCloudinaryUrl}
                                    alt="Invoice"
                                    className="w-full object-contain max-h-145 rounded border"
                                />
                            )}
                        </div>
                    )}
                    {/* Right: review form */}
                    <div className={invoiceCloudinaryUrl ? "flex-1 min-w-0 flex flex-col" : ""}>
                {invoiceWarnings.length > 0 && (
                    <div className="mb-3 space-y-1">
                        {invoiceWarnings.map((msg, i) => (
                            <div key={i} className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-300 px-3 py-2 text-xs text-amber-800">
                                <span className="mt-0.5 shrink-0">⚠</span>
                                <span>{msg}</span>
                            </div>
                        ))}
                    </div>
                )}
                <div className="space-y-4 overflow-y-auto max-h-[65vh] pr-2">
                    {invoiceRows.map((row, index) => {
                        const {
                            id,
                            emission_category,
                            activity_data_unit,
                            date_of_reporting,
                            _ocrUnit,
                            _vendorName,
                            ...activityFields
                        } = row;
                        return (
                            <div
                                key={id}
                                className="border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden">
                                {/* Card header */}
                                <div className="flex items-center gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200">
                                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold shrink-0">
                                        {index + 1}
                                    </span>
                                    <span className="text-sm font-semibold text-gray-700">
                                        {_vendorName ?? `Invoice ${index + 1}`}
                                    </span>
                                    {_vendorName && (
                                        <span className="text-xs text-gray-400">
                                            · Invoice {index + 1}
                                        </span>
                                    )}
                                </div>
                                <div className="p-5">
                                <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                                    {filteredColumns.length > 0 ? filteredColumns.map((col) => {
                                        const parentColName = getParentColumnName(col.column_name);
                                        const parentValue = parentColName
                                            ? (row[parentColName] as string | undefined)
                                            : undefined;
                                        const options = getColumnDropdownOptions(
                                            col.column_name,
                                            col.pk_id,
                                            parentValue,
                                        );
                                        const showAsSelect = isSelectColumn(col) && options.length > 0;
                                        const isDisabledDependent =
                                            isDependentColumn(col.column_name) && !parentValue;
                                        return (
                                            <div key={col.pk_id}>
                                                <label className="block text-xs font-medium text-gray-600 mb-1">
                                                    {toColumnTitle(col.column_name)}
                                                </label>
                                                {showAsSelect ? (
                                                    <select
                                                        value={(row[col.column_name] as string) || ""}
                                                        onChange={(e) =>
                                                            handleInvoiceRowChange(id, col.column_name, e.target.value)
                                                        }
                                                        disabled={isDisabledDependent}
                                                        className={`w-full border border-gray-300 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${isDisabledDependent ? "bg-gray-100 cursor-not-allowed" : ""}`}>
                                                        <option value="">
                                                            {isDisabledDependent
                                                                ? `Select ${toColumnTitle(parentColName!)} first`
                                                                : `Select ${toColumnTitle(col.column_name)}`}
                                                        </option>
                                                        {options.map((opt) => (
                                                            <option key={opt.id} value={opt.id}>
                                                                {opt.label}
                                                            </option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <input
                                                        type={col.column_type === "number" ? "number" : "text"}
                                                        value={(row[col.column_name] as string) || ""}
                                                        onChange={(e) =>
                                                            handleInvoiceRowChange(id, col.column_name, e.target.value)
                                                        }
                                                        className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                                                        placeholder={toColumnTitle(col.column_name)}
                                                    />
                                                )}
                                            </div>
                                        );
                                    }) : Object.entries(activityFields).map(
                                        ([key, value]) => (
                                            <div key={key}>
                                                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                                    {key}
                                                </label>
                                                <input
                                                    type="text"
                                                    value={String(value ?? "")}
                                                    onChange={(e) =>
                                                        handleInvoiceRowChange(id, key, e.target.value)
                                                    }
                                                    className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                                                />
                                            </div>
                                        ),
                                    )}
                                    <div className="col-span-2 border-t border-gray-100 my-1" />
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                            Emission Category
                                        </label>
                                        {emissionFactors.length > 0 ? (
                                            <select
                                                value={emission_category ?? ""}
                                                onChange={(e) =>
                                                    handleInvoiceRowChange(
                                                        id,
                                                        "emission_category",
                                                        e.target.value,
                                                    )
                                                }
                                                className="w-full border border-emerald-300 bg-emerald-50 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400">
                                                <option value="">Select category</option>
                                                {emission_category &&
                                                    !emissionFactors.find(
                                                        (f) => f.emission_category_name === emission_category,
                                                    ) && (
                                                        <option value={emission_category}>
                                                            {emission_category}
                                                        </option>
                                                    )}
                                                {emissionFactors.map((factor) => (
                                                    <option
                                                        key={factor.emission_factor_id}
                                                        value={factor.emission_category_name}>
                                                        {factor.emission_category_name}
                                                    </option>
                                                ))}
                                            </select>
                                        ) : (
                                            <input
                                                type="text"
                                                value={emission_category ?? ""}
                                                onChange={(e) =>
                                                    handleInvoiceRowChange(
                                                        id,
                                                        "emission_category",
                                                        e.target.value,
                                                    )
                                                }
                                                className="w-full border border-emerald-300 bg-emerald-50 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                            />
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                            Activity Unit
                                        </label>
                                        {units.length > 0 ? (
                                            <select
                                                value={activity_data_unit ?? ""}
                                                onChange={(e) =>
                                                    handleInvoiceRowChange(
                                                        id,
                                                        "activity_data_unit",
                                                        e.target.value,
                                                    )
                                                }
                                                className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400">
                                                <option value="">Select unit</option>
                                                {_ocrUnit &&
                                                    !units.find((u) => u.unit_name === _ocrUnit) && (
                                                        <option value={_ocrUnit}>{_ocrUnit}</option>
                                                    )}
                                                {units.map((u) => (
                                                    <option key={u.unit_id} value={u.unit_name}>
                                                        {u.unit_name}
                                                    </option>
                                                ))}
                                            </select>
                                        ) : (
                                            <input
                                                type="text"
                                                value={activity_data_unit ?? ""}
                                                onChange={(e) =>
                                                    handleInvoiceRowChange(
                                                        id,
                                                        "activity_data_unit",
                                                        e.target.value,
                                                    )
                                                }
                                                className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                                            />
                                        )}
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-500 mb-1.5">
                                            Date of Reporting
                                        </label>
                                        <input
                                            type="date"
                                            value={date_of_reporting ?? ""}
                                            onChange={(e) =>
                                                handleInvoiceRowChange(
                                                    id,
                                                    "date_of_reporting",
                                                    e.target.value,
                                                )
                                            }
                                            className="w-full border border-gray-300 px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                                        />
                                    </div>
                                </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {saveError && invoiceReviewOpen && (
                    <ValidationError
                        error={saveError}
                        onDismiss={() => setSaveError(null)}
                    />
                )}

                <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-gray-200">
                    <button
                        onClick={closeInvoiceReview}
                        className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                        Cancel
                    </button>
                    <button
                        onClick={handleSaveInvoiceRows}
                        disabled={isSavingInvoice || invoiceRows.length === 0}
                        className="px-5 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors">
                        {isSavingInvoice
                            ? "Saving..."
                            : `Save ${invoiceRows.length} Invoice${invoiceRows.length !== 1 ? "s" : ""}`}
                    </button>
                </div>
                    </div>{/* closes form wrapper */}
                </div>{/* closes outer flex wrapper */}
            </Modal>

            {/* Document Upload Modal */}
            {selectedEmissionForDocs && (
                <DocumentUploadModal
                    isOpen={documentModalOpen}
                    onClose={handleCloseDocuments}
                    emissionId={selectedEmissionForDocs.pk_id}
                    emissionCategory={selectedEmissionForDocs.emission_category}
                />
            )}

            {/* Invoice Library Modal */}
            <Modal
                isOpen={invoiceListOpen}
                onClose={() => {
                    setInvoiceListOpen(false);
                    setSelectedInvoiceIds(new Set());
                }}
                title="Uploaded Invoices"
                className="max-w-2xl! max-h-[80vh]!">
                {/* Bulk delete toolbar */}
                <div className="flex items-center justify-between mb-3">
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={
                                invoiceList.length > 0 &&
                                selectedInvoiceIds.size === invoiceList.length
                            }
                            onChange={(e) =>
                                setSelectedInvoiceIds(
                                    e.target.checked
                                        ? new Set(invoiceList.map((i) => i.invoice_id))
                                        : new Set(),
                                )
                            }
                            className="rounded"
                        />
                        Select all
                    </label>
                    {selectedInvoiceIds.size > 0 && (
                        <button
                            onClick={handleBulkDeleteFromList}
                            className="px-3 py-1.5 bg-red-100 text-red-700 text-sm rounded hover:bg-red-200 flex items-center gap-1.5">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Delete Selected ({selectedInvoiceIds.size})
                        </button>
                    )}
                </div>

                {invoiceListLoading ? (
                    <p className="text-center text-sm text-gray-500 py-8">Loading invoices…</p>
                ) : invoiceList.length === 0 ? (
                    <p className="text-center text-sm text-gray-400 py-8">No invoices uploaded for this site and category yet.</p>
                ) : (
                    <div className="overflow-y-auto max-h-[50vh]">
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr className="border-b border-gray-200 text-left text-xs text-gray-500 uppercase tracking-wide">
                                    <th className="pb-2 pr-3 w-8"></th>
                                    <th className="pb-2 pr-3">File</th>
                                    <th className="pb-2 pr-3 w-36">Uploaded</th>
                                    <th className="pb-2 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {invoiceList.map((inv) => (
                                    <tr key={inv.invoice_id} className="hover:bg-gray-50">
                                        <td className="py-2 pr-3">
                                            <input
                                                type="checkbox"
                                                checked={selectedInvoiceIds.has(inv.invoice_id)}
                                                onChange={(e) =>
                                                    setSelectedInvoiceIds((prev) => {
                                                        const s = new Set(prev);
                                                        e.target.checked
                                                            ? s.add(inv.invoice_id)
                                                            : s.delete(inv.invoice_id);
                                                        return s;
                                                    })
                                                }
                                                className="rounded"
                                            />
                                        </td>
                                        <td className="py-2 pr-3 max-w-55">
                                            <span
                                                className="block truncate text-gray-800"
                                                title={inv.file_name}>
                                                {inv.file_name}
                                            </span>
                                        </td>
                                        <td className="py-2 pr-3 text-gray-500 whitespace-nowrap">
                                            {new Date(inv.created_at).toLocaleDateString("en-GB", {
                                                day: "numeric",
                                                month: "short",
                                                year: "numeric",
                                            })}
                                        </td>
                                        <td className="py-2 text-right">
                                            <div className="flex items-center justify-end gap-1">
                                                {/* Expand / preview */}
                                                <button
                                                    onClick={() => setPreviewInvoice(inv)}
                                                    title="Preview"
                                                    className="p-1.5 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors">
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                            d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                                                    </svg>
                                                </button>
                                                {/* Reuse */}
                                                <button
                                                    onClick={() => handleReuseInvoice(inv)}
                                                    disabled={reusingInvoiceId === inv.invoice_id}
                                                    title="Re-extract and fill form"
                                                    className="px-2 py-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-300 rounded hover:bg-emerald-100 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap">
                                                    {reusingInvoiceId === inv.invoice_id ? "Loading…" : "Reuse"}
                                                </button>
                                                {/* Delete */}
                                                <button
                                                    onClick={() => handleDeleteFromList(inv.invoice_id)}
                                                    disabled={deletingInvoiceIds.has(inv.invoice_id)}
                                                    title="Delete"
                                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-40">
                                                    {deletingInvoiceIds.has(inv.invoice_id) ? (
                                                        <span className="text-xs">…</span>
                                                    ) : (
                                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                                                d="M6 18L18 6M6 6l12 12" />
                                                        </svg>
                                                    )}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Modal>

            {/* Full-screen invoice PDF preview popup (sits above the list modal) */}
            {previewInvoice && (
                <div
                    className="fixed inset-0 z-60 flex flex-col bg-black/80 backdrop-blur-sm"
                    onClick={() => setPreviewInvoice(null)}>
                    {/* Header */}
                    <div
                        className="flex items-center justify-between px-6 py-3 bg-gray-900 text-white shrink-0"
                        onClick={(e) => e.stopPropagation()}>
                        <div>
                            <p className="font-semibold text-sm">{previewInvoice.file_name}</p>
                            <p className="text-xs text-gray-400">
                                Uploaded{" "}
                                {new Date(previewInvoice.created_at).toLocaleDateString("en-GB", {
                                    day: "numeric",
                                    month: "short",
                                    year: "numeric",
                                })}
                            </p>
                        </div>
                        <button
                            onClick={() => setPreviewInvoice(null)}
                            className="text-gray-400 hover:text-white text-2xl leading-none ml-6">
                            &times;
                        </button>
                    </div>
                    {/* Document viewer */}
                    <div
                        className="flex-1 overflow-hidden"
                        onClick={(e) => e.stopPropagation()}>
                        {previewInvoice.file_type?.includes("pdf") ? (
                            <object
                                data={previewInvoice.cloudinary_url}
                                type="application/pdf"
                                className="w-full h-full">
                                <div className="flex flex-col items-center justify-center h-full text-white text-center p-8">
                                    <p className="text-gray-300 mb-4">PDF cannot be displayed inline.</p>
                                    <a
                                        href={previewInvoice.cloudinary_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="px-4 py-2 bg-emerald-600 text-white rounded hover:bg-emerald-700">
                                        Open PDF ↗
                                    </a>
                                </div>
                            </object>
                        ) : (
                            <img
                                src={previewInvoice.cloudinary_url}
                                alt={previewInvoice.file_name}
                                className="max-h-full max-w-full mx-auto object-contain"
                            />
                        )}
                    </div>
                </div>
            )}

            {/* Extraction loading overlay */}
            {(invoiceUploading || reusingInvoiceId !== null) && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl px-10 py-10 flex flex-col items-center gap-6 w-100 mx-4">
                        {/* Spinner with icon centre */}
                        <div className="relative flex items-center justify-center">
                            <div className="w-16 h-16 border-4 border-emerald-100 border-t-emerald-500 rounded-full animate-spin" />
                            <div className="absolute inset-0 flex items-center justify-center">
                                <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                                </svg>
                            </div>
                        </div>

                        {/* Stage text */}
                        <div className="text-center space-y-1.5">
                            <p className="text-base font-semibold text-gray-900 tracking-tight">
                                {EXTRACTION_STAGES[extractionStage]}
                            </p>
                            <p className="text-xs text-gray-400">
                                AI-powered extraction · This may take up to 30 seconds
                            </p>
                        </div>

                        {/* Progress pills */}
                        <div className="flex items-center gap-1.5">
                            {EXTRACTION_STAGES.map((_, i) => (
                                <div
                                    key={i}
                                    className={`h-1.5 rounded-full transition-all duration-500 ${
                                        i < extractionStage
                                            ? "bg-emerald-500 w-6"
                                            : i === extractionStage
                                              ? "bg-emerald-400 w-8"
                                              : "bg-gray-200 w-4"
                                    }`}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function generateDateOptions(): DropdownOption[] {
    const options: DropdownOption[] = [];
    const startYear = 2018;
    const endYear = 2030;

    // Generate from most recent to oldest (December 2026 to January 2021)
    for (let year = endYear; year >= startYear; year--) {
        for (let month = 11; month >= 0; month--) {
            const date = new Date(year, month, 1);
            const lastDay = new Date(year, month + 1, 0).getDate();
            const value = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
            const label = date.toLocaleDateString("en-US", {
                month: "long",
                year: "numeric",
            });
            options.push({ id: value, label });
        }
    }

    return options;
}

function createModalRow(id: number, columns: ColumnEntity[]): ModalRow {
    const row: ModalRow = { id };
    columns.forEach((col) => {
        row[col.column_name] = "";
    });
    return row;
}

function flattenEmission(emission: EmissionData): EmissionRow {
    return {
        // Spread activity_data first so explicit fields take precedence
        ...emission.activity_data,
        pk_id: emission.pk_id,
        total_emission: emission.total_emission,
        unit: emission.unit,
        activity_data_unit: emission.activity_data_unit,
        status: emission.status,
        reviewed_by: emission.reviewed_by,
        review_comment: emission.review_comment,
    };
}

function flattenEmissions(emissions: EmissionData[]): EmissionRow[] {
    return emissions.map(flattenEmission);
}

export default UserDataEntryPage;
