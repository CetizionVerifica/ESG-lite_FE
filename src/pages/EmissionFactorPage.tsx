import { useState, useEffect, useCallback, useActionState, useRef } from "react";
import * as XLSX from "xlsx";
import Dropdown, { DropdownOption } from "../components/Dropdown";
import Modal from "../components/Modal";
import { getSites } from "../services/siteService";
import { getCategories } from "../services/categoryService";
import { createEmissionFactor, bulkCreateEmissionFactors } from "../services/emissionFactorService";
import EmissionFactorList from "../components/EmissionFactorList";
import SmartUploadModal from "../components/SmartUploadModal";

interface Category {
  category_id: number;
  category_name: string;
  scope: string;
}

interface Site {
  site_id: number;
  name: string;
  categories?: Category[];
}

interface ParsedRow {
  year: number;
  factor_value: number;
  denominator_unit?: string;
  source?: string;
  emission_category_name?: string;
}

const EmissionFactorPage = () => {
  const [sites, setSites] = useState<Site[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedSite, setSelectedSite] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Form state for modal
  const [formSiteId, setFormSiteId] = useState<number | null>(null);
  const [formCategoryId, setFormCategoryId] = useState<number | null>(null);

  // Bulk upload state
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkSiteId, setBulkSiteId] = useState<number | null>(null);
  const [bulkCategoryId, setBulkCategoryId] = useState<number | null>(null);
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [smartUploadOpen, setSmartUploadOpen] = useState(false);

  const [formState, formAction] = useActionState(
    async (_prevData: any, data: FormData) => {
      try {
        const year = parseInt(data.get("year") as string);
        const factor_value = parseFloat(data.get("factor_value") as string);
        const denominator_unit = data.get("denominator_unit") as string;
        const source = data.get("source") as string;
        const emission_category_name = data.get("emission_category_name") as string;

        if (!formSiteId || !formCategoryId) {
          console.error("Please select both site and category");
          return { error: "Please select both site and category" };
        }

        if (!year || isNaN(factor_value)) {
          console.error("Year and factor value are required");
          return { error: "Year and factor value are required" };
        }

        await createEmissionFactor({
          site_id: formSiteId,
          category_id: formCategoryId,
          year,
          factor_value,
          denominator_unit: denominator_unit || undefined,
          source: source || undefined,
          emission_category_name: emission_category_name || undefined,
        });

        setModalOpen(false);
        resetForm();
        setRefreshTrigger((prev) => prev + 1);
        return { success: true };
      } catch (error: any) {
        console.error("Error creating emission factor:", error);
        return { error: error?.response?.data?.message || "Failed to create emission factor" };
      }
    },
    null
  );

  const resetForm = () => {
    setFormSiteId(null);
    setFormCategoryId(null);
  };

  const resetBulkForm = () => {
    setBulkSiteId(null);
    setBulkCategoryId(null);
    setParsedData([]);
    setUploadError(null);
    setUploadResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  useEffect(() => {
    handleLoadData();
  }, []);

  const handleLoadData = useCallback(async () => {
    try {
      setLoading(true);
      const [sitesData, categoriesData] = await Promise.all([
        getSites(),
        getCategories(),
      ]);
      setSites(sitesData);
      setCategories(categoriesData);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    setUploadResult(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);

        if (jsonData.length === 0) {
          setUploadError("The Excel file is empty or has no valid data.");
          return;
        }

        // Parse and validate data
        const parsed: ParsedRow[] = [];
        const errors: string[] = [];

        jsonData.forEach((row: any, index: number) => {
          const rowNum = index + 2; // Excel row (1-indexed + header)

          // Try different column name variations
          // Use nullish coalescing (??) instead of || to allow 0 values
          const year = row.year ?? row.Year ?? row.YEAR;
          const factor_value = row.factor_value ?? row["Factor Value"] ?? row.factor ?? row.Factor ?? row.FACTOR_VALUE;
          const denominator_unit = row.denominator_unit || row["Denominator Unit"] || row.unit || row.Unit;
          const source = row.source || row.Source || row.SOURCE;
          const emission_category_name = row.emission_category_name || row["Emission Category"] || row.emission_category || row["Emission Category Name"];

          if (year === undefined || year === null || factor_value === undefined || factor_value === null) {
            errors.push(`Row ${rowNum}: Missing required field (year or factor_value)`);
            return;
          }

          const parsedYear = parseInt(String(year));
          const parsedFactorValue = parseFloat(String(factor_value));

          if (isNaN(parsedYear) || isNaN(parsedFactorValue)) {
            errors.push(`Row ${rowNum}: Invalid year or factor_value`);
            return;
          }

          parsed.push({
            year: parsedYear,
            factor_value: parsedFactorValue,
            denominator_unit: denominator_unit ? String(denominator_unit).trim() : undefined,
            source: source ? String(source).trim() : undefined,
            emission_category_name: emission_category_name ? String(emission_category_name).trim() : undefined,
          });
        });

        if (errors.length > 0) {
          setUploadError(`Parsing errors:\n${errors.join("\n")}`);
        }

        if (parsed.length > 0) {
          setParsedData(parsed);
        }
      } catch (error) {
        console.error("Error parsing Excel file:", error);
        setUploadError("Failed to parse Excel file. Please ensure it's a valid .xlsx or .xls file.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleBulkUpload = async () => {
    if (!bulkSiteId || !bulkCategoryId) {
      setUploadError("Please select both site and category.");
      return;
    }

    if (parsedData.length === 0) {
      setUploadError("No valid data to upload. Please select a file first.");
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const factors = parsedData.map((row) => ({
        site_id: bulkSiteId,
        category_id: bulkCategoryId,
        year: row.year,
        factor_value: row.factor_value,
        denominator_unit: row.denominator_unit,
        source: row.source,
        emission_category_name: row.emission_category_name,
      }));

      const result = await bulkCreateEmissionFactors(factors);
      setUploadResult(result);
      setRefreshTrigger((prev) => prev + 1);

      if (result.created > 0 && result.skipped === 0) {
        // All successful, close modal after short delay
        setTimeout(() => {
          setBulkModalOpen(false);
          resetBulkForm();
        }, 2000);
      }
    } catch (error: any) {
      console.error("Error uploading emission factors:", error);
      setUploadError(error?.response?.data?.message || "Failed to upload emission factors.");
    } finally {
      setIsUploading(false);
    }
  };

  const siteOptions: DropdownOption[] = sites.map((site) => ({
    id: site.site_id,
    label: site.name,
  }));

  const categoryOptions: DropdownOption[] = categories.map((category) => ({
    id: category.category_id,
    label: category.category_name,
  }));

  // Get categories for the selected site in the form
  const selectedSiteForForm = sites.find((site) => site.site_id === formSiteId);
  const formCategoryOptions: DropdownOption[] = (selectedSiteForForm?.categories || []).map((category) => ({
    id: category.category_id,
    label: category.category_name,
  }));

  // Get categories for bulk upload
  const selectedSiteForBulk = sites.find((site) => site.site_id === bulkSiteId);
  const bulkCategoryOptions: DropdownOption[] = (selectedSiteForBulk?.categories || []).map((category) => ({
    id: category.category_id,
    label: category.category_name,
  }));

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Emission Factors</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setSmartUploadOpen(true)}
            className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700"
          >
            Smart Upload
          </button>
          <button
            onClick={() => setBulkModalOpen(true)}
            className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
          >
            Bulk Upload
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Add Emission Factor
          </button>
        </div>
      </div>

      {/* Single Add Modal */}
      <Modal
        title="Add Emission Factor"
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          resetForm();
        }}
      >
        <form action={formAction}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Site *</label>
              <Dropdown
                options={siteOptions}
                placeholder="Select Site"
                value={formSiteId}
                onChange={(option) => {
                  setFormSiteId(option?.id as number);
                  setFormCategoryId(null); // Reset category when site changes
                }}
                searchable={true}
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Category *</label>
              <Dropdown
                options={formCategoryOptions}
                placeholder={formSiteId ? "Select Category" : "Select a site first"}
                value={formCategoryId}
                onChange={(option) => setFormCategoryId(option?.id as number)}
                searchable={true}
                disabled={!formSiteId}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Year *</label>
              <input
                type="number"
                name="year"
                required
                min="1900"
                max="2100"
                defaultValue={new Date().getFullYear()}
                className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Factor Value *</label>
              <input
                type="number"
                name="factor_value"
                required
                step="0.0001"
                className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Denominator Unit</label>
              <input
                type="text"
                name="denominator_unit"
                placeholder="e.g., kg CO2e/kWh"
                className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
              />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1">Source</label>
              <input
                type="text"
                name="source"
                placeholder="e.g., EPA, IPCC"
                className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Emission Category Name</label>
            <input
              type="text"
              name="emission_category_name"
              placeholder="e.g., Electricity, Natural Gas"
              className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
            />
          </div>
          {formState?.error && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded text-sm">
              {formState.error}
            </div>
          )}
          {formState?.success && (
            <div className="bg-green-50 border border-green-200 text-green-700 p-3 rounded text-sm">
              Emission factor created successfully.
            </div>
          )}
          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={() => {
                setModalOpen(false);
                resetForm();
              }}
              className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Save
            </button>
          </div>
        </form>
      </Modal>

      {/* Bulk Upload Modal */}
      <Modal
        title="Bulk Upload Emission Factors"
        isOpen={bulkModalOpen}
        onClose={() => {
          setBulkModalOpen(false);
          resetBulkForm();
        }}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Site *</label>
              <Dropdown
                options={siteOptions}
                placeholder="Select Site"
                value={bulkSiteId}
                onChange={(option) => {
                  setBulkSiteId(option?.id as number);
                  setBulkCategoryId(null);
                }}
                searchable={true}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Category *</label>
              <Dropdown
                options={bulkCategoryOptions}
                placeholder={bulkSiteId ? "Select Category" : "Select a site first"}
                value={bulkCategoryId}
                onChange={(option) => setBulkCategoryId(option?.id as number)}
                searchable={true}
                disabled={!bulkSiteId}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Excel File *</label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileUpload}
              className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
            />
            <p className="text-xs text-gray-500 mt-1">
              Required columns: year, factor_value. Optional: denominator_unit, source, emission_category_name
            </p>
          </div>

          {parsedData.length > 0 && (
            <div className="bg-gray-50 p-3 rounded">
              <p className="text-sm font-medium text-green-700">
                Parsed {parsedData.length} row(s) from file
              </p>
              <div className="mt-2 max-h-40 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-200">
                      <th className="px-2 py-1 text-left">Year</th>
                      <th className="px-2 py-1 text-left">Factor</th>
                      <th className="px-2 py-1 text-left">Unit</th>
                      <th className="px-2 py-1 text-left">Category</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedData.slice(0, 10).map((row, idx) => (
                      <tr key={idx} className="border-b">
                        <td className="px-2 py-1">{row.year}</td>
                        <td className="px-2 py-1">{row.factor_value}</td>
                        <td className="px-2 py-1">{row.denominator_unit || "-"}</td>
                        <td className="px-2 py-1">{row.emission_category_name || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {parsedData.length > 10 && (
                  <p className="text-xs text-gray-500 mt-1">
                    ...and {parsedData.length - 10} more rows
                  </p>
                )}
              </div>
            </div>
          )}

          {uploadError && (
            <div className="bg-red-50 border border-red-200 text-red-700 p-3 rounded text-sm whitespace-pre-wrap">
              {uploadError}
            </div>
          )}

          {uploadResult && (
            <div className={`p-3 rounded text-sm ${uploadResult.skipped > 0 ? "bg-yellow-50 border border-yellow-200" : "bg-green-50 border border-green-200"}`}>
              <p className="font-medium">
                Upload complete: {uploadResult.created} created, {uploadResult.skipped} skipped
              </p>
              {uploadResult.errors.length > 0 && (
                <div className="mt-2 max-h-32 overflow-y-auto text-xs">
                  {uploadResult.errors.map((err, idx) => (
                    <p key={idx} className="text-red-600">{err}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={() => {
                setBulkModalOpen(false);
                resetBulkForm();
              }}
              className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
            >
              Cancel
            </button>
            <button
              onClick={handleBulkUpload}
              disabled={isUploading || parsedData.length === 0 || !bulkSiteId || !bulkCategoryId}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
            >
              {isUploading ? "Uploading..." : `Upload ${parsedData.length} Factor(s)`}
            </button>
          </div>
        </div>
      </Modal>

      {loading ? (
        <div className="text-center py-4">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium mb-1">Filter by Site</label>
            <Dropdown
              options={siteOptions}
              placeholder="Select Site"
              value={selectedSite}
              onChange={(option) => setSelectedSite(option?.id as number)}
              searchable={true}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Filter by Category</label>
            <Dropdown
              options={categoryOptions}
              placeholder="Select Category"
              value={selectedCategory}
              onChange={(option) => setSelectedCategory(option?.id as number)}
              searchable={true}
            />
          </div>
        </div>
      )}
      <EmissionFactorList siteId={selectedSite} categoryId={selectedCategory} refreshTrigger={refreshTrigger} />

      {/* Smart Upload Modal */}
      <SmartUploadModal
        isOpen={smartUploadOpen}
        onClose={() => setSmartUploadOpen(false)}
        sites={sites}
        categories={categories}
        onRefresh={() => setRefreshTrigger((prev) => prev + 1)}
      />
    </div>
  );
};

export default EmissionFactorPage;
