import React, { useState, useEffect, useCallback } from "react";
import {
  getEmissionFactors,
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

const PAGE_SIZE = 50;

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

  // Pagination state
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Search state
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const loadBatches = useCallback(async () => {
    try {
      const data = await getEmissionFactorBatches(siteId, categoryId);
      setBatches(data);
    } catch (error) {
      console.error("Error loading batches:", error);
    }
  }, [siteId, categoryId]);

  // Reset page to 1 when filters change
  const prevFiltersRef = React.useRef({ siteId, categoryId, search });
  useEffect(() => {
    const prev = prevFiltersRef.current;
    if (prev.siteId !== siteId || prev.categoryId !== categoryId || prev.search !== search) {
      prevFiltersRef.current = { siteId, categoryId, search };
      setPage(1);
      setSelectedIds(new Set());
    }
  }, [siteId, categoryId, search]);

  // Fetch data whenever page, filters, or refreshTrigger change
  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        setLoading(true);
        const result = await getEmissionFactors({
          page,
          limit: PAGE_SIZE,
          site_id: siteId,
          category_id: categoryId,
          search: search || undefined,
        });
        if (!cancelled) {
          setEmissionFactors(result.data);
          setTotal(result.total);
          setTotalPages(result.totalPages);
        }
      } catch (error) {
        console.error("Error loading emission factors:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    loadBatches();
    return () => { cancelled = true; };
  }, [siteId, categoryId, search, page, refreshTrigger, loadBatches]);

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

  // After delete, snap back to last valid page
  const reloadAfterDelete = async () => {
    const result = await getEmissionFactors({
      page,
      limit: PAGE_SIZE,
      site_id: siteId,
      category_id: categoryId,
      search: search || undefined,
    });
    // If current page is now empty but there are still records, go to last valid page
    if (result.data.length === 0 && result.total > 0) {
      const lastPage = Math.ceil(result.total / PAGE_SIZE);
      setPage(lastPage);
    } else {
      setEmissionFactors(result.data);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    }
    loadBatches();
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
      setSelectedIds(new Set());
      await reloadAfterDelete();
    } catch (error) {
      console.error("Error bulk deleting emission factors:", error);
    } finally {
      setBulkDeleting(false);
    }
  };

  const handleDelete = async (row: EmissionFactor) => {
    try {
      await deleteEmissionFactor(row.emission_factor_id);
      await reloadAfterDelete();
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
      setPage(1);
      await reloadAfterDelete();
    } catch (error) {
      console.error("Error deleting batch:", error);
    } finally {
      setDeletingBatchId(null);
    }
  };

  const handleSearch = () => {
    setSearch(searchInput);
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

  if (emissionFactors.length === 0 && !search) {
    return (
      <div className="text-center py-8 text-gray-500">
        No emission factors found.
      </div>
    );
  }

  // Generate visible page numbers
  const getPageNumbers = () => {
    const pages: (number | "...")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (page > 3) pages.push("...");
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) {
        pages.push(i);
      }
      if (page < totalPages - 2) pages.push("...");
      pages.push(totalPages);
    }
    return pages;
  };

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

      {/* Search bar */}
      <div className="mb-4 flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            placeholder="Search by name, source, site, category..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSearch();
            }}
            className="w-full pl-3 pr-8 py-2 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400"
          />
          {searchInput && (
            <button
              onClick={() => {
                setSearchInput("");
                setSearch("");
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              &times;
            </button>
          )}
        </div>
        <button
          onClick={handleSearch}
          className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
        >
          Search
        </button>
        <span className="text-sm text-gray-500 ml-2">
          {total.toLocaleString()} factor{total !== 1 ? "s" : ""}
        </span>
      </div>

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

      {emissionFactors.length === 0 && search ? (
        <div className="text-center py-8 text-gray-500">
          No results for &ldquo;{search}&rdquo;
        </div>
      ) : (
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
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-gray-500">
            Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, total)} of {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Prev
            </button>
            {getPageNumbers().map((p, i) =>
              p === "..." ? (
                <span key={`dots-${i}`} className="px-2 py-1.5 text-sm text-gray-400">
                  ...
                </span>
              ) : (
                <button
                  key={p}
                  onClick={() => setPage(p as number)}
                  className={`px-3 py-1.5 text-sm border rounded ${
                    page === p
                      ? "bg-blue-600 text-white border-blue-600"
                      : "hover:bg-gray-50"
                  }`}
                >
                  {p}
                </button>
              )
            )}
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-sm border rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default EmissionFactorList;
