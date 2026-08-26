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

/** Strip case, spaces and punctuation so "UOM INR/USD" and "uom_inr_usd" compare equal. */
const normaliseKey = (s: string) => String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Header wordings we have actually seen in client workbooks, per mapping slot.
 * Every company names its columns differently, so auto-mapping falls back to
 * these before asking the user to pick by hand.
 */
const FIELD_ALIASES: Record<string, string[]> = {
  emissioncategory: ["category", "categoryname", "emissioncat", "type"],
  // Order matters — most specific first. Spend-based factors are quoted per USD,
  // so a currency column must outrank a physical "UOM (MT/Kg/KL/No)" when a sheet
  // carries both; the generic entries are the fallback for quantity-based sheets.
  activitydataunit: [
    "uominrusd",
    "currencyinrusd",
    "currencyinr usd",
    "currency",
    "uommtkgklno",
    "uomkgklno",
    "uom",
    "unit",
  ],
  dateofreporting: ["receiveddate", "date", "invoicedate", "transactiondate", "postingdate"],
  description: ["descriptionofthematerialservicegood", "materialdescription", "particulars"],
  suppliername: ["nameofthesupplier", "supplier", "vendor", "vendorname"],
  ponumber: ["po", "purchaseorder", "ponumber"],
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
      // The configured column is often spelled "Emission category" — compare on
      // an alphanumeric key so it isn't offered twice alongside the slot above.
      .filter((col: any) => normaliseKey(col.column_name) !== "emissioncategory")
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

    // Optional per-row date. Client exports usually hold a whole year of
    // transactions with a real date on every line; mapping that column lands
    // each row in its own month instead of stamping the file with one date.
    fields.push({
      requiredField: "date_of_reporting",
      label: "Row Date (optional — otherwise the selected date applies to all rows)",
      mappedTo: "",
      skipped: false,
      isRequired: false,
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

    return fields;
  }, [dynamicColumns, extraFields]);

  const autoMap = useCallback((fields: ColumnMappingEntry[], headers: string[]) => {
    const taken = new Set<string>();

    return fields.map((field) => {
      const key = normaliseKey(field.requiredField.replace(/^extra_/, ""));
      const aliases = [key, ...(FIELD_ALIASES[key] ?? [])];

      // Walk aliases in priority order rather than walking headers: a sheet can
      // hold two plausible columns for one slot (a physical "UOM (MT/Kg/KL/No)"
      // and a currency "UOM INR/USD"), and picking by column order silently grabs
      // whichever comes first. Alias order decides instead, most specific first.
      let match: string | undefined;
      for (const alias of aliases) {
        match = headers.find((h) => !taken.has(h) && normaliseKey(h) === alias);
        if (match) break;
        if (alias.length >= 4) {
          match = headers.find((h) => {
            if (taken.has(h)) return false;
            const header = normaliseKey(h);
            // Both sides must be substantial: a two-letter header like "PO"
            // otherwise matches inside an alias such as "dateofrep(o)rting".
            if (header.length < 4) return false;
            return header.includes(alias) || alias.includes(header);
          });
          if (match) break;
        }
      }

      if (match) taken.add(match);
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
      if (!m.skipped && m.mappedTo) obj[m.requiredField] = m.mappedTo;
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