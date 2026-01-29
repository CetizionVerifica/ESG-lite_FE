import { useState, useEffect, useCallback, useMemo } from "react";
import Dropdown, { DropdownOption } from "../components/Dropdown";
import Modal from "../components/Modal";
import { useAuth } from "../context/AuthContext";
import {
  getProductionDataForManager,
  approveProductionData,
  rejectProductionData,
  bulkApproveProductionData,
  bulkRejectProductionData,
  updateProductionData,
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

const StatusBadge = ({ status }: { status: ProductionDataStatus }) => {
  const statusStyles: Record<ProductionDataStatus, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    approved: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
  };

  return (
    <span
      className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${statusStyles[status] || "bg-gray-100 text-gray-800"}`}
    >
      {status}
    </span>
  );
};

const ManagerProductionDataPage = () => {
  const { user } = useAuth();

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
      const response = await updateProductionData(editingData.production_id, {
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

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Manage Production Data</h1>

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium mb-1">Site</label>
          <Dropdown
            options={siteOptions}
            placeholder="Select Site"
            value={selectedSite}
            onChange={(option) => setSelectedSite(option?.id as number)}
            searchable={true}
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Product</label>
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
          <label className="block text-sm font-medium mb-1">Status</label>
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
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Info and Bulk Actions */}
      <div className="flex justify-between items-center mb-4">
        <div>
          {currentSite && (
            <span className="text-sm text-gray-600">
              {productionData.length} record{productionData.length !== 1 ? "s" : ""} found
              {pendingCount > 0 && (
                <span className="ml-2 text-yellow-600">({pendingCount} pending)</span>
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
        <div className="text-center py-8">Loading...</div>
      ) : productionData.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          No production data found for the selected filters.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-3 py-2 w-10">
                  <input
                    type="checkbox"
                    checked={selectedIds.length === productionData.length && productionData.length > 0}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                  />
                </th>
                <th className="border border-gray-300 px-4 py-2 text-left">Product</th>
                <th className="border border-gray-300 px-4 py-2 text-left">Quantity</th>
                <th className="border border-gray-300 px-4 py-2 text-left">Unit</th>
                <th className="border border-gray-300 px-4 py-2 text-left">Period</th>
                <th className="border border-gray-300 px-4 py-2 text-left">Created By</th>
                <th className="border border-gray-300 px-4 py-2 text-left">Status</th>
                <th className="border border-gray-300 px-4 py-2 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {productionData.map((data) => (
                <tr key={data.production_id} className="hover:bg-gray-50">
                  <td className="border border-gray-300 px-3 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(data.production_id)}
                      onChange={(e) => handleSelectOne(data.production_id, e.target.checked)}
                    />
                  </td>
                  <td className="border border-gray-300 px-4 py-2">
                    {data.product?.name || "N/A"}
                  </td>
                  <td className="border border-gray-300 px-4 py-2">
                    {Number(data.quantity).toLocaleString()}
                  </td>
                  <td className="border border-gray-300 px-4 py-2">{data.unit}</td>
                  <td className="border border-gray-300 px-4 py-2">
                    {formatDate(data.start_date)} - {formatDate(data.end_date)}
                  </td>
                  <td className="border border-gray-300 px-4 py-2">
                    {data.created_by?.name || "N/A"}
                  </td>
                  <td className="border border-gray-300 px-4 py-2">
                    <StatusBadge status={data.status} />
                    {data.status === "rejected" && data.review_comment && (
                      <div className="text-xs text-red-600 mt-1">
                        {data.review_comment}
                      </div>
                    )}
                    {data.status !== "pending" && data.reviewed_by && (
                      <div className="text-xs text-gray-500 mt-1">
                        by {data.reviewed_by.name}
                      </div>
                    )}
                  </td>
                  <td className="border border-gray-300 px-4 py-2">
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
      >
        <div className="mb-4">
          <label className="block text-sm font-medium mb-1">
            Rejection Reason (Optional)
          </label>
          <textarea
            value={rejectComment}
            onChange={(e) => setRejectComment(e.target.value)}
            className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
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
            className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
          >
            Cancel
          </button>
          <button
            onClick={handleReject}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
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
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Quantity</label>
            <input
              type="number"
              value={editForm.quantity}
              onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
              className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
              step="0.0001"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Unit</label>
            <input
              type="text"
              value={editForm.unit}
              onChange={(e) => setEditForm({ ...editForm, unit: e.target.value })}
              className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Start Date</label>
            <input
              type="date"
              value={editForm.start_date}
              onChange={(e) => setEditForm({ ...editForm, start_date: e.target.value })}
              className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">End Date</label>
            <input
              type="date"
              value={editForm.end_date}
              onChange={(e) => setEditForm({ ...editForm, end_date: e.target.value })}
              className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Notes</label>
            <textarea
              value={editForm.notes}
              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
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
            className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
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
