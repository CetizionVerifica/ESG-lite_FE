import { useActionState, useState, useEffect, useCallback } from "react";
import Modal from "../components/Modal";
import Dropdown, { DropdownOption } from "../components/Dropdown";
import { Table, Column } from "../components/Table";
import {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  Product,
} from "../services/productService";
import { getSites } from "../services/siteService";

interface Site {
  site_id: number;
  name: string;
}

const ProductPage = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSite, setSelectedSite] = useState<number | null>(null);

  const [_formState, formAction] = useActionState(
    async (_prevData: any, data: any) => {
      try {
        const name = data.get("name");
        const description = data.get("description");
        const unit = data.get("unit");

        if (!selectedSite) {
          console.error("Please select a site");
          return;
        }

        const result = await createProduct({
          name,
          description,
          unit,
          site_id: selectedSite,
        });

        setProducts((prev) => [...prev, result.product]);
        setModalOpen(false);
        setSelectedSite(null);
        handleLoadData();
      } catch (error) {
        console.error(error);
      }
    },
    null
  );

  useEffect(() => {
    handleLoadData();
  }, []);

  const handleLoadData = useCallback(async () => {
    try {
      setLoading(true);
      const [productsData, sitesData] = await Promise.all([
        getProducts(),
        getSites(),
      ]);
      setProducts(productsData);
      setSites(sitesData);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleEdit = async (row: Product, updates: Partial<Product>) => {
    try {
      await updateProduct(row.product_id, updates as any);
      handleLoadData();
    } catch (error) {
      console.error("Error updating product:", error);
      throw error;
    }
  };

  const handleDelete = async (row: Product) => {
    try {
      await deleteProduct(row.product_id);
      setProducts((prev) => prev.filter((item) => item.product_id !== row.product_id));
    } catch (error) {
      console.error("Error deleting product:", error);
      throw error;
    }
  };

  const siteOptions: DropdownOption[] = sites.map((site) => ({
    id: site.site_id,
    label: site.name,
  }));

  const columns: Column<Product>[] = [
    { key: "product_id", label: "ID", editable: false },
    { key: "name", label: "Product Name", editable: true, type: "text" },
    { key: "description", label: "Description", editable: true, type: "text" },
    { key: "unit", label: "Default Unit", editable: true, type: "text" },
    {
      key: "site" as any,
      label: "Site",
      editable: false,
      render: (_value: any, row: Product) => row.site?.name || "N/A",
    },
  ];

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Products</h1>
        <button
          onClick={() => setModalOpen(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Add Product
        </button>
      </div>

      <Modal
        title="Add Product"
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedSite(null);
        }}
      >
        <form action={formAction}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Product Name</label>
            <input
              type="text"
              name="name"
              required
              className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              name="description"
              className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
              rows={3}
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Default Unit</label>
            <input
              type="text"
              name="unit"
              required
              placeholder="e.g., tonnes, units, kWh"
              className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Site</label>
            <Dropdown
              options={siteOptions}
              placeholder="Select Site"
              value={selectedSite}
              onChange={(option) => setSelectedSite(option ? (option.id as number) : null)}
              searchable={true}
            />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                setModalOpen(false);
                setSelectedSite(null);
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

      <Table<Product>
        data={products}
        columns={columns}
        keyField="product_id"
        onEdit={handleEdit}
        onDelete={handleDelete}
        loading={loading}
        showActions={true}
      />
    </div>
  );
};

export default ProductPage;
