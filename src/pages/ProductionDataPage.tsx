import { useActionState, useState, useEffect, useCallback, useMemo } from "react";
import Modal from "../components/Modal";
import Dropdown, { DropdownOption } from "../components/Dropdown";
import { Table, Column } from "../components/Table";
import { AuditTrailModal } from "../components/AuditTrailTimeline";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { getProductsBySite, Product } from "../services/productService";
import {
  getProductionDataBySite,
  createProductionData,
  updateProductionData,
  deleteProductionData,
  ProductionData,
} from "../services/productionDataService";
import ProductionDataBulkUpload from "./ProductionDataBulkUpload";

interface Site {
  site_id: number;
  name: string;
}

const ProductionDataPage = () => {
  const { user } = useAuth();
  const { isDark } = useTheme();

  // Get available sites from user (supports both single site and multiple sites)
  const availableSites: Site[] = useMemo(() => {
    const sites = user?.sites || [];
    const singleSite = user?.site || null;
    return sites.length > 0 ? sites : singleSite ? [singleSite] : [];
  }, [user?.sites, user?.site]);

  const hasMultipleSites = availableSites.length > 1;

  const [selectedSite, setSelectedSite] = useState<number | null>(
    availableSites.length > 0 ? availableSites[0].site_id : null
  );

  // Use selected site as the active site
  const siteId = selectedSite;
  const currentSite = availableSites.find((s) => s.site_id === selectedSite);

  const [modalOpen, setModalOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [filterProduct, setFilterProduct] = useState<number | null>(null);
  const [filterStartDate, setFilterStartDate] = useState<string>("");
  const [filterEndDate, setFilterEndDate] = useState<string>("");
  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [auditEntityId, setAuditEntityId] = useState<number | null>(null);
  const [productionData, setProductionData] = useState<ProductionData[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);
  const [startDate, setStartDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [endDate, setEndDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );

  const [_formState, formAction] = useActionState(
    async (_prevData: any, data: any) => {
      try {
        const quantity = data.get("quantity");
        const unit = data.get("unit");
        const notes = data.get("notes");

        if (!selectedProduct || !siteId) {
          console.error("Please select a product");
          return;
        }

        if (new Date(startDate) > new Date(endDate)) {
          console.error("Start date cannot be after end date");
          return;
        }

        const result = await createProductionData({
          product_id: selectedProduct,
          site_id: siteId,
          quantity: parseFloat(quantity),
          unit,
          start_date: startDate,
          end_date: endDate,
          notes,
        });

        setProductionData((prev) => [result.productionData, ...prev]);
        setModalOpen(false);
        setSelectedProduct(null);
        handleLoadData();
      } catch (error) {
        console.error(error);
      }
    },
    null
  );

  const handleLoadData = useCallback(async () => {
    if (!siteId) return;

    try {
      setLoading(true);
      const params: { startDate?: string; endDate?: string; productId?: number } = {};
      if (filterProduct) params.productId = filterProduct;
      if (filterStartDate) params.startDate = filterStartDate;
      if (filterEndDate) params.endDate = filterEndDate;

      const [dataResult, productsResult] = await Promise.all([
        getProductionDataBySite(siteId, Object.keys(params).length > 0 ? params : undefined),
        getProductsBySite(siteId),
      ]);
      setProductionData(dataResult);
      setProducts(productsResult);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  }, [siteId, filterProduct, filterStartDate, filterEndDate]);

  useEffect(() => {
    if (siteId) {
      handleLoadData();
    }
  }, [siteId, handleLoadData]);

  const handleEdit = async (row: ProductionData, updates: Partial<ProductionData>) => {
    try {
      await updateProductionData(row.production_id, updates as any);
      handleLoadData();
    } catch (error) {
      console.error("Error updating:", error);
      throw error;
    }
  };

  const handleDelete = async (row: ProductionData) => {
    try {
      await deleteProductionData(row.production_id);
      setProductionData((prev) =>
        prev.filter((item) => item.production_id !== row.production_id)
      );
    } catch (error) {
      console.error("Error deleting:", error);
      throw error;
    }
  };

  const siteOptions: DropdownOption[] = availableSites.map((site) => ({
    id: site.site_id,
    label: site.name,
  }));

  const productOptions: DropdownOption[] = products.map((product) => ({
    id: product.product_id,
    label: `${product.name} (${product.unit})`,
  }));

  // Set initial site when availableSites becomes available
  useEffect(() => {
    if (availableSites.length > 0 && selectedSite === null) {
      setSelectedSite(availableSites[0].site_id);
    }
  }, [availableSites, selectedSite]);

  // Reset products when site changes
  useEffect(() => {
    setSelectedProduct(null);
    setProducts([]);
  }, [selectedSite]);

  const selectedProductUnit =
    products.find((p) => p.product_id === selectedProduct)?.unit || "";

  const statusStyles = isDark
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

  const columns: Column<ProductionData>[] = [
    { key: "production_id", label: "ID", editable: false },
    {
      key: "product" as any,
      label: "Product",
      editable: false,
      render: (_v: any, row: ProductionData) => row.product?.name || "N/A",
    },
    { key: "quantity", label: "Quantity", editable: true, type: "number" },
    { key: "unit", label: "Unit", editable: true, type: "text" },
    {
      key: "start_date",
      label: "Start Date",
      editable: true,
      type: "date",
      render: (value: string) => new Date(value).toLocaleDateString(),
    },
    {
      key: "end_date",
      label: "End Date",
      editable: true,
      type: "date",
      render: (value: string) => new Date(value).toLocaleDateString(),
    },
    { key: "notes", label: "Notes", editable: true, type: "text" },
    {
      key: "status" as any,
      label: "Status",
      editable: false,
      render: (_v: any, row: ProductionData) => (
        <div>
          <span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${statusStyles[row.status] || ""}`}>
            {row.status}
          </span>
          {row.status === "rejected" && row.review_comment && (
            <div className={`text-xs mt-1 ${isDark ? "text-red-400" : "text-red-600"}`}>
              {row.review_comment}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "history" as any,
      label: "History",
      editable: false,
      render: (_v: any, row: ProductionData) => (
        <button
          onClick={() => {
            setAuditEntityId(row.production_id);
            setAuditModalOpen(true);
          }}
          className={`px-2 py-1 text-xs rounded ${isDark ? "bg-slate-600 text-slate-300 hover:bg-slate-500" : "bg-gray-200 text-gray-700 hover:bg-gray-300"}`}
          title="View edit history"
        >
          History
        </button>
      ),
    },
  ];

  // Theme classes
  const containerClass = isDark
    ? "p-6 bg-slate-900 min-h-screen text-slate-100"
    : "p-6 bg-gray-50 min-h-screen text-gray-900";

  const labelClass = isDark
    ? "block text-sm font-medium mb-1 text-slate-300"
    : "block text-sm font-medium mb-1 text-gray-700";

  const inputClass = isDark
    ? "w-full border border-slate-600 bg-slate-700 text-slate-200 px-3 py-2 rounded focus:outline-none focus:ring focus:ring-blue-500/30"
    : "w-full border border-gray-300 px-3 py-2 rounded focus:outline-none focus:ring focus:ring-blue-300";

  const warningClass = isDark
    ? "mb-4 p-4 bg-yellow-900/20 border border-yellow-700/30 rounded text-yellow-400"
    : "mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded text-yellow-800";

  const emptyClass = isDark
    ? "text-center text-slate-400"
    : "text-center text-gray-500";

  const cancelBtnClass = isDark
    ? "mr-4 px-4 py-2 bg-slate-600 text-slate-200 rounded hover:bg-slate-500"
    : "mr-4 px-4 py-2 bg-gray-300 rounded hover:bg-gray-400";

  if (!siteId) {
    return (
      <div className={containerClass}>
        <div className={emptyClass}>
          No site assigned. Please contact your administrator.
        </div>
      </div>
    );
  }

  return (
    <div className={containerClass}>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">
          Production Data Entry {currentSite ? `- ${currentSite.name}` : ""}
        </h1>
        <div className="flex gap-3">
          <button
            onClick={() => setBulkUploadOpen(true)}
            disabled={products.length === 0}
            className={`px-4 py-2 rounded flex items-center gap-2 ${isDark
              ? "bg-slate-700 border border-slate-600 text-slate-200 hover:bg-slate-600"
              : "bg-white border border-blue-600 text-blue-600 hover:bg-blue-50"
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Upload Excel
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            disabled={products.length === 0}
          >
            Add Production Data
          </button>
        </div>
      </div>

      {/* Site Selector - only show when user has multiple sites */}
      {hasMultipleSites && (
        <div className="mb-4">
          <label className={labelClass}>Select Site</label>
          <div className="w-64">
            <Dropdown
              options={siteOptions}
              placeholder="Select Site"
              value={selectedSite}
              onChange={(option) => setSelectedSite(option?.id as number)}
              searchable={true}
            />
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div>
          <label className={labelClass}>Product</label>
          <Dropdown
            options={productOptions}
            placeholder="All Products"
            value={filterProduct}
            onChange={(option) => setFilterProduct(option ? (option.id as number) : null)}
            searchable={true}
            clearable={true}
          />
        </div>
        <div>
          <label className={labelClass}>Start Date</label>
          <input
            type="date"
            value={filterStartDate}
            onChange={(e) => setFilterStartDate(e.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>End Date</label>
          <input
            type="date"
            value={filterEndDate}
            onChange={(e) => setFilterEndDate(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      {products.length === 0 && !loading && (
        <div className={warningClass}>
          No products found for this site. Please contact your administrator to add products.
        </div>
      )}

      <Modal
        title="Add Production Data"
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedProduct(null);
        }}
        isDark={isDark}
      >
        <form action={formAction}>
          <div className="mb-4">
            <label className={labelClass}>Product</label>
            <Dropdown
              options={productOptions}
              placeholder="Select Product"
              value={selectedProduct}
              onChange={(option) => setSelectedProduct(option ? (option.id as number) : null)}
              searchable={true}
            />
          </div>
          <div className="mb-4">
            <label className={labelClass}>Quantity</label>
            <input
              type="number"
              name="quantity"
              required
              step="0.0001"
              min="0"
              className={inputClass}
            />
          </div>
          <div className="mb-4">
            <label className={labelClass}>Unit</label>
            <input
              key={selectedProduct}
              type="text"
              name="unit"
              required
              defaultValue={selectedProductUnit}
              className={inputClass}
            />
          </div>
          <div className="mb-4">
            <label className={labelClass}>Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
              className={inputClass}
            />
          </div>
          <div className="mb-4">
            <label className={labelClass}>End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
              className={inputClass}
            />
          </div>
          <div className="mb-4">
            <label className={labelClass}>Notes (Optional)</label>
            <textarea
              name="notes"
              className={inputClass}
              rows={2}
            />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                setModalOpen(false);
                setSelectedProduct(null);
              }}
              className={cancelBtnClass}
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

      <Table<ProductionData>
        data={productionData}
        columns={columns}
        keyField="production_id"
        onEdit={handleEdit}
        onDelete={handleDelete}
        loading={loading}
        showActions={true}
        isDark={isDark}
        renderActions={(row, { editButton, deleteButton }) => {
          if (row.status === "approved") {
            return null;
          }
          return (
            <>
              {editButton}
              {deleteButton}
            </>
          );
        }}
      />

      {/* Audit Trail Modal */}
      {auditEntityId && (
        <AuditTrailModal
          isOpen={auditModalOpen}
          onClose={() => {
            setAuditModalOpen(false);
            setAuditEntityId(null);
          }}
          entityType="production_data"
          entityId={auditEntityId}
          isDark={isDark}
        />
      )}

      {/* Bulk Upload Modal */}
      <ProductionDataBulkUpload
        isOpen={bulkUploadOpen}
        onClose={() => setBulkUploadOpen(false)}
        products={products}
        siteId={siteId}
        isDark={isDark}
        onImportComplete={() => handleLoadData()}
      />
    </div>
  );
};

export default ProductionDataPage;
