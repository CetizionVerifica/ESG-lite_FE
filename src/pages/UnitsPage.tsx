import { useState, useEffect, useCallback, useActionState } from "react";
import Dropdown, { DropdownOption } from "../components/Dropdown";
import Modal from "../components/Modal";
import { Table, Column } from "../components/Table";
import { getSites } from "../services/siteService";
import { getCategories } from "../services/categoryService";
import {
  getUnits,
  getUnitsBySiteAndCategory,
  createUnit,
  updateUnit,
  deleteUnit,
  UnitData,
} from "../services/unitService";

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

interface UnitRow {
  unit_id: number;
  unit_name: string;
  description: string | null;
  site?: { site_id: number; name: string };
  category?: { category_id: number; category_name: string };
}

const UnitsPage = () => {
  const [sites, setSites] = useState<Site[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [selectedSite, setSelectedSite] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  // Form state for modal
  const [formSiteId, setFormSiteId] = useState<number | null>(null);
  const [formCategoryId, setFormCategoryId] = useState<number | null>(null);

  const [_formState, formAction] = useActionState(
    async (_prevData: any, data: FormData) => {
      try {
        const unit_name = data.get("unit_name") as string;
        const description = data.get("description") as string;

        if (!formSiteId || !formCategoryId) {
          console.error("Please select both site and category");
          return { error: "Please select both site and category" };
        }

        if (!unit_name?.trim()) {
          console.error("Unit name is required");
          return { error: "Unit name is required" };
        }

        await createUnit({
          unit_name: unit_name.trim(),
          description: description?.trim() || undefined,
          site_id: formSiteId,
          category_id: formCategoryId,
        });

        setModalOpen(false);
        resetForm();
        loadUnits();
        return { success: true };
      } catch (error: any) {
        console.error("Error creating unit:", error);
        return { error: error?.response?.data?.message || "Failed to create unit" };
      }
    },
    null
  );

  const resetForm = () => {
    setFormSiteId(null);
    setFormCategoryId(null);
  };

  // Load initial data (sites and categories)
  useEffect(() => {
    handleLoadInitialData();
  }, []);

  const handleLoadInitialData = useCallback(async () => {
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

  // Load units based on filters
  const loadUnits = useCallback(async () => {
    try {
      setDataLoading(true);
      let data: UnitData[];

      if (selectedSite && selectedCategory) {
        data = await getUnitsBySiteAndCategory(selectedSite, selectedCategory);
      } else {
        data = await getUnits();
        // Apply filters locally if only one is selected
        if (selectedSite) {
          data = data.filter((u) => u.site?.site_id === selectedSite);
        }
        if (selectedCategory) {
          data = data.filter((u) => u.category?.category_id === selectedCategory);
        }
      }

      setUnits(data);
    } catch (error) {
      console.error("Error loading units:", error);
    } finally {
      setDataLoading(false);
    }
  }, [selectedSite, selectedCategory]);

  useEffect(() => {
    loadUnits();
  }, [loadUnits]);

  const handleEdit = async (row: UnitRow, updates: Partial<UnitRow>) => {
    try {
      const apiUpdates: {
        unit_name?: string;
        description?: string;
      } = {};

      if (updates.unit_name !== undefined) apiUpdates.unit_name = updates.unit_name;
      if (updates.description !== undefined) apiUpdates.description = updates.description || undefined;

      await updateUnit(row.unit_id, apiUpdates);
      setUnits((prev) =>
        prev.map((item) =>
          item.unit_id === row.unit_id ? { ...item, ...updates } : item
        )
      );
    } catch (error) {
      console.error("Error updating unit:", error);
      throw error;
    }
  };

  const handleDelete = async (row: UnitRow) => {
    try {
      await deleteUnit(row.unit_id);
      setUnits((prev) => prev.filter((item) => item.unit_id !== row.unit_id));
    } catch (error) {
      console.error("Error deleting unit:", error);
      throw error;
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
  const formCategoryOptions: DropdownOption[] = (selectedSiteForForm?.categories || []).map(
    (category) => ({
      id: category.category_id,
      label: category.category_name,
    })
  );

  const columns: Column<UnitRow>[] = [
    {
      key: "unit_id",
      label: "ID",
      editable: false,
    },
    {
      key: "site",
      label: "Site",
      editable: false,
      render: (_value: any, row: UnitRow) => row.site?.name || "N/A",
    },
    {
      key: "category",
      label: "Category",
      editable: false,
      render: (_value: any, row: UnitRow) => row.category?.category_name || "N/A",
    },
    {
      key: "unit_name",
      label: "Unit Name",
      editable: true,
      type: "text",
    },
    {
      key: "description",
      label: "Description",
      editable: true,
      type: "text",
      render: (value: any) => value || "N/A",
    },
  ];

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Units</h1>
        <button
          onClick={() => setModalOpen(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Add Unit
        </button>
      </div>

      <Modal
        title="Add Unit"
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
                  setFormCategoryId(null);
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
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Unit Name *</label>
            <input
              type="text"
              name="unit_name"
              required
              placeholder="e.g., kWh, liters, kg"
              className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Description</label>
            <input
              type="text"
              name="description"
              placeholder="e.g., Kilowatt hours of electricity"
              className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
            />
          </div>
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

      {loading ? (
        <div className="text-center py-4">Loading...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium mb-1">Filter by Site</label>
            <Dropdown
              options={siteOptions}
              placeholder="All Sites"
              value={selectedSite}
              onChange={(option) => setSelectedSite(option?.id as number)}
              searchable={true}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Filter by Category</label>
            <Dropdown
              options={categoryOptions}
              placeholder="All Categories"
              value={selectedCategory}
              onChange={(option) => setSelectedCategory(option?.id as number)}
              searchable={true}
            />
          </div>
        </div>
      )}

      <Table<UnitRow>
        data={units}
        columns={columns}
        keyField="unit_id"
        onEdit={handleEdit}
        onDelete={handleDelete}
        loading={dataLoading}
        showActions={true}
      />
    </div>
  );
};

export default UnitsPage;
