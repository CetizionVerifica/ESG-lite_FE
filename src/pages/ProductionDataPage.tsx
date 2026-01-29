import { useActionState, useState, useEffect, useCallback, useMemo } from "react";
import Modal from "../components/Modal";
import Dropdown, { DropdownOption } from "../components/Dropdown";
import { Table, Column } from "../components/Table";
import { useAuth } from "../context/AuthContext";
import { getProductsBySite, Product } from "../services/productService";
import {
  getProductionDataBySite,
  createProductionData,
  updateProductionData,
  deleteProductionData,
  ProductionData,
} from "../services/productionDataService";

interface Site {
  site_id: number;
  name: string;
}

const ProductionDataPage = () => {
  const { user } = useAuth();

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

  useEffect(() => {
    if (siteId) {
      handleLoadData();
    }
  }, [siteId]);

  const handleLoadData = useCallback(async () => {
    if (!siteId) return;

    try {
      setLoading(true);
      const [dataResult, productsResult] = await Promise.all([
        getProductionDataBySite(siteId),
        getProductsBySite(siteId),
      ]);
      setProductionData(dataResult);
      setProducts(productsResult);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  }, [siteId]);

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
  ];

  if (!siteId) {
    return (
      <div className="p-6">
        <div className="text-center text-gray-500">
          No site assigned. Please contact your administrator.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">
          Production Data Entry {currentSite ? `- ${currentSite.name}` : ""}
        </h1>
        <button
          onClick={() => setModalOpen(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          disabled={products.length === 0}
        >
          Add Production Data
        </button>
      </div>

      {/* Site Selector - only show when user has multiple sites */}
      {hasMultipleSites && (
        <div className="mb-6">
          <label className="block text-sm font-medium mb-1">Select Site</label>
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

      {products.length === 0 && !loading && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded text-yellow-800">
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
      >
        <form action={formAction}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Product</label>
            <Dropdown
              options={productOptions}
              placeholder="Select Product"
              value={selectedProduct}
              onChange={(option) => setSelectedProduct(option.id as number)}
              searchable={true}
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Quantity</label>
            <input
              type="number"
              name="quantity"
              required
              step="0.0001"
              min="0"
              className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Unit</label>
            <input
              type="text"
              name="unit"
              required
              defaultValue={selectedProductUnit}
              className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              required
              className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              required
              className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Notes (Optional)</label>
            <textarea
              name="notes"
              className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
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
              className="mr-4 px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
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
      />
    </div>
  );
};

export default ProductionDataPage;
