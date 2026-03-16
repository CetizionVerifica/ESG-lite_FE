import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
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
    bulkDeleteEmissions,
    deleteEmissionsByBatch,
    getEmissionBatches,
    downloadEmissions,
    getEmissionFactorForEmission,
    type EmissionUploadBatch,
    type EmissionFactorDetails,
    EmissionData,
} from "../../services/emissionService";
import { getUserEmissionFactorsBySiteAndCategory } from "../../services/emissionFactorService";
import {
    getUserUnitsBySiteAndCategory,
    UnitData,
} from "../../services/unitService";
import { canConvert, unitsMatchExact } from "../../utils/unitConversions";
import { getMappingsByCompany, type CategoryMapping } from "../../services/categoryMappingService";
import { useEmissionCalculation } from "./useEmissionCalculation";
import {
    UnitSelector,
    ValidationError,
    DocumentUploadModal,
} from "./components";
import DistanceCalculatorModal from "./components/DistanceCalculatorModal";
import { isDistanceUnit, parseCompositeUnit } from "../../utils/distanceUnits";
import { MapPin } from "lucide-react";
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
    company?: { company_id: number; name: string };
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

    // FERA (Fuel and Energy Related Activities) — dynamically resolved from site's categories

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
    const [emissionBatches, setEmissionBatches] = useState<EmissionUploadBatch[]>([]);
    const [showEmissionBatches, setShowEmissionBatches] = useState(false);
    const [deletingBatchId, setDeletingBatchId] = useState<string | null>(null);
    const [emissionFactors, setEmissionFactors] = useState<EmissionFactor[]>(
        [],
    );
    const [feraEmissionFactors, setFeraEmissionFactors] = useState<EmissionFactor[]>([]);
    const [units, setUnits] = useState<UnitData[]>([]);
    const [loading, setLoading] = useState(false);
    const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);
const rowsPerPage = 10;

    // Dependent dropdown configuration state
    const [columnOptions, setColumnOptions] = useState<ColumnOptionsMap>({});
    const [columnDependencies, setColumnDependencies] =
        useState<ColumnDependencies>({});
    const [dependentOptions, setDependentOptions] =
        useState<DependentOptionsMap>({});
    const [emissionCategoryMapping, setEmissionCategoryMapping] =
        useState<EmissionCategoryMapping>({});

    // Extra supplementary field definitions from column config
    const [extraFields, setExtraFields] = useState<import("./types").ExtraFieldDefinition[]>([]);

    // Company category mapping: company_category_name → global_category_name (= emission_category_name)
    const [companyMappings, setCompanyMappings] = useState<CategoryMapping[]>([]);

    // Tooltip state (portal-based to escape overflow containers)
    const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);

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

    // Distance calculator modal state
    const [distanceModalState, setDistanceModalState] = useState<{
        open: boolean;
        rowId: number;
        colName: string;
    } | null>(null);

    // Invoice upload state
    const [invoiceUploading, setInvoiceUploading] = useState(false);
    const invoiceFileRef = useRef<HTMLInputElement>(null);
    const [invoiceReviewOpen, setInvoiceReviewOpen] = useState(false);
    const [invoiceRows, setInvoiceRows] = useState<ModalRow[]>([]);
    const [isSavingInvoice, setIsSavingInvoice] = useState(false);
    const [invoiceCloudinaryUrl, setInvoiceCloudinaryUrl] = useState<string | null>(null);
    const [invoiceWarnings, setInvoiceWarnings] = useState<string[]>([]);
    const [collapsedInvoices, setCollapsedInvoices] = useState<Set<number>>(new Set());
    const [confirmDeleteInvoice, setConfirmDeleteInvoice] = useState<number | null>(null);
    const [extractionStage, setExtractionStage] = useState(0);

    // Invoice library state
    const [invoiceListOpen, setInvoiceListOpen] = useState(false);
    const [invoiceList, setInvoiceList] = useState<Invoice[]>([]);
    const [invoiceListLoading, setInvoiceListLoading] = useState(false);
    const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<number>>(new Set());
    const [deletingInvoiceIds, setDeletingInvoiceIds] = useState<Set<number>>(new Set());
    const [reusingInvoiceId, setReusingInvoiceId] = useState<number | null>(null);
    const [previewInvoice, setPreviewInvoice] = useState<Invoice | null>(null);

    // Multi-select for bulk delete
    const [selectedEmissionIds, setSelectedEmissionIds] = useState<Set<number>>(new Set());
    const [bulkDeleting, setBulkDeleting] = useState(false);

    // Emission factor viewer
    const [factorModalOpen, setFactorModalOpen] = useState(false);
    const [factorModalData, setFactorModalData] = useState<EmissionFactorDetails | null>(null);
    const [factorModalEmission, setFactorModalEmission] = useState<EmissionRow | null>(null);
    const [factorLoading, setFactorLoading] = useState(false);

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
    const { getExpectedUnit, getEmissionFactor, calculateEmission } = useEmissionCalculation(
        emissionFactors,
        targetYear,
        dynamicColumns,
        selectColumnNames,
        emissionCategoryMapping,
    );

    // FERA emission calculation (uses FERA factors for the same fuel type)
    const { calculateEmission: calculateFeraEmission, getExpectedUnit: getFeraExpectedUnit, getEmissionFactor: getFeraEmissionFactor } = useEmissionCalculation(
        feraEmissionFactors,
        targetYear,
        dynamicColumns,
        selectColumnNames,
        emissionCategoryMapping,
        true, // fallbackToRaw — FERA factors account for fuel energy content in their factor_value
    );

    // ---------------------------------------------------------------------------
    // Derived Data (continued)
    // ---------------------------------------------------------------------------
    // Get current site and its categories
    const currentSite = availableSites.find((s) => s.site_id === selectedSite);
    const categories: Category[] = currentSite?.categories || [];

    // FERA category — dynamically found from the site's assigned categories
    const feraCategory = useMemo(
        () => categories.find((c) => c.category_name.toLowerCase() === "fera"),
        [categories],
    );
    const feraCategoryId = feraCategory?.category_id ?? null;

    // Check overlap: does the current category share any emission_category_names with FERA?
    const isFeraCategory = useMemo(() => {
        if (!feraCategoryId || feraEmissionFactors.length === 0 || emissionFactors.length === 0) return false;
        const feraNames = new Set(feraEmissionFactors.map((f) => f.emission_category_name?.toLowerCase()));
        return emissionFactors.some((f) => feraNames.has(f.emission_category_name?.toLowerCase()));
    }, [feraCategoryId, feraEmissionFactors, emissionFactors]);
    const siteId = selectedSite;

    // Use explicitly selected company, or auto-detect from current site
    const companyId = currentSite?.company?.company_id ?? null;

    const siteOptions: DropdownOption[] = availableSites.map((site) => ({
        id: site.site_id,
        label: site.name,
    }));

    const categoryOptions: DropdownOption[] = categories
        .filter((category) => category.category_id !== feraCategoryId)
        .map((category) => ({
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
            setExtraFields([]);
            setEmissions([]);
            setSelectedEmissionIds(new Set());
            setEmissionFactors([]);
            setFeraEmissionFactors([]);
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
            setExtraFields(config?.extra_fields || []);
            setEmissionFactors(factors);
            setUnits(unitsData);

            // Fetch FERA emissions + factors + units if the site has a FERA category
            if (feraCategoryId) {
                const [feraFactorsData, feraEmissionsData, feraUnitsData] = await Promise.all([
                    getUserEmissionFactorsBySiteAndCategory(siteId, feraCategoryId, factorYear).catch(() => []),
                    getEmissionsBySiteAndCategory(siteId, feraCategoryId, selectedDate).catch(() => []),
                    getUserUnitsBySiteAndCategory(siteId, feraCategoryId).catch((): UnitData[] => []),
                ]);
                setFeraEmissionFactors(feraFactorsData);
                // Merge regular + FERA emissions, marking FERA rows
                const feraRows = flattenEmissions(feraEmissionsData).map((r) => ({ ...r, _isFeraRow: true }));
                setEmissions([...flattenEmissions(emissionsData), ...feraRows]);
                // Merge FERA units into the unit list (deduplicated by unit_name)
                const existingNames = new Set(unitsData.map((u: UnitData) => u.unit_name.toLowerCase()));
                const newFeraUnits = feraUnitsData.filter((u: UnitData) => !existingNames.has(u.unit_name.toLowerCase()));
                if (newFeraUnits.length > 0) {
                    setUnits([...unitsData, ...newFeraUnits]);
                }
            } else {
                setFeraEmissionFactors([]);
                setEmissions(flattenEmissions(emissionsData));
            }

            // Clear stale selections after data reload
            setSelectedEmissionIds(new Set());

            // Fetch upload batches for this site+category
            getEmissionBatches(siteId, selectedCategory).then(setEmissionBatches).catch(() => setEmissionBatches([]));

            // Fetch company category mappings (company_category_name → emission_category_name)
            if (companyId) {
                try {
                    const mappings = await getMappingsByCompany(companyId, siteId, selectedCategory);
                    setCompanyMappings(mappings);
                } catch {
                    setCompanyMappings([]);
                }
            } else {
                setCompanyMappings([]);
            }
        } catch (error) {
            console.error("Error fetching data:", error);
            resetDataState();
        } finally {
            setLoading(false);
        }
    }, [selectedCategory, selectedDate, siteId, companyId, feraCategoryId]);

    useEffect(() => {
        setCurrentPage(1);
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
                    setExtraFields(config.extra_fields || []);
                }
                setEmissionFactors(factors);
                setUnits(unitsData);
                // Also fetch FERA factors
                if (feraCategoryId) {
                    getUserEmissionFactorsBySiteAndCategory(siteId, feraCategoryId, factorYear)
                        .then(setFeraEmissionFactors)
                        .catch(() => setFeraEmissionFactors([]));
                }
            })
            .catch(() => {
                // Non-critical — dropdowns will fall back to text inputs
            });
    }, [siteId, selectedCategory, selectedDate, feraCategoryId]);

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

    // Determine emission category from mapping based on row values.
    // Returns { key: company_category_name, category: global_category_name } or null.
    const getAutoEmissionCategory = (row: ModalRow): { key: string; category: string } | null => {
        if (Object.keys(emissionCategoryMapping).length === 0) {
            return null;
        }

        // Walk the dependency chain from root to leaf to build the mapping key.
        // For a 3-dim config like Activity Type → Type of Waste → Disposal Method,
        // the mapping key is "Metal|Any metals|Open loop" (all dimension values).

        // Find root columns (parents that are not children of anything)
        const allChildCols = new Set(Object.keys(columnDependencies));
        const allParentCols = new Set(Object.values(columnDependencies));
        const rootCols = [...allParentCols].filter(
            (col) => !allChildCols.has(col),
        );

        if (rootCols.length === 0) {
            // No dependencies — try flat mapping with all select column values
            const selectCols = dynamicColumns.filter(
                (col) => col.column_type === "select",
            );
            for (const col of selectCols) {
                const val = getRowValue(row, col.column_name);
                if (!val) continue;
                const label = getOptionLabel(
                    col.column_name,
                    col.pk_id,
                    String(val),
                );
                if (emissionCategoryMapping[label]) {
                    return { key: label, category: emissionCategoryMapping[label] };
                }
                // Case-insensitive fallback
                const labelLower = label.toLowerCase();
                for (const [key, value] of Object.entries(
                    emissionCategoryMapping,
                )) {
                    if (key.toLowerCase() === labelLower) {
                        return { key, category: value };
                    }
                }
            }
            return null;
        }

        // For each root, walk down the chain collecting labels
        const keyParts: string[] = [];

        const walkChain = (colName: string) => {
            const val = getRowValue(row, colName);
            if (!val) return false;

            const colEntity = dynamicColumns.find(
                (col) =>
                    col.column_name.toLowerCase() === colName.toLowerCase(),
            );
            const label = colEntity
                ? getOptionLabel(
                      colName,
                      colEntity.pk_id,
                      String(val),
                      keyParts.length > 0
                          ? keyParts[keyParts.length - 1]
                          : undefined,
                  )
                : String(val);

            keyParts.push(label);

            // Find children that depend on this column
            for (const [child, parent] of Object.entries(
                columnDependencies,
            )) {
                if (parent === colName) {
                    if (!walkChain(child)) return false;
                }
            }
            return true;
        };

        for (const root of rootCols) {
            if (!walkChain(root)) return null;
        }

        const mappingKey = keyParts.join("|");

        // Exact match
        if (emissionCategoryMapping[mappingKey]) {
            return { key: mappingKey, category: emissionCategoryMapping[mappingKey] };
        }

        // Case-insensitive fallback
        const mappingKeyLower = mappingKey.toLowerCase();
        for (const [key, value] of Object.entries(emissionCategoryMapping)) {
            if (key.toLowerCase() === mappingKeyLower) {
                return { key, category: value };
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

    // The first numeric non-dropdown column is the primary activity data field
    const firstNumericColId = filteredColumns.find(
        (c) => c.column_type === "number" && !isSelectColumn(c),
    )?.pk_id ?? null;

    // ---------------------------------------------------------------------------
    // Modal Handlers
    // ---------------------------------------------------------------------------
    const openModal = () => {
        const initialRow = createModalRow(1, dynamicColumns, extraFields);
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
        const newRow = createModalRow(nextRowId, dynamicColumns, extraFields);
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

                // Auto-compute product for composite distance units (e.g. passenger.km)
                if (
                    columnName.endsWith("__multiplier") ||
                    columnName.endsWith("__distance")
                ) {
                    const baseCol = columnName.replace(
                        /__(?:multiplier|distance)$/,
                        "",
                    );
                    const m = parseFloat(
                        (updatedRow[`${baseCol}__multiplier`] as string) || "",
                    );
                    const d = parseFloat(
                        (updatedRow[`${baseCol}__distance`] as string) || "",
                    );
                    updatedRow[baseCol] =
                        !isNaN(m) && !isNaN(d) && m > 0 && d > 0
                            ? (Math.round(m * d * 100) / 100).toString()
                            : "";
                }

                // Check if we should auto-set the emission_category
                const autoResult = getAutoEmissionCategory(updatedRow);
                if (autoResult) {
                    updatedRow.emission_category = autoResult.category;
                    updatedRow._ecmKey = autoResult.key;
                } else if (
                    isParentColumn(columnName) ||
                    isDependentColumn(columnName)
                ) {
                    // Clear emission_category when a mapped column changes but no valid mapping exists yet
                    // This ensures the old value doesn't persist when user changes dropdown selections
                    updatedRow.emission_category = "";
                    updatedRow._ecmKey = "";
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

                // Strip composite-unit helper keys — backend only needs the computed product
                for (const key of Object.keys(activityData)) {
                    if (
                        key.endsWith("__multiplier") ||
                        key.endsWith("__distance")
                    ) {
                        delete activityData[key];
                    }
                }

                // Extract extra_data before stripping internal fields
                const extraData = activityData._extra_data || {};
                delete activityData._extra_data;

                // Strip internal flags before sending to backend
                delete activityData._isFeraRow;
                delete activityData._ecmKey;

                // Skip FERA rows — backend auto-creates them
                if (row._isFeraRow) continue;

                const result = await createEmission({
                    site_id: siteId,
                    category_id: selectedCategory,
                    activity_data: activityData,
                    extra_data: extraData,
                    total_emission: 0,
                    unit: "kg CO2e",
                    date_of_reporting: rowDate || dateOfReporting,
                    activity_data_unit: activity_data_unit || undefined,
                });

                newEmissions.push(flattenEmission(result.emission));
                // If backend auto-created a FERA entry, add it too
                if (result.fera_emission) {
                    const feraFlat = flattenEmission(result.fera_emission);
                    feraFlat._isFeraRow = true;
                    newEmissions.push(feraFlat);
                }
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
            const result = await deleteEmission(row.pk_id);
            // Backend deletes both regular + linked FERA, remove all from local state
            const deletedIds = new Set(result?.deleted_ids || [row.pk_id]);
            // Also remove by fera_linked_id in case response doesn't include them
            if (row.fera_linked_id) deletedIds.add(row.fera_linked_id);
            setEmissions((prev) =>
                prev.filter((item) => !deletedIds.has(item.pk_id) && item.fera_linked_id !== row.pk_id),
            );
        } catch (error) {
            console.error("Error deleting emission:", error);
            throw error;
        }
    };

    const handleViewFactor = async (row: EmissionRow) => {
        setFactorModalEmission(row);
        setFactorModalData(null);
        setFactorModalOpen(true);
        setFactorLoading(true);
        try {
            const result = await getEmissionFactorForEmission(row.pk_id);
            setFactorModalData(result.emission_factor);
        } catch (error) {
            console.error("Error fetching emission factor:", error);
        } finally {
            setFactorLoading(false);
        }
    };

    const handleBulkDelete = async () => {
        if (selectedEmissionIds.size === 0) return;
        if (!confirm(`Delete ${selectedEmissionIds.size} selected emission(s)?`)) return;
        setBulkDeleting(true);
        try {
            const res = await bulkDeleteEmissions(Array.from(selectedEmissionIds));
            const deletedIds = new Set<number>(res.deleted_ids || Array.from(selectedEmissionIds));
            setEmissions((prev) => prev.filter((e) => !deletedIds.has(e.pk_id) && !deletedIds.has(e.fera_linked_id as number)));
            setSelectedEmissionIds(new Set());
        } catch (error) {
            console.error("Error bulk deleting emissions:", error);
        } finally {
            setBulkDeleting(false);
        }
    };

    const handleDeleteBatch = async (batchId: string) => {
        const batch = emissionBatches.find((b) => b.upload_batch_id === batchId);
        if (!confirm(`Delete all ${batch?.count ?? "?"} emission(s) from this upload?`)) return;
        setDeletingBatchId(batchId);
        try {
            await deleteEmissionsByBatch(batchId);
            await fetchData();
        } catch (error) {
            console.error("Error deleting batch:", error);
        } finally {
            setDeletingBatchId(null);
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
        setCollapsedInvoices(new Set());
        setConfirmDeleteInvoice(null);
        setSaveError(null);
    };

    const toggleInvoiceCollapse = (invoiceIndex: number) => {
        setCollapsedInvoices((prev) => {
            const next = new Set(prev);
            if (next.has(invoiceIndex)) next.delete(invoiceIndex);
            else next.add(invoiceIndex);
            return next;
        });
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

    const handleAddInvoiceRow = () => {
        setInvoiceRows((prev) => {
            const nextId = prev.length > 0 ? Math.max(...prev.map((r) => r.id)) + 1 : 1;
            const nextInvoiceIndex = prev.length > 0
                ? Math.max(...prev.map((r) => r._invoiceIndex ?? 0)) + 1
                : 0;
            const row: ModalRow = { id: nextId, _invoiceIndex: nextInvoiceIndex };
            if (filteredColumns.length > 0) {
                filteredColumns.forEach((col) => { row[col.column_name] = ""; });
            } else {
                row["Activity Data"] = "";
            }
            return [...prev, row];
        });
    };

    const handleAddItemToInvoice = (invoiceIndex: number) => {
        setInvoiceRows((prev) => {
            const nextId = prev.length > 0 ? Math.max(...prev.map((r) => r.id)) + 1 : 1;
            // Copy shared fields (vendor, date) from the first row in this invoice group
            const sibling = prev.find((r) => (r._invoiceIndex ?? 0) === invoiceIndex);
            const row: ModalRow = { id: nextId, _invoiceIndex: invoiceIndex };
            if (filteredColumns.length > 0) {
                filteredColumns.forEach((col) => { row[col.column_name] = ""; });
            } else {
                row["Activity Data"] = "";
            }
            if (sibling) {
                row._vendorName = sibling._vendorName;
                row.date_of_reporting = sibling.date_of_reporting;
            }
            return [...prev, row];
        });
    };

    const handleRemoveInvoiceRow = (rowId: number) => {
        setInvoiceRows((prev) => prev.filter((r) => r.id !== rowId));
    };

    const handleRemoveInvoiceGroup = (invoiceIndex: number) => {
        const count = invoiceRows.filter((r) => (r._invoiceIndex ?? 0) === invoiceIndex).length;
        if (count > 1) {
            setConfirmDeleteInvoice(invoiceIndex);
            return;
        }
        doRemoveInvoiceGroup(invoiceIndex);
    };

    const doRemoveInvoiceGroup = (invoiceIndex: number) => {
        setConfirmDeleteInvoice(null);
        setCollapsedInvoices((prev) => {
            const next = new Set(prev);
            next.delete(invoiceIndex);
            return next;
        });
        setInvoiceRows((prev) => prev.filter((r) => (r._invoiceIndex ?? 0) !== invoiceIndex));
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
                    _invoiceIndex: ___,
                    _activityDescription: ____,
                    _invoiceNumber: _____,
                    _invoiceDate: ______,
                    _totalAmount: _______,
                    _currency: ________,
                    ...activityData
                } = row;

                // Extract extra_data and strip internal fields before sending
                const extraData = activityData._extra_data || {};
                delete activityData._extra_data;
                delete activityData._ecmKey;
                delete activityData._isFeraRow;

                const result = await createEmission({
                    site_id: siteId,
                    category_id: selectedCategory,
                    activity_data: activityData,
                    extra_data: extraData,
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

                    // Convert OCR-returned labels to dropdown option IDs for
                    // select columns. Process in dependency order (parents
                    // before children) so dependent option lookups work.
                    const selectCols = filteredColumns.filter(
                        (c) => c.column_type === "select",
                    );
                    const resolved = new Set<string>();
                    let convertChanged = true;
                    while (convertChanged) {
                        convertChanged = false;
                        for (const col of selectCols) {
                            if (resolved.has(col.column_name)) continue;
                            const parentColName =
                                columnDependencies[col.column_name];
                            // Skip if parent not yet resolved
                            if (parentColName && !resolved.has(parentColName))
                                continue;

                            const rawValue = row[col.column_name];
                            if (rawValue && rawValue !== "") {
                                const parentId = parentColName
                                    ? String(row[parentColName] ?? "")
                                    : undefined;
                                const options = getColumnDropdownOptions(
                                    col.column_name,
                                    col.pk_id,
                                    parentId,
                                );
                                const rawLower =
                                    String(rawValue).toLowerCase();
                                const match = options.find(
                                    (opt) =>
                                        opt.label.toLowerCase() === rawLower,
                                );
                                if (match) {
                                    row[col.column_name] = String(match.id);
                                }
                            }

                            resolved.add(col.column_name);
                            convertChanged = true;
                        }
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

                    // Auto-map emission_category from dropdown selections
                    // (e.g., Waste Type "Sludge" + Disposal Method "Recover"
                    // → "Sludge - Recover"). This overrides the OCR-returned
                    // emission_category which may be inaccurate.
                    const autoResult = getAutoEmissionCategory(row);
                    if (autoResult) {
                        row.emission_category = autoResult.category;
                        row._ecmKey = autoResult.key;
                    } else if (row.emission_category && availableFactors.length > 0) {
                        // Fallback: normalize OCR emission_category to match a configured factor name
                        const ecLower = String(row.emission_category).toLowerCase();
                        const match = availableFactors.find(
                            (f) => f.emission_category_name.toLowerCase() === ecLower,
                        );
                        if (match) row.emission_category = match.emission_category_name;
                    }

                    if (em.date_of_reporting)
                        row.date_of_reporting = em.date_of_reporting;

                    row._vendorName = em.vendor_name ?? undefined;
                    row._invoiceIndex = em.invoice_index ?? 0;
                    row._activityDescription = em.activity_data?.description ?? em.activity_data?.["Activity Data"] ?? undefined;

                    // Carry invoice-level metadata from response.data
                    const invoiceData = response.data?.[em.invoice_index ?? 0];
                    if (invoiceData) {
                        row._invoiceNumber = invoiceData.invoice_number ?? undefined;
                        row._invoiceDate = invoiceData.billing_month_end ?? invoiceData.invoice_date ?? undefined;
                        row._totalAmount = invoiceData.total_amount ?? undefined;
                        row._currency = invoiceData.currency ?? undefined;
                    }

                    return row;
                });

                setInvoiceRows(rows);
                setInvoiceCloudinaryUrl(response.cloudinary_url ?? null);
                // Collect any failed validation checks as user-visible warnings.
                // Skip per-activity category-match warnings — those are shown
                // inline on each row's emission category dropdown instead.
                const warnings = (response.validations ?? [])
                    .flat()
                    .filter((v) => !v.ok && v.message && v.check !== "activity_unit_defined")
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
                    row._invoiceIndex = em.invoice_index ?? 0;
                    row._activityDescription = em.activity_data?.description ?? em.activity_data?.["Activity Data"] ?? undefined;

                    const invoiceData = response.data?.[em.invoice_index ?? 0];
                    if (invoiceData) {
                        row._invoiceNumber = invoiceData.invoice_number ?? undefined;
                        row._invoiceDate = invoiceData.billing_month_end ?? invoiceData.invoice_date ?? undefined;
                        row._totalAmount = invoiceData.total_amount ?? undefined;
                        row._currency = invoiceData.currency ?? undefined;
                    }
                    return row;
                });

                setInvoiceRows(rows);
                setInvoiceCloudinaryUrl(response.cloudinary_url ?? invoice.cloudinary_url);
                // Collect any failed validation checks as user-visible warnings.
                // Skip per-activity category-match warnings — shown inline instead.
                const warnings = (response.validations ?? [])
                    .flat()
                    .filter((v) => !v.ok && v.message && v.check !== "activity_unit_defined")
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
            render: (value: string, row: EmissionRow) => {
                if (row._isFeraRow) {
                    return `${value || ""} (FERA)`;
                }
                return value || "";
            },
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
        ...extraFields.map((ef) => ({
            key: `_extra_${ef.key}` as keyof EmissionRow,
            label: ef.label,
            editable: false,
            type: "text" as const,
            render: (_: unknown, row: EmissionRow) => {
                return row._extra_data?.[ef.key] || "";
            },
        })),
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
        setExtraFields([]);
        setEmissions([]);
        setEmissionFactors([]);
        setFeraEmissionFactors([]);
        setUnits([]);
        setCompanyMappings([]);
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
                className={`grid grid-cols-1 gap-4 mb-6 ${
                    hasMultipleSites ? "md:grid-cols-4" : "md:grid-cols-3"
                }`}>
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

                    {/* Download Emissions as Excel */}
                    {emissions.length > 0 && (
                        <button
                            onClick={() => downloadEmissions({
                                siteId: siteId,
                                categoryId: selectedCategory || undefined,
                                date: selectedDate || undefined,
                            })}
                            className="px-4 py-2 bg-white border border-gray-400 text-gray-700 rounded hover:bg-gray-50 flex items-center gap-2">
                            <svg
                                className="w-4 h-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24">
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                                />
                            </svg>
                            Download
                        </button>
                    )}

                    {/* Bulk Delete Selected */}
                    {selectedEmissionIds.size > 0 && (
                        <button
                            onClick={handleBulkDelete}
                            disabled={bulkDeleting}
                            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400 flex items-center gap-2">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            {bulkDeleting ? "Deleting..." : `Delete Selected (${selectedEmissionIds.size})`}
                        </button>
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
                className="max-w-4xl! max-h-[85vh]!">
                <div className="space-y-4">
                    {modalRows.map((row, rowIdx) => {
                        const visibleExtraFields = extraFields.filter((ef) => {
                            const rowCategory = row.emission_category || "";
                            return !ef.show_for || ef.show_for.length === 0
                                || ef.show_for.some((s) => rowCategory.toLowerCase().includes(s.toLowerCase()));
                        });
                        const matchedFactor = row.emission_category && !row._isFeraRow
                            ? getEmissionFactor(row.emission_category) : undefined;
                        const emissionResult = row._isFeraRow ? calculateFeraEmission(row) : calculateEmission(row);

                        return (
                        <div key={row.id} className={`border rounded-lg shadow-sm ${row._isFeraRow ? "border-purple-300 bg-purple-50/30" : "border-gray-200 bg-white"}`}>
                            {/* Card Header */}
                            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gray-50 rounded-t-lg">
                                <div className="flex items-center gap-3">
                                    <span className="text-sm font-semibold text-gray-600">Entry {rowIdx + 1}</span>
                                    {row._isFeraRow && (
                                        <span className="px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 rounded-full">FERA</span>
                                    )}
                                </div>
                                <button
                                    onClick={() => handleRemoveModalRow(row.id)}
                                    disabled={modalRows.length === 1}
                                    className="text-red-500 hover:text-red-700 disabled:text-gray-300 text-sm font-medium"
                                    title="Remove entry">
                                    Remove
                                </button>
                            </div>

                            <div className="p-4 space-y-4">
                                {/* Section 1: Emission Category (full width — most important field) */}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Emission Category</label>
                                    {row._isFeraRow ? (
                                        <div className="px-3 py-2.5 rounded-md text-sm font-semibold bg-purple-100 text-purple-800 border border-purple-300">
                                            {row.emission_category} (FERA)
                                        </div>
                                    ) : Object.keys(emissionCategoryMapping).length > 0 ? (
                                        (() => {
                                            const companyCatName = row._ecmKey as string | undefined;
                                            const displayName = companyCatName || row.emission_category;
                                            return (
                                                <div className="flex items-center gap-1.5">
                                                    <div
                                                        title={row.emission_category ? `Global: ${row.emission_category}` : "Select dropdown values to auto-determine"}
                                                        className={`flex-1 min-w-0 px-3 py-2.5 rounded-md text-sm font-medium truncate cursor-help ${
                                                            row.emission_category
                                                                ? "bg-green-50 text-green-800 border border-green-300"
                                                                : "bg-gray-50 text-gray-400 border border-gray-200 italic"
                                                        }`}
                                                    >
                                                        {displayName || "Auto-determined from selections below"}
                                                    </div>
                                                    {row.emission_category && companyCatName && companyCatName !== row.emission_category && (
                                                        <div
                                                            className="shrink-0 w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center cursor-help"
                                                            onMouseEnter={(e) => {
                                                                const rect = e.currentTarget.getBoundingClientRect();
                                                                setTooltip({ text: `Global: ${row.emission_category}`, x: rect.left + rect.width / 2, y: rect.top });
                                                            }}
                                                            onMouseLeave={() => setTooltip(null)}
                                                        >
                                                            i
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })()
                                    ) : (
                                        <div className="flex items-center gap-1.5">
                                            <select
                                                value={row.emission_category || ""}
                                                onChange={(e) => handleModalRowChange(row.id, "emission_category", e.target.value)}
                                                className="w-full border border-gray-300 px-3 py-2.5 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400">
                                                <option value="">Select Emission Category...</option>
                                                {companyMappings.length > 0
                                                    ? companyMappings.map((m) => (
                                                        <option key={m.id} value={m.global_category_name}>{m.company_category_name}</option>
                                                    ))
                                                    : emissionFactors.map((factor) => (
                                                        <option key={factor.emission_factor_id} value={factor.emission_category_name}>{factor.emission_category_name}</option>
                                                    ))
                                                }
                                            </select>
                                            {row.emission_category && (() => {
                                                const companyMapping = companyMappings.find((m) => m.global_category_name === row.emission_category);
                                                const tooltipText = companyMapping
                                                    ? `Global EF Name: ${companyMapping.global_category_name}`
                                                    : `EF Category: ${row.emission_category}`;
                                                return (
                                                    <div
                                                        className="shrink-0 w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center cursor-help"
                                                        onMouseEnter={(e) => {
                                                            const rect = e.currentTarget.getBoundingClientRect();
                                                            setTooltip({ text: tooltipText, x: rect.left + rect.width / 2, y: rect.top });
                                                        }}
                                                        onMouseLeave={() => setTooltip(null)}>
                                                        i
                                                    </div>
                                                );
                                            })()}
                                        </div>
                                    )}
                                    {/* Inline Emission Factor Info */}
                                    {matchedFactor && (
                                        <div className="mt-1.5 flex items-center gap-2 text-xs text-gray-500">
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded font-mono">
                                                EF: {matchedFactor.factor_value}
                                            </span>
                                            <span>per {matchedFactor.denominator_unit || "unit"}</span>
                                            <span className="text-gray-300">|</span>
                                            <span>Year: {matchedFactor.year}</span>
                                            {matchedFactor.global_category_name && (
                                                <>
                                                    <span className="text-gray-300">|</span>
                                                    <span className="truncate max-w-[200px]" title={matchedFactor.global_category_name}>{matchedFactor.global_category_name}</span>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Section 2: Activity Data — dynamic columns + unit in a grid */}
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">Activity Data</label>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                        {/* Dynamic Columns */}
                                        {filteredColumns.map((col) => {
                                            const parentColName = getParentColumnName(col.column_name);
                                            const parentValue = parentColName ? getRowValue(row, parentColName) : undefined;
                                            const options = getColumnDropdownOptions(col.column_name, col.pk_id, parentValue);
                                            const showAsSelect = isSelectColumn(col) && options.length > 0;
                                            const isDisabledDependent = isDependentColumn(col.column_name) && !parentValue;

                                            return (
                                                <div key={col.pk_id}>
                                                    <label className="block text-xs text-gray-500 mb-1">{col.column_name}</label>
                                                    {showAsSelect ? (
                                                        <select
                                                            value={row[col.column_name] || ""}
                                                            onChange={(e) => handleModalRowChange(row.id, col.column_name, e.target.value)}
                                                            disabled={isDisabledDependent}
                                                            className={`w-full border border-gray-300 px-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                                                                isDisabledDependent ? "bg-gray-100 cursor-not-allowed" : ""
                                                            }`}>
                                                            <option value="">
                                                                {isDisabledDependent
                                                                    ? `Select ${toColumnTitle(parentColName!)} first`
                                                                    : `Select ${toColumnTitle(col.column_name)}`}
                                                            </option>
                                                            {options.map((option) => (
                                                                <option key={option.id} value={option.id}>{option.label}</option>
                                                            ))}
                                                        </select>
                                                    ) : (() => {
                                                        const composite = col.pk_id === firstNumericColId ? parseCompositeUnit(row.activity_data_unit) : null;
                                                        const isDistCol = col.pk_id === firstNumericColId && isDistanceUnit(row.activity_data_unit);

                                                        if (composite && isDistCol) {
                                                            const mulKey = `${col.column_name}__multiplier`;
                                                            const distKey = `${col.column_name}__distance`;
                                                            const mulVal = parseFloat((row[mulKey] as string) || "");
                                                            const distVal = parseFloat((row[distKey] as string) || "");
                                                            const product = !isNaN(mulVal) && !isNaN(distVal) && mulVal > 0 && distVal > 0
                                                                ? Math.round(mulVal * distVal * 100) / 100 : null;

                                                            return (
                                                                <div className="space-y-1">
                                                                    <div className="flex items-center gap-1">
                                                                        <input type="number" value={row[mulKey] || ""}
                                                                            onChange={(e) => handleModalRowChange(row.id, mulKey, e.target.value)}
                                                                            className="w-20 border border-gray-300 px-2 py-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                                                                            placeholder={composite.multiplier} />
                                                                        <span className="text-gray-400 text-sm shrink-0">×</span>
                                                                        <input type="number" value={row[distKey] || ""}
                                                                            onChange={(e) => handleModalRowChange(row.id, distKey, e.target.value)}
                                                                            className="w-20 border border-gray-300 px-2 py-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                                                                            placeholder={composite.distance} />
                                                                        <button type="button"
                                                                            onClick={() => setDistanceModalState({ open: true, rowId: row.id, colName: col.column_name })}
                                                                            className="flex items-center gap-1 px-2 py-2 text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 shrink-0"
                                                                            title="Calculate distance from map">
                                                                            <MapPin size={12} /> Map
                                                                        </button>
                                                                    </div>
                                                                    {product !== null && (
                                                                        <div className="text-xs text-gray-500">= {product.toLocaleString()} {row.activity_data_unit}</div>
                                                                    )}
                                                                </div>
                                                            );
                                                        }

                                                        return (
                                                            <div className="flex items-center gap-1">
                                                                <input
                                                                    type={col.column_type === "number" ? "number" : "text"}
                                                                    value={row[col.column_name] || ""}
                                                                    onChange={(e) => handleModalRowChange(row.id, col.column_name, e.target.value)}
                                                                    className="w-full border border-gray-300 px-3 py-2 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                                                                    placeholder={col.column_name} />
                                                                {isDistCol && (
                                                                    <button type="button"
                                                                        onClick={() => setDistanceModalState({ open: true, rowId: row.id, colName: col.column_name })}
                                                                        className="flex items-center gap-1 px-2 py-2 text-xs text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 shrink-0"
                                                                        title="Calculate distance from map">
                                                                        <MapPin size={12} /> Map
                                                                    </button>
                                                                )}
                                                            </div>
                                                        );
                                                    })()}
                                                </div>
                                            );
                                        })}

                                        {/* Activity Unit */}
                                        <div>
                                            <label className="block text-xs text-gray-500 mb-1">Unit</label>
                                            <UnitSelector
                                                currentUnit={row.activity_data_unit}
                                                expectedUnit={row._isFeraRow
                                                    ? getFeraExpectedUnit(row.emission_category || "")
                                                    : getExpectedUnit(row.emission_category || "")
                                                }
                                                units={units}
                                                onChange={(value) => handleModalRowChange(row.id, "activity_data_unit", value)}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Section 3: Supplementary Fields */}
                                {visibleExtraFields.length > 0 && (
                                    <div>
                                        <label className="block text-xs font-semibold text-blue-600 uppercase tracking-wide mb-1.5">Supplementary Details</label>
                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-3 bg-blue-50/30 rounded-md border border-blue-100">
                                            {visibleExtraFields.map((ef) => {
                                                const updateExtraField = (val: string) => {
                                                    setModalRows((prev) =>
                                                        prev.map((r) =>
                                                            r.id === row.id
                                                                ? { ...r, _extra_data: { ...r._extra_data, [ef.key]: val } }
                                                                : r,
                                                        ),
                                                    );
                                                };
                                                const isWide = ef.type === "textarea";
                                                return (
                                                    <div key={ef.key} className={isWide ? "col-span-2 md:col-span-3" : ""}>
                                                        <label className="block text-xs text-gray-500 mb-1">
                                                            {ef.label}{ef.required && <span className="text-red-500 ml-0.5">*</span>}
                                                        </label>
                                                        {ef.type === "select" ? (
                                                            <select
                                                                className="w-full border border-gray-300 bg-white rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                                                                value={row._extra_data?.[ef.key] || ""}
                                                                onChange={(e) => updateExtraField(e.target.value)}>
                                                                <option value="">Select...</option>
                                                                {ef.options?.map((opt) => (
                                                                    <option key={opt} value={opt}>{opt}</option>
                                                                ))}
                                                            </select>
                                                        ) : ef.type === "textarea" ? (
                                                            <textarea
                                                                className="w-full border border-gray-300 bg-white rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                                                                rows={2}
                                                                value={row._extra_data?.[ef.key] || ""}
                                                                placeholder={ef.label}
                                                                onChange={(e) => updateExtraField(e.target.value)} />
                                                        ) : (
                                                            <input
                                                                type={ef.type === "number" ? "number" : ef.type === "date" ? "date" : "text"}
                                                                className="w-full border border-gray-300 bg-white rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                                                                value={row._extra_data?.[ef.key] || ""}
                                                                placeholder={ef.label}
                                                                onChange={(e) => updateExtraField(e.target.value)} />
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Section 4: Emission Result — prominent display */}
                                <div className="flex items-center gap-4 px-4 py-3 bg-gray-50 rounded-md border border-gray-100">
                                    <div className="flex items-center gap-2 flex-1">
                                        <span className="text-sm font-medium text-gray-600">Calculated Emission:</span>
                                        {emissionResult.value !== null ? (
                                            <span className={`text-lg font-bold ${emissionResult.status === "converted" ? "text-yellow-600" : "text-green-700"}`}>
                                                {emissionResult.value.toFixed(2)} <span className="text-sm font-normal text-gray-500">tCO2e</span>
                                            </span>
                                        ) : (
                                            <span className="text-sm text-gray-400 italic">{emissionResult.status}</span>
                                        )}
                                        {emissionResult.status === "converted" && (
                                            <span className="text-xs text-yellow-600 bg-yellow-50 px-1.5 py-0.5 rounded">(unit converted)</span>
                                        )}
                                    </div>
                                    {isFeraCategory && !row._isFeraRow && row.emission_category && getFeraEmissionFactor(row.emission_category) && (
                                        (() => {
                                            const feraResult = calculateFeraEmission(row);
                                            return feraResult.value !== null ? (
                                                <div className="flex items-center gap-2 px-3 py-1 bg-purple-50 rounded border border-purple-200">
                                                    <span className="text-xs font-medium text-purple-600">FERA:</span>
                                                    <span className={`text-sm font-bold ${feraResult.status === "converted" ? "text-yellow-600" : "text-purple-700"}`}>
                                                        {feraResult.value.toFixed(2)} tCO2e
                                                    </span>
                                                </div>
                                            ) : null;
                                        })()
                                    )}
                                </div>
                            </div>
                        </div>
                        );
                    })}
                </div>

                {/* Error Display */}
                {saveError && (
                    <ValidationError
                        error={saveError}
                        onDismiss={() => setSaveError(null)}
                    />
                )}
                {successMsg && (
  <div className="mb-4 flex items-start justify-between gap-3 bg-green-50 border border-green-200 rounded-lg p-3">
    <p className="text-sm text-green-800">{successMsg}</p>
    <button
      className="text-green-700 hover:text-green-900 text-sm"
      onClick={() => setSuccessMsg(null)}
    >
      ✕
    </button>
  </div>
)}

                {/* Modal Actions */}
                <div className="flex justify-between mt-4">
                    <div className="flex gap-2">
                        <button
                            onClick={handleAddModalRow}
                            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">
                            + Add Row
                        </button>
                        {isFeraCategory && feraEmissionFactors.length > 0 && (
                            <span className="px-3 py-2 text-sm text-purple-700 bg-purple-50 rounded border border-purple-200">
                                FERA auto-calculated
                            </span>
                        )}
                    </div>

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

            {/* Distance Calculator Modal */}
            {distanceModalState && (
                <DistanceCalculatorModal
                    isOpen={distanceModalState.open}
                    onClose={() => setDistanceModalState(null)}
                    targetUnit={
                        modalRows.find((r) => r.id === distanceModalState.rowId)
                            ?.activity_data_unit || "km"
                    }
                    onDistanceCalculated={(distance) => {
                        const unit = modalRows.find(
                            (r) => r.id === distanceModalState.rowId,
                        )?.activity_data_unit;
                        const composite = parseCompositeUnit(unit);
                        const targetCol = composite
                            ? `${distanceModalState.colName}__distance`
                            : distanceModalState.colName;
                        handleModalRowChange(
                            distanceModalState.rowId,
                            targetCol,
                            distance.toString(),
                        );
                        setDistanceModalState(null);
                    }}
                />
            )}

            {selectedCategory && selectedDate && siteId && (
                <BulkUploadModal
                    isOpen={bulkUploadOpen}
                    onClose={() => setBulkUploadOpen(false)}
                    dynamicColumns={dynamicColumns}
                    emissionFactors={emissionFactors}
                    units={units}
                    extraFields={extraFields}
                    siteId={siteId}
                    categoryId={selectedCategory}
                    companyId={companyId ?? undefined}
                    selectedDate={selectedDate}
                    getExpectedUnit={getExpectedUnit}
                    calculateEmission={calculateEmission}
                    getAutoEmissionCategory={getAutoEmissionCategory}
                    // onImportComplete={(newEmissions) => {
                    //     setEmissions((prev) => [...newEmissions, ...prev]);
                    // }}
                     onImportComplete={async () => {
    setSuccessMsg("Saved successfully. Imported data is now available in the table.");
    await fetchData();          
    setCurrentPage(1);          
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
                        {/* Upload Batches Panel */}
                        {emissionBatches.length > 0 && (
                            <div className="mb-3">
                                <button
                                    onClick={() => setShowEmissionBatches(!showEmissionBatches)}
                                    className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors"
                                >
                                    <svg className={`w-4 h-4 transition-transform ${showEmissionBatches ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                    </svg>
                                    Upload Batches ({emissionBatches.length})
                                </button>

                                {showEmissionBatches && (
                                    <div className="mt-2 border border-orange-200 rounded-lg overflow-hidden">
                                        <table className="w-full text-sm">
                                            <thead>
                                                <tr className="bg-orange-50 text-orange-800">
                                                    <th className="px-4 py-2 text-left font-medium">Category</th>
                                                    <th className="px-4 py-2 text-left font-medium">Rows</th>
                                                    <th className="px-4 py-2 text-left font-medium">Uploaded</th>
                                                    <th className="px-4 py-2 text-right font-medium">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {emissionBatches.map((batch) => (
                                                    <tr key={batch.upload_batch_id} className="border-t border-orange-100 hover:bg-orange-50/50">
                                                        <td className="px-4 py-2 text-gray-700">{batch.category_name}</td>
                                                        <td className="px-4 py-2">
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                                                                {batch.count}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-2 text-gray-500">
                                                            {new Date(batch.uploaded_at).toLocaleDateString(undefined, {
                                                                month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
                                                            })}
                                                        </td>
                                                        <td className="px-4 py-2 text-right">
                                                            <button
                                                                onClick={() => handleDeleteBatch(batch.upload_batch_id)}
                                                                disabled={deletingBatchId === batch.upload_batch_id}
                                                                className="px-3 py-1 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 disabled:bg-gray-400 transition-colors"
                                                            >
                                                                {deletingBatchId === batch.upload_batch_id ? "Deleting..." : "Delete Batch"}
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        )}
                        <Table<EmissionRow>
                            data={paginatedEmissions}
                            columns={tableColumns}
                            keyField="pk_id"
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                            loading={loading}
                            showActions={true}
                            selectedIds={selectedEmissionIds}
                            onSelectionChange={setSelectedEmissionIds}
                            isRowSelectable={(row) => !row._isFeraRow && row.status !== "approved"}
                            rowClassName={(row) => row._isFeraRow ? "bg-purple-50" : ""}
                            renderActions={(
                                row,
                                { editButton, deleteButton },
                            ) => {
                                const viewFactorButton = (
                                    <button
                                        onClick={() => handleViewFactor(row)}
                                        className="px-3 py-1 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700"
                                        title="View Emission Factor">
                                        View
                                    </button>
                                );
                                const docsButton = (
                                    <button
                                        onClick={() => handleOpenDocuments(row)}
                                        className="px-3 py-1 bg-purple-600 text-white rounded text-sm hover:bg-purple-700"
                                        title="Manage Documents">
                                        Docs
                                    </button>
                                );

                                // FERA rows are auto-managed — no individual actions
                                if (row._isFeraRow) {
                                    return (
                                        <span className="text-xs text-purple-600 italic">
                                            Auto (FERA)
                                        </span>
                                    );
                                }

                                if (row.status === "approved") {
                                    return (
                                        <div className="flex flex-col gap-1">
                                            <span className="text-sm text-green-700">
                                                Approved by{" "}
                                                {row.reviewed_by?.name ||
                                                    "Manager"}
                                            </span>
                                            <div className="flex gap-2">
                                                {viewFactorButton}
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
                                                {viewFactorButton}
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
                                        {viewFactorButton}
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
                title={`Review Extracted Invoice Data (${new Set(invoiceRows.map((r) => r._invoiceIndex ?? 0)).size} invoice${new Set(invoiceRows.map((r) => r._invoiceIndex ?? 0)).size !== 1 ? "s" : ""}, ${invoiceRows.length} ${invoiceRows.length !== 1 ? "entries" : "entry"})`}
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
                    {(() => {
                        // Group rows by invoice_index so multi-activity invoices render under one card
                        const grouped: { invoiceIndex: number; rows: ModalRow[] }[] = [];
                        const indexMap = new Map<number, ModalRow[]>();
                        for (const row of invoiceRows) {
                            const idx = row._invoiceIndex ?? 0;
                            if (!indexMap.has(idx)) {
                                const arr: ModalRow[] = [];
                                indexMap.set(idx, arr);
                                grouped.push({ invoiceIndex: idx, rows: arr });
                            }
                            indexMap.get(idx)!.push(row);
                        }

                        if (grouped.length === 0) {
                            return (
                                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                    </svg>
                                    <p className="text-sm font-medium">No entries yet</p>
                                    <p className="text-xs mt-1">Add an invoice or entry below to get started</p>
                                </div>
                            );
                        }

                        return grouped.map((group, groupIdx) => {
                            const firstRow = group.rows[0];
                            const vendorName = firstRow?._vendorName;
                            const invoiceNumber = firstRow?._invoiceNumber;
                            const invoiceDate = firstRow?._invoiceDate;
                            const totalAmount = firstRow?._totalAmount;
                            const currency = firstRow?._currency;
                            const isMultiActivity = group.rows.length > 1;
                            const isCollapsed = collapsedInvoices.has(group.invoiceIndex);

                            return (
                                <div
                                    key={group.invoiceIndex}
                                    className="border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden">
                                    {/* Invoice-level header */}
                                    <div
                                        className="flex items-center gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200 cursor-pointer select-none"
                                        onClick={() => toggleInvoiceCollapse(group.invoiceIndex)}>
                                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-600 text-white text-xs font-bold shrink-0">
                                            {groupIdx + 1}
                                        </span>
                                        <div className="flex flex-col min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm font-semibold text-gray-700 truncate">
                                                    {vendorName ?? `Invoice ${groupIdx + 1}`}
                                                </span>
                                                {invoiceNumber && (
                                                    <span className="text-xs text-gray-400 truncate">
                                                        #{invoiceNumber}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 mt-0.5">
                                                {invoiceDate && (
                                                    <span className="text-xs text-gray-400">
                                                        {new Date(invoiceDate + "T00:00:00").toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                                                    </span>
                                                )}
                                                {totalAmount != null && (
                                                    <span className="text-xs text-gray-500 font-medium">
                                                        {currency ?? ""} {totalAmount.toLocaleString()}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        {isMultiActivity && (
                                            <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full shrink-0">
                                                {group.rows.length} items
                                            </span>
                                        )}
                                        {/* Collapse chevron */}
                                        <svg
                                            xmlns="http://www.w3.org/2000/svg"
                                            className={`ml-auto h-4 w-4 text-gray-400 transition-transform shrink-0 ${isCollapsed ? "" : "rotate-180"}`}
                                            viewBox="0 0 20 20"
                                            fill="currentColor">
                                            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                                        </svg>
                                        <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); handleRemoveInvoiceGroup(group.invoiceIndex); }}
                                            className="text-gray-400 hover:text-red-500 transition-colors shrink-0"
                                            title="Remove entire invoice">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                            </svg>
                                        </button>
                                    </div>

                                    {/* Inline delete confirmation popup */}
                                    {confirmDeleteInvoice === group.invoiceIndex && (
                                        <div className="flex items-center justify-between gap-3 px-5 py-3 bg-red-50 border-b border-red-200">
                                            <p className="text-sm text-red-700">
                                                Remove this invoice and all {group.rows.length} items?
                                            </p>
                                            <div className="flex gap-2 shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={() => setConfirmDeleteInvoice(null)}
                                                    className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                                                    Cancel
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => doRemoveInvoiceGroup(group.invoiceIndex)}
                                                    className="px-3 py-1.5 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors">
                                                    Delete
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Collapsible content */}
                                    {!isCollapsed && (
                                    <>
                                    {/* Render each activity row within this invoice */}
                                    {group.rows.map((row, actIdx) => {
                                        const {
                                            id,
                                            emission_category,
                                            activity_data_unit,
                                            date_of_reporting,
                                            _ocrUnit,
                                            _vendorName: _vn,
                                            _invoiceIndex: _ii,
                                            _activityDescription,
                                            _invoiceNumber: _in,
                                            _invoiceDate: _id,
                                            _totalAmount: _ta,
                                            _currency: _cu,
                                            ...activityFields
                                        } = row;
                                        return (
                                            <div key={id} className={isMultiActivity ? "border-b border-gray-100 last:border-b-0" : ""}>
                                                {/* Activity sub-header for multi-activity invoices */}
                                                {isMultiActivity && (
                                                    <div className="flex items-center gap-2 px-5 py-2 bg-gray-50/50 border-b border-gray-100">
                                                        <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-200 text-gray-600 text-xs font-medium shrink-0">
                                                            {actIdx + 1}
                                                        </span>
                                                        <span className="text-xs font-medium text-gray-600">
                                                            {_activityDescription || `Item ${actIdx + 1}`}
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemoveInvoiceRow(id)}
                                                            className="ml-auto text-gray-400 hover:text-red-500 transition-colors"
                                                            title="Remove this item">
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                )}
                                                <div className={isMultiActivity ? "px-5 py-4" : "p-5"}>
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
                                        {(() => {
                                            const isUnmatched = !!emission_category && emissionFactors.length > 0
                                                && !emissionFactors.find((f) => f.emission_category_name === emission_category)
                                                && !emissionFactors.find((f) => f.global_category_name === emission_category)
                                                && !companyMappings.find((m) => m.global_category_name === emission_category);
                                            const needsAttention = isUnmatched || !emission_category;
                                            return emissionFactors.length > 0 ? (
                                                <div className="relative">
                                                    <select
                                                        value={emission_category ?? ""}
                                                        onChange={(e) =>
                                                            handleInvoiceRowChange(
                                                                id,
                                                                "emission_category",
                                                                e.target.value,
                                                            )
                                                        }
                                                        className={`w-full px-3 py-2 ${isUnmatched ? "pr-8" : ""} rounded-lg text-sm focus:outline-none focus:ring-2 ${needsAttention ? "border border-amber-400 bg-amber-50 focus:ring-amber-400" : "border border-emerald-300 bg-emerald-50 focus:ring-emerald-400"}`}>
                                                        <option value="">Select category</option>
                                                        {isUnmatched && (
                                                            <option value={emission_category!}>
                                                                {emission_category}
                                                            </option>
                                                        )}
                                                        {companyMappings.length > 0
                                                            ? companyMappings.map((m) => (
                                                                <option
                                                                    key={m.id}
                                                                    value={m.global_category_name}>
                                                                    {m.company_category_name}
                                                                </option>
                                                            ))
                                                            : emissionFactors.map((factor) => (
                                                                <option
                                                                    key={factor.emission_factor_id}
                                                                    value={factor.emission_category_name}>
                                                                    {factor.emission_category_name}
                                                                </option>
                                                            ))
                                                        }
                                                    </select>
                                                    {(() => {
                                                        const globalFactor = emission_category
                                                            ? emissionFactors.find((f) => f.emission_category_name === emission_category)
                                                            : null;
                                                        return !isUnmatched && globalFactor?.global_category_name ? (
                                                            <div className="absolute right-2 top-1/2 -translate-y-1/2 group">
                                                                <div className="w-4 h-4 rounded-full bg-blue-500 text-white text-[10px] font-bold flex items-center justify-center cursor-help">
                                                                    i
                                                                </div>
                                                                <div className="hidden group-hover:block absolute bottom-full right-0 mb-1 w-64 px-2.5 py-1.5 bg-gray-800 text-white text-xs rounded-md shadow-lg z-50 whitespace-normal">
                                                                    <span className="text-gray-400">Global:</span> {globalFactor.global_category_name}
                                                                </div>
                                                            </div>
                                                        ) : null;
                                                    })()}
                                                    {isUnmatched && (
                                                        <div className="absolute right-7 top-1/2 -translate-y-1/2 group">
                                                            <div className="w-4 h-4 rounded-full bg-amber-400 text-white text-[10px] font-bold flex items-center justify-center cursor-help">
                                                                i
                                                            </div>
                                                            <div className="hidden group-hover:block absolute bottom-full right-0 mb-1 w-52 px-2.5 py-1.5 bg-gray-800 text-white text-xs rounded-md shadow-lg z-50 whitespace-normal">
                                                                AI detected &ldquo;{emission_category}&rdquo; &mdash; please select a matching category from the list
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
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
                                            );
                                        })()}
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
                                    {/* Add item within this invoice */}
                                    <button
                                        type="button"
                                        onClick={() => handleAddItemToInvoice(group.invoiceIndex)}
                                        className="w-full py-2 border-t border-dashed border-gray-200 text-xs font-medium text-gray-400 hover:text-emerald-600 hover:bg-emerald-50/50 transition-colors">
                                        + Add Item to This Invoice
                                    </button>
                                    </>
                                    )}
                                </div>
                            );
                        });
                    })()}
                    <button
                        type="button"
                        onClick={handleAddInvoiceRow}
                        className="w-full mt-2 py-2.5 border-2 border-dashed border-gray-300 rounded-xl text-sm font-medium text-gray-500 hover:border-emerald-400 hover:text-emerald-600 transition-colors">
                        + Add New Invoice
                    </button>
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
                            : `Save ${invoiceRows.length} ${invoiceRows.length !== 1 ? "Entries" : "Entry"}`}
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

            {/* Emission Factor Viewer Modal */}
            <Modal
                isOpen={factorModalOpen}
                onClose={() => { setFactorModalOpen(false); setFactorModalData(null); setFactorModalEmission(null); }}
                title="Emission Factor Details"
                className="max-w-lg!">
                {factorLoading ? (
                    <div className="text-center py-8 text-gray-500">Loading...</div>
                ) : factorModalData ? (
                    <div className="space-y-3">
                        {factorModalEmission && (
                            <div className="text-sm text-gray-500 mb-4">
                                Emission #{factorModalEmission.pk_id} &mdash; {factorModalEmission.emission_category || "N/A"}
                            </div>
                        )}
                        <table className="w-full text-sm">
                            <tbody>
                                <tr className="border-b border-gray-100">
                                    <td className="py-2 pr-4 font-medium text-gray-600 whitespace-nowrap">Emission Category</td>
                                    <td className="py-2 text-gray-900">{factorModalData.emission_category_name || "—"}</td>
                                </tr>
                                {factorModalData.global_category_name && (
                                    <tr className="border-b border-gray-100">
                                        <td className="py-2 pr-4 font-medium text-gray-600 whitespace-nowrap">Global Category</td>
                                        <td className="py-2 text-gray-900">{factorModalData.global_category_name}</td>
                                    </tr>
                                )}
                                <tr className="border-b border-gray-100">
                                    <td className="py-2 pr-4 font-medium text-gray-600 whitespace-nowrap">Factor Value</td>
                                    <td className="py-2 text-gray-900 font-mono">{factorModalData.factor_value}</td>
                                </tr>
                                <tr className="border-b border-gray-100">
                                    <td className="py-2 pr-4 font-medium text-gray-600 whitespace-nowrap">Denominator Unit</td>
                                    <td className="py-2 text-gray-900">{factorModalData.denominator_unit || "—"}</td>
                                </tr>
                                <tr className="border-b border-gray-100">
                                    <td className="py-2 pr-4 font-medium text-gray-600 whitespace-nowrap">Year</td>
                                    <td className="py-2 text-gray-900">{factorModalData.year}</td>
                                </tr>
                                <tr>
                                    <td className="py-2 pr-4 font-medium text-gray-600 whitespace-nowrap">Source</td>
                                    <td className="py-2 text-gray-900">{factorModalData.source || "—"}</td>
                                </tr>
                            </tbody>
                        </table>
                        {factorModalEmission && (
                            <div className="mt-4 pt-3 border-t border-gray-200">
                                <div className="text-xs text-gray-500 mb-1">Calculated Emission</div>
                                <div className="text-lg font-semibold text-gray-900">
                                    {Number(factorModalEmission.total_emission).toFixed(4)} <span className="text-sm font-normal text-gray-500">tCO2e</span>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="text-center py-8 text-gray-500">
                        No matching emission factor found for this entry.
                    </div>
                )}
            </Modal>

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
            {/* Portal tooltip — renders outside overflow containers */}
            {tooltip && createPortal(
                <div
                    className="px-2.5 py-1.5 bg-gray-800 text-white text-xs rounded-md shadow-lg whitespace-normal max-w-xs pointer-events-none"
                    style={{
                        position: 'fixed',
                        left: tooltip.x,
                        top: tooltip.y - 8,
                        transform: 'translate(-50%, -100%)',
                        zIndex: 99999,
                    }}>
                    {tooltip.text}
                </div>,
                document.body
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

function createModalRow(id: number, columns: ColumnEntity[], extraFields?: import("./types").ExtraFieldDefinition[]): ModalRow {
    const row: ModalRow = { id };
    columns.forEach((col) => {
        row[col.column_name] = "";
    });
    // Initialize extra_data sub-object from extra field definitions
    const extra: Record<string, string> = {};
    if (extraFields) {
        extraFields.forEach((ef) => { extra[ef.key] = ""; });
    }
    row._extra_data = extra;
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
        _extra_data: emission.extra_data || {},
    };
}

function flattenEmissions(emissions: EmissionData[]): EmissionRow[] {
    return emissions.map(flattenEmission);
}

export default UserDataEntryPage;
