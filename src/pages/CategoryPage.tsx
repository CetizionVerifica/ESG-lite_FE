import { useActionState, useState, useEffect } from "react";
import Modal from "../components/Modal";
import { Table, Column } from "../components/Table";
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "../services/categoryService";
import { getSites } from "../services/siteService";

interface Category {
  category_id: number;
  category_name: string;
  scope: string | null;
}

interface SiteOption {
  site_id: number;
  name: string;
}

const CategoryPage = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);

  const [sites, setSites] = useState<SiteOption[]>([]);
  const [assignAll, setAssignAll] = useState(false);
  const [selectedSiteIds, setSelectedSiteIds] = useState<number[]>([]);
  const [status, setStatus] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  // Bumping this remounts the form to clear its uncontrolled inputs after a save.
  const [formKey, setFormKey] = useState(0);

  const resetSiteSelection = () => {
    setAssignAll(false);
    setSelectedSiteIds([]);
  };

  const openModal = () => {
    setStatus(null);
    resetSiteSelection();
    setFormKey((k) => k + 1);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setStatus(null);
    resetSiteSelection();
  };

  const toggleSite = (siteId: number) => {
    setSelectedSiteIds((prev) =>
      prev.includes(siteId)
        ? prev.filter((id) => id !== siteId)
        : [...prev, siteId],
    );
  };

  const [_formState, formAction] = useActionState(
    async (_prevData: any, data: any) => {
      setStatus(null);
      try {
        const category_name = data.get("category_name");
        const scopeValue = data.get("scope");
        // Pass null if scope is empty, otherwise use the trimmed value
        const scope = scopeValue?.trim() || null;

        await createCategory({
          category_name,
          scope,
          assign_all_sites: assignAll,
          site_ids: assignAll ? [] : selectedSiteIds,
        });

        await handleLoadCategories();
        setStatus({
          type: "success",
          text: `Category "${category_name}" created successfully.`,
        });
        // Reset the form so another category can be added immediately.
        resetSiteSelection();
        setFormKey((k) => k + 1);
      } catch (error: any) {
        const text =
          error?.response?.data?.message ||
          "Failed to create category. Please try again.";
        setStatus({ type: "error", text });
      }
    },
    null,
  );

  useEffect(() => {
    handleLoadCategories();
    handleLoadSites();
  }, []);

  const handleLoadSites = async () => {
    try {
      const data = await getSites();
      setSites(data);
    } catch (error) {
      console.error("Error loading sites:", error);
    }
  };

  const handleLoadCategories = async () => {
    try {
      setLoading(true);
      const data = await getCategories();

      setCategories(data);
    } catch (error) {
      console.error("Error loading categories:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = async (row: Category, updates: Partial<Category>) => {
    try {
      await updateCategory(row.category_id, updates);
      setCategories((prev) =>
        prev.map((item) =>
          item.category_id === row.category_id ? { ...item, ...updates } : item,
        ),
      );
    } catch (error) {
      console.error("Error updating category:", error);
      throw error;
    }
  };

  const handleDelete = async (row: Category) => {
    try {
      await deleteCategory(row.category_id);
      setCategories((prev) =>
        prev.filter((item) => item.category_id !== row.category_id),
      );
    } catch (error) {
      console.error("Error deleting category:", error);
      throw error;
    }
  };

  const columns: Column<Category>[] = [
    {
      key: "category_id",
      label: "ID",
      editable: false,
    },
    {
      key: "category_name",
      label: "Category Name",
      editable: true,
      type: "text",
    },
    {
      key: "scope",
      label: "Scope",
      editable: true,
      type: "dropdown",
      options: [
        { id: "", label: "— None —" },
        { id: "Scope 1", label: "Scope 1" },
        { id: "Scope 2", label: "Scope 2" },
        { id: "Scope 3", label: "Scope 3" },
      ],
    },
  ];

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Categories</h1>
        <div className="flex gap-2">
          <button
            onClick={openModal}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Add Category
          </button>
        </div>
      </div>

      <Modal
        title="Add Category"
        isOpen={modalOpen}
        onClose={closeModal}
      >
        <form action={formAction} key={formKey}>
          {status && (
            <div
              className={`mb-4 rounded px-3 py-2 text-sm ${
                status.type === "success"
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800"
              }`}
              role="alert"
            >
              {status.text}
            </div>
          )}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">
              Category Name
            </label>
            <input
              type="text"
              name="category_name"
              required
              className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">
              Scope <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <select
              name="scope"
              defaultValue=""
              className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
            >
              <option value="">— Select scope —</option>
              <option value="Scope 1">Scope 1</option>
              <option value="Scope 2">Scope 2</option>
              <option value="Scope 3">Scope 3</option>
            </select>
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">
              Assign to Sites{" "}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <label className="flex items-center gap-2 mb-2 text-sm">
              <input
                type="checkbox"
                checked={assignAll}
                onChange={(e) => {
                  setAssignAll(e.target.checked);
                  if (e.target.checked) setSelectedSiteIds([]);
                }}
              />
              Assign to all sites
            </label>
            {!assignAll && (
              <div className="max-h-40 overflow-y-auto border rounded p-2 space-y-1">
                {sites.length === 0 ? (
                  <p className="text-sm text-gray-400">No sites available</p>
                ) : (
                  sites.map((site) => (
                    <label
                      key={site.site_id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={selectedSiteIds.includes(site.site_id)}
                        onChange={() => toggleSite(site.site_id)}
                      />
                      {site.name}
                    </label>
                  ))
                )}
              </div>
            )}
            <p className="mt-1 text-xs text-gray-400">
              Leave unselected to create the category without assigning it to any
              site.
            </p>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={closeModal}
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

      <Table<Category>
        data={categories}
        columns={columns}
        keyField="category_id"
        onEdit={handleEdit}
        onDelete={handleDelete}
        loading={loading}
        showActions={true}
      />
    </div>
  );
};

export default CategoryPage;
