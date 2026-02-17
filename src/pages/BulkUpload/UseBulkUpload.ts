import { useState, useCallback, useMemo } from "react";
import * as XLSX from "xlsx";
import { createEmission, EmissionData } from "../../services/emissionService";
import {
  BulkUploadModalProps,
  BulkReviewRow,
  ColumnMappingEntry,
  UploadStage,
  EmissionRow,
  ModalRow,
} from "../UserDataEntry/types";

export function useBulkUpload({
  dynamicColumns,
  siteId,
  categoryId,
  selectedDate,
  calculateEmission,
  getAutoEmissionCategory,
  onImportComplete,
  onClose,
}: Omit<BulkUploadModalProps, "isOpen" | "units" | "emissionFactors" | "getExpectedUnit">) {
  const [stage, setStage] = useState<UploadStage>("upload");
  const [uploadedHeaders, setUploadedHeaders] = useState<string[]>([]);
  const [uploadedRows, setUploadedRows] = useState<Record<string, string>[]>([]);
  const [columnMappings, setColumnMappings] = useState<ColumnMappingEntry[]>([]);
  const [reviewRows, setReviewRows] = useState<BulkReviewRow[]>([]);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<number>>(new Set());
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [importError, setImportError] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const totalRows = uploadedRows.length;

  // All unique category values from the uploaded file based on mapped column
  const uniqueCategories = useMemo(() => {
    const catMapping = columnMappings.find((m) => m.requiredField === "emission_category");
    if (!catMapping || !catMapping.mappedTo) return [];
    const values = new Set(
      uploadedRows
        .map((r) => r[catMapping.mappedTo]?.trim())
        .filter(Boolean)
    );
    return Array.from(values).sort();
  }, [columnMappings, uploadedRows]);

  // Count only selected categories
  const uniqueCategoryCount = selectedCategories.size > 0
    ? selectedCategories.size
    : uniqueCategories.length > 0
      ? uniqueCategories.length
      : null;

  const validRows = reviewRows.filter((r) => r.isValid);
  const errorRows = reviewRows.filter((r) => !r.isValid);

  // Category toggle handlers
  const toggleCategory = useCallback((category: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }, []);

  const toggleAllCategories = useCallback((categories: string[]) => {
    setSelectedCategories((prev) => {
      if (prev.size === categories.length) return new Set();
      return new Set(categories);
    });
  }, []);

  // When uniqueCategories changes (new file / new mapping), auto-select all
  const initCategories = useCallback((categories: string[]) => {
    setSelectedCategories(new Set(categories));
  }, []);

  const buildRequiredFields = useCallback((): ColumnMappingEntry[] => {
    const fields: ColumnMappingEntry[] = [
      {
        requiredField: "emission_category",
        label: "Emission Category",
        mappedTo: "",
        skipped: false,
        isRequired: true,
      },
    ];

    dynamicColumns
      .filter((col : any) => col.column_name.toLowerCase() !== "emission_category")
      .forEach((col : any) => {
        fields.push({
          requiredField: col.column_name,
          label: col.column_name,
          mappedTo: "",
          skipped: false,
          isRequired: false,
        });
      });

    fields.push({
      requiredField: "activity_data_unit",
      label: "Activity Unit",
      mappedTo: "",
      skipped: false,
      isRequired: true,
    });

    return fields;
  }, [dynamicColumns]);

  const autoMap = useCallback(
    (fields: ColumnMappingEntry[], headers: string[]): ColumnMappingEntry[] => {
      return fields.map((field) => {
        const match = headers.find(
          (h) => h.toLowerCase().trim() === field.requiredField.toLowerCase().trim()
        );
        return match ? { ...field, mappedTo: match } : field;
      });
    },
    []
  );

  const parseFile = useCallback(
    (file: File) => {
      setParseError(null);
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          const json: Record<string, string>[] = XLSX.utils.sheet_to_json(sheet, {
            defval: "",
          });

          if (json.length === 0) {
            setParseError("The uploaded file appears to be empty.");
            return;
          }

          const headers = Object.keys(json[0]);
          const fields = buildRequiredFields();
          const autoMapped = autoMap(fields, headers);

          setUploadedHeaders(headers);
          setUploadedRows(json);
          setColumnMappings(autoMapped);
          setSelectedCategories(new Set());
          setStage("mapping");
        } catch {
          setParseError("Failed to parse file. Please upload a valid .xlsx or .csv file.");
        }
      };
      reader.readAsArrayBuffer(file);
    },
    [buildRequiredFields, autoMap]
  );

  const updateMapping = useCallback((requiredField: string, mappedTo: string) => {
    setColumnMappings((prev) =>
      prev.map((m) =>
        m.requiredField === requiredField ? { ...m, mappedTo, skipped: false } : m
      )
    );
    // Reset selected categories when category column mapping changes
    if (requiredField === "emission_category") {
      setSelectedCategories(new Set());
    }
  }, []);

  const toggleSkip = useCallback((requiredField: string) => {
    setColumnMappings((prev) =>
      prev.map((m) =>
        m.requiredField === requiredField
          ? { ...m, skipped: !m.skipped, mappedTo: !m.skipped ? "" : m.mappedTo }
          : m
      )
    );
  }, []);

  const buildReviewRows = useCallback((): BulkReviewRow[] => {
    const catMapping = columnMappings.find((m) => m.requiredField === "emission_category");

    // Filter uploaded rows by selected categories if any are selected
    const filteredRows = uploadedRows.filter((uploadedRow) => {
      if (selectedCategories.size === 0) return true;
      if (!catMapping || !catMapping.mappedTo) return true;
      const rowCategory = uploadedRow[catMapping.mappedTo]?.trim();
      return selectedCategories.has(rowCategory);
    });

    return filteredRows.map((uploadedRow, idx) => {
      const mappedData: Record<string, string> = {};
      columnMappings.forEach((mapping) => {
        if (!mapping.skipped && mapping.mappedTo) {
          mappedData[mapping.requiredField] = String(
            uploadedRow[mapping.mappedTo] ?? ""
          ).trim();
        }
      });

      const modalRow: ModalRow = { id: idx, ...mappedData };

      let emission_category = mappedData["emission_category"] || null;
      if (!emission_category) {
        emission_category = getAutoEmissionCategory(modalRow);
      }
      if (emission_category) {
        modalRow.emission_category = emission_category;
      }

      const activity_data_unit = mappedData["activity_data_unit"] || null;

      let isValid = true;
      let errorReason: string | null = null;

      if (!emission_category) {
        isValid = false;
        errorReason = "Missing emission category";
      } else if (!activity_data_unit) {
        isValid = false;
        errorReason = "Missing activity unit";
      } else {
        const result = calculateEmission(modalRow);
        // if (result.value === null) {
        //   isValid = false;
        //   errorReason = result.status;
        // }
         if (result.value === null) {
    // Check if all numeric fields are 0 or empty — treat as valid with 0 emission
    const hasActivityValue = Object.entries(mappedData).some(([key, val]) => {
      if (["emission_category", "activity_data_unit"].includes(key)) return false;
      const num = parseFloat(val);
      return !isNaN(num) && num !== 0;
    });
    if (hasActivityValue) {
      isValid = false;
      errorReason = result.status;
    }
  }
      }

    //  const emissionResult = emission_category ? calculateEmission(modalRow) : { value: null };
    const emissionResult = emission_category ? calculateEmission(modalRow) : { value: null };
const emissionValue = emissionResult.value ?? 0;

      return {
        id: idx,
        mappedData,
        emission_category,
        activity_data_unit,
        total_emission: emissionValue,
        isValid,
        errorReason,
      };
    });
  }, [uploadedRows, columnMappings, selectedCategories, getAutoEmissionCategory, calculateEmission]);

  const proceedToReview = useCallback(() => {
    const rows = buildReviewRows();
    setReviewRows(rows);
    setSelectedRowIds(new Set(rows.filter((r) => r.isValid).map((r) => r.id)));
    setStage("review");
  }, [buildReviewRows]);

  const toggleRow = useCallback((id: number) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllValid = useCallback(() => {
    setSelectedRowIds(new Set(validRows.map((r) => r.id)));
  }, [validRows]);

  const deselectAll = useCallback(() => {
    setSelectedRowIds(new Set());
  }, []);

  const handleImport = useCallback(async () => {
    const rowsToImport = reviewRows.filter((r) => selectedRowIds.has(r.id));
    if (rowsToImport.length === 0) return;

    const BATCH_SIZE = 50;
    setImporting(true);
    setImportError(null);
    setImportProgress({ current: 0, total: rowsToImport.length });

    const imported: EmissionRow[] = [];

    try {
      for (let batchStart = 0; batchStart < rowsToImport.length; batchStart += BATCH_SIZE) {
        const batch = rowsToImport.slice(batchStart, batchStart + BATCH_SIZE);

        const results = await Promise.all(
          batch.map((row) => {
            const { activity_data_unit, ...activityData } = row.mappedData;
            return createEmission({
              site_id: siteId,
              category_id: categoryId,
              activity_data: {
                ...activityData,
                emission_category: row.emission_category || "",
              },
              total_emission: 0,
              unit: "kg CO2e",
              date_of_reporting: selectedDate,
              activity_data_unit: activity_data_unit || undefined,
            });
          })
        );

        results.forEach((result : any) => {
          const emission: EmissionData = result.emission;
          imported.push({
            ...emission.activity_data,
            pk_id: emission.pk_id,
            total_emission: emission.total_emission,
            unit: emission.unit,
            activity_data_unit: emission.activity_data_unit,
            status: emission.status,
            reviewed_by: emission.reviewed_by,
            review_comment: emission.review_comment,
          });
        });

        setImportProgress({ current: batchStart + batch.length, total: rowsToImport.length });
      }

      onImportComplete(imported);
      handleReset();
      onClose();
    } catch (err: any) {
      setImportError(
        err?.response?.data?.message || err?.message || "Import failed. Please try again."
      );
    } finally {
      setImporting(false);
    }
  }, [reviewRows, selectedRowIds, siteId, categoryId, selectedDate, onImportComplete, onClose]);

  const handleReset = useCallback(() => {
    setStage("upload");
    setUploadedHeaders([]);
    setUploadedRows([]);
    setColumnMappings([]);
    setReviewRows([]);
    setSelectedRowIds(new Set());
    setSelectedCategories(new Set());
    setImporting(false);
    setImportProgress({ current: 0, total: 0 });
    setImportError(null);
    setParseError(null);
  }, []);

  return {
    stage,
    uploadedHeaders,
    uploadedRows,
    columnMappings,
    reviewRows,
    selectedRowIds,
    selectedCategories,
    uniqueCategories,
    importing,
    importProgress,
    importError,
    parseError,
    totalRows,
    uniqueCategoryCount,
    validRows,
    errorRows,
    parseFile,
    updateMapping,
    toggleSkip,
    proceedToReview,
    toggleRow,
    selectAllValid,
    deselectAll,
    handleImport,
    handleReset,
    setStage,
    toggleCategory,
    toggleAllCategories,
    initCategories,
  };
}