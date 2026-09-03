import { useState, useCallback, useMemo } from "react";
import {
  BulkUploadModalProps,
  BulkReviewRow,
  ColumnMappingEntry,
  UploadStage,
 // EmissionRow,
  ModalRow,
} from "../UserDataEntry/types";

import {
  uploadExcelGetHeaders,
  fetchUniqueCategories,
  fetchPreviewRows,
  importAllRows,
} from "../../services/excelService";

// A site's category column is configured with a free-form name — "Emission
// Category", "emission_category", "Category", "Fuel Category". Normalising
// away case and _/-/space lets one comparison recognise all of them.
const normaliseName = (name: string) =>
  String(name ?? "")
    .toLowerCase()
    .replace(/[_\-\s]+/g, " ")
    .trim();

// Pick the column that represents the emission category, most specific first so
// a site with several "*category" columns always resolves the same way.
const findCategoryColumn = (columns: any[]) => {
  const normalised = (columns || []).map((col) => ({ col, name: normaliseName(col?.column_name) }));
  // The loose tier only fires when it is unambiguous. With several "*category"
  // columns (e.g. "Waste Category" alongside "Product Category") a first-match
  // would silently promote the wrong one and send it as the emission category.
  const loose = normalised.filter((c) => c.name.includes("category"));
  return (
    normalised.find((c) => c.name === "emission category")?.col ??
    normalised.find((c) => c.name === "category")?.col ??
    (loose.length === 1 ? loose[0].col : null)
  );
};

// The value column is identified by type rather than name: "Activity Data",
// "Spent Value", "Consumption" and "Distance" all play the same role and share
// column_type "number". Exactly one is unambiguous; zero or several are not, and
// then the explicit static field is kept so the user chooses.
const findValueColumn = (columns: any[]) => {
  const numeric = (columns || []).filter(
    (col) => String(col?.column_type ?? "").toLowerCase() === "number"
  );
  return numeric.length === 1 ? numeric[0] : null;
};

export function useBulkUpload({
  dynamicColumns,
  extraFields,
  siteId,
  categoryId,
  companyId: _companyId,
  selectedDate,
  getAutoEmissionCategory,
  userId,
  calculationSpec,
  // onImportComplete, // kept but not used inside handleImport anymore (BulkUploadModal will call it)
  // onClose,          // kept but not used inside handleImport anymore (BulkUploadModal will close)
}: Omit<
  BulkUploadModalProps,
  "isOpen" | "units" | "emissionFactors" | "getExpectedUnit" | "calculateEmission"
>) {
  const [stage, setStage] = useState<UploadStage>("upload");

  const [documentId, setDocumentId] = useState<number | null>(null);
  const [uploadedHeaders, setUploadedHeaders] = useState<string[]>([]);

  const [uniqueCategories, setUniqueCategories] = useState<string[]>([]);
  const [totalRows, setTotalRows] = useState<number>(0);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set());

  const [previewRows, setPreviewRows] = useState<Record<string, string>[]>([]);
  const [columnMappings, setColumnMappings] = useState<ColumnMappingEntry[]>([]);
  const [reviewRows, setReviewRows] = useState<BulkReviewRow[]>([]);

  // ✅ Loading flags (slow backend UX)
  const [uploading, setUploading] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);

  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [importError, setImportError] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const uniqueCategoryCount =
    selectedCategories.size > 0 ? selectedCategories.size : uniqueCategories.length;

  const buildRequiredFields = useCallback((): ColumnMappingEntry[] => {
    // The site's own category column, when it has one.
    const categoryColumn = findCategoryColumn(dynamicColumns as any[]);

    const fields: ColumnMappingEntry[] = [
      {
        requiredField: "emission_category",
        label: categoryColumn?.column_name || "Emission Category",
        sourceColumn: categoryColumn?.column_name,
        mappedTo: "",
        skipped: false,
        isRequired: true,
      },
    ];

    // Explicit value column → emission is always calculated on THIS number
    // (spend or quantity), never guessed. Prevents picking the wrong column.
    // Not offered for multi-field calculation categories (e.g. Use of Sold
    // Products): their value is the PRODUCT of the method's fields, so a
    // single "value" column doesn't exist and mapping one would mislead.
    const valueColumn = calculationSpec ? null : findValueColumn(dynamicColumns as any[]);

    if (!calculationSpec) {
      fields.push({
        requiredField: "activity_value",
        label: valueColumn?.column_name || "Value (Spend / Quantity)",
        sourceColumn: valueColumn?.column_name,
        mappedTo: "",
        skipped: false,
        isRequired: true,
      });
    }

    const promotedColumns = [categoryColumn, valueColumn]
      .filter(Boolean)
      .map((col: any) => normaliseName(col.column_name));

    dynamicColumns
      .filter((col: any) => !promotedColumns.includes(normaliseName(col.column_name)))
      .forEach((col: any) => {
        fields.push({
          requiredField: col.column_name,
          label: col.column_name,
          mappedTo: "",
          skipped: false,
          isRequired: true,
        });
      });

    fields.push({
      requiredField: "activity_data_unit",
      label: "Activity Unit",
      mappedTo: "",
      skipped: false,
      isRequired: true,
    });

    // Extra supplementary fields (optional, skipped by default)
    extraFields.forEach((ef) => {
      fields.push({
        requiredField: `extra_${ef.key}`,
        label: `${ef.label} (supplementary)`,
        mappedTo: "",
        skipped: false,
        isRequired: false,
      });
    });

    // Optional per-row reporting date. If mapped, each row is stamped with its
    // own month/year (month-wise import). If left unmapped, all rows use the
    // single reporting date chosen above (year-wise import).
    fields.push({
      requiredField: "reporting_date",
      label: "Reporting Date — map to import month-wise (optional)",
      mappedTo: "",
      skipped: false,
      isRequired: false,
    });

    return fields;
  }, [dynamicColumns, extraFields, calculationSpec]);

  const autoMap = useCallback((fields: ColumnMappingEntry[], headers: string[]) => {
    return fields.map((field) => {
      const candidates = [
        field.requiredField,
        field.requiredField.replace(/^extra_/, ""),
        field.sourceColumn,
      ]
        .filter(Boolean)
        .map((c) => normaliseName(c as string));

      const match = headers.find((h) => candidates.includes(normaliseName(h)));
      return match ? { ...field, mappedTo: match } : field;
    });
  }, []);

  // ✅ Step 1: Upload -> headers
  const parseFile = useCallback(
    async (file: File) => {
      setParseError(null);
      setUploading(true);

      try {
        const { document_id, headers } = await uploadExcelGetHeaders(file);

        if (!headers.length) {
          setParseError("The uploaded file appears to be empty.");
          return;
        }

        const fields = buildRequiredFields();
        const autoMapped = autoMap(fields, headers);

        setDocumentId(document_id);
        setUploadedHeaders(headers);
        setColumnMappings(autoMapped);

        // reset mapping-stage outputs
        setUniqueCategories([]);
        setSelectedCategories(new Set());
        setTotalRows(0);

        // reset preview
        setPreviewRows([]);
        setReviewRows([]);

        setStage("mapping");
      } catch (err: any) {
        setParseError(err?.message || "Failed to upload file. Please try again.");
      } finally {
        setUploading(false);
      }
    },
    [buildRequiredFields, autoMap]
  );

  const updateMapping = useCallback((requiredField: string, mappedTo: string) => {
    setColumnMappings((prev) =>
      prev.map((m) => (m.requiredField === requiredField ? { ...m, mappedTo, skipped: false } : m))
    );

    // ✅ if user changes emission_category mapping, categories become stale
    if (requiredField === "emission_category") {
      setUniqueCategories([]);
      setSelectedCategories(new Set());
      setTotalRows(0);
      setPreviewRows([]);
      setReviewRows([]);
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

    if (requiredField === "emission_category") {
      setUniqueCategories([]);
      setSelectedCategories(new Set());
      setTotalRows(0);
      setPreviewRows([]);
      setReviewRows([]);
    }
  }, []);

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

  const requiredMapped = useMemo(() => {
    return columnMappings.filter((m) => m.isRequired).every((m) => m.mappedTo || m.skipped);
  }, [columnMappings]);

  const mappingsObj = useMemo(() => {
    const obj: Record<string, string> = {};
    columnMappings.forEach((m) => {
      if (m.skipped || !m.mappedTo) return;
      obj[m.requiredField] = m.mappedTo;
      // A promoted column is sent under BOTH the fixed key the backend expects
      // (emission_category / activity_value) and its configured name. Manual
      // entry stores every column under its own name, so without this a
      // bulk-imported row's activity_data would be missing the field that
      // reports, exports and the edit form look it up by. The AI service maps
      // each target independently, so one header can feed two keys.
      if (m.sourceColumn && m.sourceColumn !== m.requiredField) {
        obj[m.sourceColumn] = m.mappedTo;
      }
    });
    return obj;
  }, [columnMappings]);

  // ✅ STEP 2: unique categories BEFORE preview
  const loadUniqueCategories = useCallback(async () => {
    if (!documentId) return;
    if (loadingCategories) return;

    if (!mappingsObj.emission_category) {
      setParseError("Please map the Emission Category column first.");
      return;
    }

    setParseError(null);
    setLoadingCategories(true);

    try {
      const res = await fetchUniqueCategories(documentId, mappingsObj);
      const cats = res.unique_categories || [];
      setUniqueCategories(cats);
      setTotalRows(res.total_rows || 0);

      // default select all
      setSelectedCategories(new Set(cats));
    } catch (err: any) {
      setParseError(err?.message || "Failed to fetch categories.");
    } finally {
      setLoadingCategories(false);
    }
  }, [documentId, mappingsObj, loadingCategories]);

  const buildReviewRows = useCallback(
    (rows: Record<string, string>[]): BulkReviewRow[] => {
      return rows.map((uploadedRow, idx) => {
        const mappedData: Record<string, string> = {};
        const extra_data: Record<string, string> = {};

        columnMappings.forEach((mapping) => {
          if (!mapping.skipped && mapping.mappedTo) {
            const value = String(uploadedRow[mapping.mappedTo] ?? "").trim();

            // Separate extra fields (prefixed with "extra_") from core fields
            if (mapping.requiredField.startsWith("extra_")) {
              const realKey = mapping.requiredField.replace(/^extra_/, "");
              if (value) extra_data[realKey] = value;
            } else {
              mappedData[mapping.requiredField] = value;
            }
          }
        });

        const modalRow: ModalRow = { id: idx, ...mappedData };

        let emission_category: string | null = mappedData["emission_category"] || null;
        if (!emission_category) {
          const autoResult = getAutoEmissionCategory(modalRow);
          emission_category = autoResult?.category ?? null;
        }
        if (emission_category) modalRow.emission_category = emission_category;

        const activity_data_unit = mappedData["activity_data_unit"] || null;

        let isValid = true;
        let errorReason: string | null = null;

        if (!emission_category) {
          isValid = false;
          errorReason = "Missing emission category";
        } else if (!activity_data_unit) {
          isValid = false;
          errorReason = "Missing activity unit";
        }

        return {
          id: idx,
          mappedData,
          extra_data,
          emission_category,
          original_company_category: mappedData["emission_category"] || null,
          activity_data_unit,
          total_emission: 0,
          isValid,
          errorReason,
        };
      });
    },
    [columnMappings, getAutoEmissionCategory]
  );

  const proceedToReview = useCallback(async () => {
    if (!documentId) return;
    if (loadingPreview) return;

    if (!requiredMapped) {
      setParseError("Please map all required fields first.");
      return;
    }

    setParseError(null);
    setLoadingPreview(true);

    try {
      const selected = Array.from(selectedCategories);

      const res = await fetchPreviewRows(
        documentId,
        mappingsObj,
        selected,
        siteId,
        categoryId,
        selectedDate,
        1,
        100
      );

      setPreviewRows(res.rows || []);
      setTotalRows(res.total_rows || 0);

      const review = buildReviewRows(res.rows || []);
      setReviewRows(review);

      setStage("review");
    } catch (err: any) {
      setParseError(err?.message || "Failed to fetch preview.");
    } finally {
      setLoadingPreview(false);
    }
  }, [
    documentId,
    mappingsObj,
    selectedCategories,
    siteId,
    categoryId,
    selectedDate,
    buildReviewRows,
    loadingPreview,
    requiredMapped,
  ]);

 
  const handleImport = useCallback(async () => {
    if (!documentId) throw new Error("Missing document id.");

    setImporting(true);
    setImportError(null);

    try {
      setImportProgress({ current: 0, total: totalRows || 0 });

      const selected = Array.from(selectedCategories);

      const res = await importAllRows(
        documentId,
        mappingsObj,
        selected,
        siteId,
        categoryId,
        selectedDate,
        userId
      );

      setImportProgress({ current: res.inserted ?? 0, total: res.total_rows ?? totalRows ?? 0 });

      return res;
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ||
        err?.response?.data?.message ||
        err?.message ||
        "Import failed.";
      setImportError(msg);

      throw err;
    } finally {
      setImporting(false);
    }
  }, [documentId, mappingsObj, selectedCategories, siteId, categoryId, selectedDate, totalRows]);

  const handleReset = useCallback(() => {
    setStage("upload");
    setDocumentId(null);
    setUploadedHeaders([]);
    setUniqueCategories([]);
    setSelectedCategories(new Set());
    setTotalRows(0);
    setPreviewRows([]);
    setColumnMappings([]);
    setReviewRows([]);

    setUploading(false);
    setLoadingCategories(false);
    setLoadingPreview(false);

    setImporting(false);
    setImportProgress({ current: 0, total: 0 });
    setImportError(null);
    setParseError(null);
  }, []);

  return {
    stage,
    uploadedHeaders,
    uploadedRows: previewRows,
    columnMappings,
    reviewRows,

    selectedCategories,
    uniqueCategories,
    uniqueCategoryCount,
    totalRows,

    // expose loading flags
    uploading,
    loadingCategories,
    loadingPreview,

    importing,
    importProgress,
    importError,
    parseError,


    parseFile,
    updateMapping,
    toggleSkip,
    toggleCategory,
    toggleAllCategories,
    loadUniqueCategories,
    proceedToReview,
    handleImport,
    handleReset,
    setStage,
  };
}