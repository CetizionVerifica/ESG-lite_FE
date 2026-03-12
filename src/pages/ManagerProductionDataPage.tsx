import { useState, useEffect, useCallback, useMemo } from "react";
import Dropdown, { DropdownOption } from "../components/Dropdown";
import Modal from "../components/Modal";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import {
  getProductionDataForManager,
  approveProductionData,
  rejectProductionData,
  bulkApproveProductionData,
  bulkRejectProductionData,
  managerUpdateProductionData,
  ProductionData,
  ProductionDataStatus,
} from "../services/productionDataService";
import { getProductsBySite, Product } from "../services/productService";

interface Site {
  site_id: number;
  name: string;
}

const STATUS_OPTIONS: DropdownOption[] = [
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const StatusBadge = ({ status, isDark = false }: { status: ProductionDataStatus; isDark?: boolean }) => {
  const statusStyles: Record<ProductionDataStatus, string> = isDark
    ? {
        pending: "bg-yellow-900/30 text-yellow-400 border border-yellow-700/50",
        approved: "bg-green-900/30 text-green-400 border border-green-700/50",
        rejected: "bg-red-900/30 text-red-400 border border-red-700/50",
      }
    : {
        pending: "bg-yellow-100 text-yellow-800",
        approved: "bg-green-100 text-green-800",
        rejected: "bg-red-100 text-red-800",
      };

  return (
    <span
      className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${statusStyles[status] || (isDark ? "bg-slate-700 text-slate-300" : "bg-gray-100 text-gray-800")}`}
    >
      {status}
    </span>
  );
};

const ManagerProductionDataPage = () => {
  const { user } = useAuth();
  const { isDark } = useTheme();

  // Get available sites
  const sites: Site[] = user?.sites || [];
  const singleSite: Site | null = user?.site || null;
  const availableSites = useMemo(
    () => (sites.length > 0 ? sites : singleSite ? [singleSite] : []),
    [sites, singleSite]
  );

  // State
  const [selectedSite, setSelectedSite] = useState<number | null>(
    availableSites.length > 0 ? availableSites[0].site_id : null
  );
  const [selectedStatus, setSelectedStatus] = useState<ProductionDataStatus | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);
  const [productionData, setProductionData] = useState<ProductionData[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Modal state
  const [rejectModalOpen, setRejectModalOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState("");
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [bulkRejectMode, setBulkRejectMode] = useState(false);

  // Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingData, setEditingData] = useState<ProductionData | null>(null);
  const [editForm, setEditForm] = useState({
    quantity: "",
    unit: "",
    start_date: "",
    end_date: "",
    notes: "",
  });

  const currentSite = availableSites.find((s) => s.site_id === selectedSite);

  const siteOptions: DropdownOption[] = availableSites.map((site) => ({
    id: site.site_id,
    label: site.name,
  }));

  const productOptions: DropdownOption[] = products.map((product) => ({
    id: product.product_id,
    label: product.name,
  }));

  // Set initial site
  useEffect(() => {
    if (availableSites.length > 0 && selectedSite === null) {
      setSelectedSite(availableSites[0].site_id);
    }
  }, [availableSites, selectedSite]);

  // Reset filters when site changes
  useEffect(() => {
    setSelectedProduct(null);
    setSelectedIds([]);
  }, [selectedSite]);

  // Fetch products for selected site
  useEffect(() => {
    const fetchProducts = async () => {
      if (!selectedSite) return;
      try {
        const data = await getProductsBySite(selectedSite);
        setProducts(data);
      } catch (error) {
        console.error("Error fetching products:", error);
        setProducts([]);
      }
    };
    fetchProducts();
  }, [selectedSite]);

  // Fetch production data
  const fetchData = useCallback(async () => {
    if (!selectedSite) return;

    try {
      setLoading(true);
      const params: any = { siteId: selectedSite };
      if (selectedStatus) params.status = selectedStatus;
      if (selectedProduct) params.productId = selectedProduct;

      const data = await getProductionDataForManager(params);
      setProductionData(data);
    } catch (error) {
      console.error("Error fetching production data:", error);
      setProductionData([]);
    } finally {
      setLoading(false);
    }
  }, [selectedSite, selectedStatus, selectedProduct]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Handle approve
  const handleApprove = useCallback(async (id: number) => {
    try {
      const response = await approveProductionData(id);
      setProductionData((prev) =>
        prev.map((p) =>
          p.production_id === id ? response.productionData : p
        )
      );
    } catch (error) {
      console.error("Error approving:", error);
    }
  }, []);

  // Handle reject
  const handleReject = useCallback(async () => {
    if (bulkRejectMode) {
      if (selectedIds.length === 0) return;
      try {
        await bulkRejectProductionData(selectedIds, rejectComment);
        await fetchData();
        setSelectedIds([]);
      } catch (error) {
        console.error("Error bulk rejecting:", error);
      }
    } else if (rejectingId) {
      try {
        const response = await rejectProductionData(rejectingId, rejectComment);
        setProductionData((prev) =>
          prev.map((p) =>
            p.production_id === rejectingId ? response.productionData : p
          )
        );
      } catch (error) {
        console.error("Error rejecting:", error);
      }
    }
    setRejectModalOpen(false);
    setRejectComment("");
    setRejectingId(null);
    setBulkRejectMode(false);
  }, [bulkRejectMode, selectedIds, rejectingId, rejectComment, fetchData]);

  // Handle bulk approve
  const handleBulkApprove = useCallback(async () => {
    if (selectedIds.length === 0) return;
    try {
      await bulkApproveProductionData(selectedIds);
      await fetchData();
      setSelectedIds([]);
    } catch (error) {
      console.error("Error bulk approving:", error);
    }
  }, [selectedIds, fetchData]);

  // Handle edit
  const handleEditClick = (data: ProductionData) => {
    setEditingData(data);
    setEditForm({
      quantity: String(data.quantity),
      unit: data.unit,
      start_date: data.start_date.split("T")[0],
      end_date: data.end_date.split("T")[0],
      notes: data.notes || "",
    });
    setEditModalOpen(true);
  };

  const handleEditSave = async () => {
    if (!editingData) return;
    try {
      const response = await managerUpdateProductionData(editingData.production_id, {
        quantity: parseFloat(editForm.quantity),
        unit: editForm.unit,
        start_date: editForm.start_date,
        end_date: editForm.end_date,
        notes: editForm.notes,
      });
      setProductionData((prev) =>
        prev.map((p) =>
          p.production_id === editingData.production_id ? response.productionData : p
        )
      );
      setEditModalOpen(false);
      setEditingData(null);
    } catch (error) {
      console.error("Error updating:", error);
    }
  };

  // Selection handlers
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(productionData.map((p) => p.production_id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedIds((prev) => [...prev, id]);
    } else {
      setSelectedIds((prev) => prev.filter((i) => i !== id));
    }
  };

  const pendingCount = productionData.filter((p) => p.status === "pending").length;
  const pendingSelectedIds = selectedIds.filter((id) =>
    productionData.find((p) => p.production_id === id && p.status === "pending")
  );

  // Theme classes
  const containerClass = isDark
    ? "p-6 bg-slate-900 min-h-screen text-slate-100"
    : "p-6 bg-gray-50 min-h-screen text-gray-900";

  const labelClass = isDark
    ? "block text-sm font-medium mb-1 text-slate-300"
    : "block text-sm font-medium mb-1 text-gray-700";

  const refreshBtnClass = isDark
    ? "px-4 py-2 bg-slate-700 text-slate-200 rounded hover:bg-slate-600"
    : "px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200";

  const infoTextClass = isDark
    ? "text-sm text-slate-400"
    : "text-sm text-gray-600";

  const pendingTextClass = isDark
    ? "ml-2 text-yellow-400"
    : "ml-2 text-yellow-600";

  const loadingClass = isDark
    ? "text-center py-8 text-slate-300"
    : "text-center py-8";

  const emptyClass = isDark
    ? "text-center py-8 text-slate-400"
    : "text-center py-8 text-gray-500";

  const tableClass = isDark
    ? "w-full border-collapse border border-slate-600"
    : "w-full border-collapse border border-gray-300";

  const headerRowClass = isDark
    ? "bg-slate-700"
    : "bg-gray-100";

  const headerCellClass = isDark
    ? "border border-slate-600 px-4 py-2 text-left text-slate-200"
    : "border border-gray-300 px-4 py-2 text-left";

  const cellClass = isDark
    ? "border border-slate-600 px-4 py-2 text-slate-200"
    : "border border-gray-300 px-4 py-2";

  const rowHoverClass = isDark
    ? "hover:bg-slate-700"
    : "hover:bg-gray-50";

  const inputClass = isDark
    ? "w-full border border-slate-600 bg-slate-700 text-slate-200 px-3 py-2 rounded focus:outline-none focus:ring focus:ring-blue-500/30"
    : "w-full border px-3 py-2 rounded focus:outline-none focus:ring";

  const cancelBtnClass = isDark
    ? "px-4 py-2 bg-slate-600 text-slate-200 rounded hover:bg-slate-500"
    : "px-4 py-2 bg-gray-300 rounded hover:bg-gray-400";

  const reviewTextClass = isDark
    ? "text-xs text-slate-400 mt-1"
    : "text-xs text-gray-500 mt-1";

  const rejectReasonClass = isDark
    ? "text-xs text-red-400 mt-1"
    : "text-xs text-red-600 mt-1";

  return (
    <div className={containerClass}>
      <h1 className="text-2xl font-bold mb-6">Manage Production Data</h1>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div>
          <label className={labelClass}>Site</label>
          <Dropdown
            options={siteOptions}
            placeholder="Select Site"
            value={selectedSite}
            onChange={(option) => setSelectedSite(option?.id as number)}
            searchable={true}
          />
        </div>
        <div>
          <label className={labelClass}>Product</label>
          <Dropdown
            options={productOptions}
            placeholder="All Products"
            value={selectedProduct}
            onChange={(option) => setSelectedProduct(option?.id as number)}
            searchable={true}
            clearable={true}
          />
        </div>
        <div>
          <label className={labelClass}>Status</label>
          <Dropdown
            options={STATUS_OPTIONS}
            placeholder="All Statuses"
            value={selectedStatus}
            onChange={(option) => setSelectedStatus(option?.id as ProductionDataStatus)}
            clearable={true}
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={fetchData}
            className={refreshBtnClass}
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Info and Bulk Actions */}
      <div className="flex justify-between items-center mb-4">
        <div>
          {currentSite && (
            <span className={infoTextClass}>
              {productionData.length} record{productionData.length !== 1 ? "s" : ""} found
              {pendingCount > 0 && (
                <span className={pendingTextClass}>({pendingCount} pending)</span>
              )}
            </span>
          )}
        </div>
        {pendingSelectedIds.length > 0 && (
          <div className="flex gap-2">
            <button
              onClick={handleBulkApprove}
              className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
            >
              Approve Selected ({pendingSelectedIds.length})
            </button>
            <button
              onClick={() => {
                setBulkRejectMode(true);
                setRejectModalOpen(true);
              }}
              className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
            >
              Reject Selected ({pendingSelectedIds.length})
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className={loadingClass}>Loading...</div>
      ) : productionData.length === 0 ? (
        <div className={emptyClass}>
          No production data found for the selected filters.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr className={headerRowClass}>
                <th className={`${headerCellClass} w-10`}>
                  <input
                    type="checkbox"
                    checked={selectedIds.length === productionData.length && productionData.length > 0}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                  />
                </th>
                <th className={headerCellClass}>Product</th>
                <th className={headerCellClass}>Quantity</th>
                <th className={headerCellClass}>Unit</th>
                <th className={headerCellClass}>Period</th>
                <th className={headerCellClass}>Created By</th>
                <th className={headerCellClass}>Status</th>
                <th className={headerCellClass}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {productionData.map((data) => (
                <tr key={data.production_id} className={rowHoverClass}>
                  <td className={`${cellClass} text-center`}>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(data.production_id)}
                      onChange={(e) => handleSelectOne(data.production_id, e.target.checked)}
                    />
                  </td>
                  <td className={cellClass}>
                    {data.product?.name || "N/A"}
                  </td>
                  <td className={cellClass}>
                    {Number(data.quantity).toLocaleString()}
                  </td>
                  <td className={cellClass}>{data.unit}</td>
                  <td className={cellClass}>
                    {formatDate(data.start_date)} - {formatDate(data.end_date)}
                  </td>
                  <td className={cellClass}>
                    {data.created_by?.name || "N/A"}
                  </td>
                  <td className={cellClass}>
                    <StatusBadge status={data.status} isDark={isDark} />
                    {data.status === "rejected" && data.review_comment && (
                      <div className={rejectReasonClass}>
                        {data.review_comment}
                      </div>
                    )}
                    {data.status !== "pending" && data.reviewed_by && (
                      <div className={reviewTextClass}>
                        by {data.reviewed_by.name}
                      </div>
                    )}
                  </td>
                  <td className={cellClass}>
                    <div className="flex gap-1">
                      {data.status === "pending" && (
                        <>
                          <button
                            onClick={() => handleApprove(data.production_id)}
                            className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => {
                              setRejectingId(data.production_id);
                              setRejectModalOpen(true);
                            }}
                            className="px-2 py-1 bg-red-600 text-white text-xs rounded hover:bg-red-700"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => handleEditClick(data)}
                        className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                      >
                        Edit
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Reject Modal */}
      <Modal
        isOpen={rejectModalOpen}
        onClose={() => {
          setRejectModalOpen(false);
          setRejectComment("");
          setRejectingId(null);
          setBulkRejectMode(false);
        }}
        title={bulkRejectMode ? `Reject ${pendingSelectedIds.length} Items` : "Reject Production Data"}
        isDark={isDark}
      >
        <div className="mb-4">
          <label className={labelClass}>
            Rejection Reason (Required)
          </label>
          <textarea
            value={rejectComment}
            onChange={(e) => setRejectComment(e.target.value)}
            className={inputClass}
            rows={3}
            placeholder="Enter reason for rejection..."
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={() => {
              setRejectModalOpen(false);
              setRejectComment("");
              setRejectingId(null);
              setBulkRejectMode(false);
            }}
            className={cancelBtnClass}
          >
            Cancel
          </button>
          <button
            onClick={handleReject}
            disabled={!rejectComment.trim()}
            className={`px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 ${!rejectComment.trim() ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            Reject
          </button>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal
        isOpen={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setEditingData(null);
        }}
        title="Edit Production Data"
        isDark={isDark}
      >
        {editingData?.status === "approved" && (
          <div className={`mb-4 p-3 rounded text-sm ${isDark ? "bg-yellow-900/20 border border-yellow-700/30 text-yellow-400" : "bg-yellow-50 border border-yellow-200 text-yellow-800"}`}>
            This entry is approved. Changes will be logged in the audit trail.
          </div>
        )}
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Quantity</label>
            <input
              type="number"
              value={editForm.quantity}
              onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
              className={inputClass}
              step="0.0001"
            />
          </div>
          <div>
            <label className={labelClass}>Unit</label>
            <input
              type="text"
              value={editForm.unit}
              onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Start Date</label>
            <input
              type="date"
              value={editForm.start_date}
              onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>End Date</label>
            <input
              type="date"
              value={editForm.end_date}
              onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Notes</label>
            <textarea
              value={editForm.notes}
              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              className={inputClass}
              rows={2}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={() => {
              setEditModalOpen(false);
              setEditingData(null);
            }}
            className={cancelBtnClass}
          >
            Cancel
          </button>
          <button
            onClick={handleEditSave}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Save
          </button>
        </div>
      </Modal>
    </div>
  );
};

export default ManagerProductionDataPage;
