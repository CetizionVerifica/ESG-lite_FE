import { useState, useEffect, useCallback } from "react";
import {
  getEmissionFactors,
  getEmissionFactorsBySite,
  getEmissionFactorsByCategory,
  deleteEmissionFactor,
  bulkDeleteEmissionFactors,
  deleteEmissionFactorsByBatch,
  getEmissionFactorBatches,
  type UploadBatch,
} from "../services/emissionFactorService";

interface EmissionFactor {
  emission_factor_id: number;
  year: number;
  factor_value: number;
  denominator_unit: string | null;
  source: string | null;
  emission_category_name: string | null;
  upload_batch_id: string | null;
  site?: { site_id: number; name: string };
  category?: { category_id: number; category_name: string };
}

interface ColumnDef {
  key: string;
  label: string;
  render?: (value: any, row: EmissionFactor) => React.ReactNode;
}

interface EmissionFactorListProps {
  siteId: number | null;
  categoryId: number | null;
  refreshTrigger?: number;
  onSelectionChange?: (selectedIds: number[]) => void;
}

const EmissionFactorList = ({
  siteId,
  categoryId,
  refreshTrigger,
  onSelectionChange,
}: EmissionFactorListProps) => {
  const [emissionFactors, setEmissionFactors] = useState<EmissionFactor[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [batches, setBatches] = useState<UploadBatch[]>([]);
  const [showBatches, setShowBatches] = useState(false);
  const [deletingBatchId, setDeletingBatchId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      let data: EmissionFactor[];

      if (siteId) {
        data = await getEmissionFactorsBySite(siteId);
      } else if (categoryId) {
        data = await getEmissionFactorsByCategory(categoryId);
      } else {
        data = await getEmissionFactors();
      }

      // Apply additional filtering if both filters are set
      if (siteId && categoryId) {
        data = data.filter((ef) => ef.category?.category_id === categoryId);
      }

      setEmissionFactors(data);
    } catch (error) {
      console.error("Error loading emission factors:", error);
    } finally {
      setLoading(false);
    }
  }, [siteId, categoryId]);

  const loadBatches = useCallback(async () => {
    try {
      const data = await getEmissionFactorBatches(siteId, categoryId);
      setBatches(data);
    } catch (error) {
      console.error("Error loading batches:", error);
    }
  }, [siteId, categoryId]);

  useEffect(() => {
    loadData();
    loadBatches();
    setSelectedIds(new Set()); // Clear selection when data reloads
  }, [loadData, loadBatches, refreshTrigger]);

  // Notify parent of selection changes
  useEffect(() => {
    onSelectionChange?.(Array.from(selectedIds));
  }, [selectedIds, onSelectionChange]);

  // Check if all are selected
  const allSelected = emissionFactors.length > 0 && emissionFactors.every((ef) => selectedIds.has(ef.emission_factor_id));
  const someSelected = emissionFactors.some((ef) => selectedIds.has(ef.emission_factor_id));

  // Toggle single row selection
  const toggleRowSelection = (id: number) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Toggle all rows selection
  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(emissionFactors.map((ef) => ef.emission_factor_id)));
    }
  };

  // Bulk delete handler
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;

    if (!confirm(`Are you sure you want to delete ${selectedIds.size} emission factor(s)?`)) {
      return;
    }

    setBulkDeleting(true);
    try {
      await bulkDeleteEmissionFactors(Array.from(selectedIds));
      setEmissionFactors((prev) => prev.filter((ef) => !selectedIds.has(ef.emission_factor_id)));
      setSelectedIds(new Set());
      loadBatches(); // Refresh batch counts
    } catch (error) {
      console.error("Error bulk deleting emission factors:", error);
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleDelete = async (row: EmissionFactor) => {
    try {
      await deleteEmissionFactor(row.emission_factor_id);
      setEmissionFactors((prev) =>
        prev.filter((item) => item.emission_factor_id !== row.emission_factor_id)
      );
      loadBatches(); // Refresh batch counts
    } catch (error) {
      console.error("Error deleting emission factor:", error);
      throw error;
    }
  };

  const handleDeleteBatch = async (batchId: string) => {
    const batch = batches.find((b) => b.upload_batch_id === batchId);
    if (!confirm(`Delete all ${batch?.count ?? "?"} emission factor(s) from this upload?`)) return;

    setDeletingBatchId(batchId);
    try {
      await deleteEmissionFactorsByBatch(batchId);
      setSelectedIds(new Set());
      await Promise.all([loadData(), loadBatches()]);
    } catch (error) {
      console.error("Error deleting batch:", error);
    } finally {
      setDeletingBatchId(null);
    }
  };

  const columns: ColumnDef[] = [
    { key: "emission_factor_id", label: "ID" },
    {
      key: "site",
      label: "Site",
      render: (_value: any, row: EmissionFactor) => row.site?.name || "N/A",
    },
    {
      key: "category",
      label: "Category",
      render: (_value: any, row: EmissionFactor) => row.category?.category_name || "N/A",
    },
    { key: "year", label: "Year" },
    { key: "factor_value", label: "Factor Value" },
    {
      key: "denominator_unit",
      label: "Unit",
      render: (value: any) => value || "N/A",
    },
    {
      key: "source",
      label: "Source",
      render: (value: any) => value || "N/A",
    },
    {
      key: "emission_category_name",
      label: "Emission Category",
      render: (value: any) => value || "N/A",
    },
  ];

  if (loading) {
    return <div className="text-center py-8">Loading emission factors...</div>;
  }

  if (emissionFactors.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No emission factors found.
      </div>
    );
  }

  return (
    <div>
      {/* Upload Batches Panel */}
      {batches.length > 0 && (
        <div className="mb-4">
          <button
            onClick={() => setShowBatches(!showBatches)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors"
          >
            <svg className={`w-4 h-4 transition-transform ${showBatches ? "rotate-90" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Upload Batches ({batches.length})
          </button>

          {showBatches && (
            <div className="mt-2 border border-orange-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-orange-50 text-orange-800">
                    <th className="px-4 py-2 text-left font-medium">Site</th>
                    <th className="px-4 py-2 text-left font-medium">Category</th>
                    <th className="px-4 py-2 text-left font-medium">Factors</th>
                    <th className="px-4 py-2 text-left font-medium">Uploaded</th>
                    <th className="px-4 py-2 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((batch) => (
                    <tr key={batch.upload_batch_id} className="border-t border-orange-100 hover:bg-orange-50/50">
                      <td className="px-4 py-2 text-gray-700">{batch.site_name}</td>
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

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="mb-4 p-3 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-between">
          <span className="text-sm text-gray-600">
            {selectedIds.size} item{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
            >
              Clear Selection
            </button>
            <button
              onClick={handleBulkDelete}
              disabled={bulkDeleting}
              className="px-4 py-1.5 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700 disabled:bg-gray-400"
            >
              {bulkDeleting ? "Deleting..." : `Delete Selected (${selectedIds.size})`}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-3 py-3 text-center w-12">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected && !allSelected;
                  }}
                  onChange={toggleSelectAll}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  title="Select all"
                />
              </th>
              {columns.map((col) => (
                <th
                  key={String(col.key)}
                  className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700"
                >
                  {col.label}
                </th>
              ))}
              <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {emissionFactors.map((ef) => {
              const isSelected = selectedIds.has(ef.emission_factor_id);
              return (
                <tr
                  key={ef.emission_factor_id}
                  className={`hover:bg-gray-50 ${isSelected ? "bg-blue-50" : ""}`}
                >
                  <td className="border border-gray-300 px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleRowSelection(ef.emission_factor_id)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </td>
                  {columns.map((col) => (
                    <td
                      key={String(col.key)}
                      className="border border-gray-300 px-4 py-3"
                    >
                      {col.render
                        ? col.render(ef[col.key as keyof EmissionFactor], ef)
                        : String(ef[col.key as keyof EmissionFactor] ?? "N/A")}
                    </td>
                  ))}
                  <td className="border border-gray-300 px-4 py-3">
                    <button
                      onClick={() => handleDelete(ef)}
                      className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default EmissionFactorList;
