import { useState, useEffect, useCallback, useActionState } from "react";
import Dropdown, { DropdownOption } from "../components/Dropdown";
import Modal from "../components/Modal";
import { getSites } from "../services/siteService";
import { getColumns } from "../services/columnService";
import { createColumnConfig } from "../services/columnConfigService";
import { getCategories } from "../services/categoryService"; // Import getCategories
import ColumnConfigList from "../components/ColumnConfigList";

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

interface Column {
  pk_id: number;
  column_name: string;
  column_type: string;
}

const ColumnConfig = () => {
  const [sites, setSites] = useState<Site[]>([]);
  const [allCategories, setAllCategories] = useState<Category[]>([]); // Store all categories
  const [columns, setColumns] = useState<Column[]>([]);
  const [selectedSite, setSelectedSite] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Form state
  const [formSite, setFormSite] = useState<number | null>(null);
  const [formCategory, setFormCategory] = useState<number | null>(null);
  const [formColumns, setFormColumns] = useState<number[]>([]);
  const [isGlobal, setIsGlobal] = useState(false); // Global flag

  const [_formState, formAction] = useActionState(
    async (_prevData: any, data: FormData) => {
      try {
        const config_name = data.get("config_name") as string;

        // Validation: If not global, site is required.
        // If global, site is optional (null).
        if (!config_name || (!isGlobal && !formSite) || !formCategory) {
          console.error("Config name, category (and site if not global) are required");
          return { error: "Config name and category are required. Site is required for non-global configs." };
        }

        await createColumnConfig({
          config_name,
          // Placeholder to fix lint - will check service file next turn.
          // Actually I can just cast to `any` for `site_id` temporarily or use `undefined as any` if strict.
          // But better to check.
          // I will view the file `src/services/columnConfigService.ts` in next step.
          // For now, I'll return empty to cancel this tool call and use view_file.
          // Wait, I cannot return empty.
          // I will just cast to `any` for now to fix the build, then fix the service type.
          site_id: isGlobal ? undefined : (formSite || undefined),
          category_id: formCategory,
          column_ids: formColumns.length > 0 ? formColumns : undefined,
        });

        setModalOpen(false);
        resetForm();
        setRefreshTrigger((prev) => prev + 1);
        return { success: true };
      } catch (error: any) {
        console.error("Error creating column config:", error);
        return { error: error?.response?.data?.message || "Failed to create column config" };
      }
    },
    null
  );

  const resetForm = () => {
    setFormSite(null);
    setFormCategory(null);
    setFormColumns([]);
    setIsGlobal(false);
  };

  useEffect(() => {
    handleLoadData();
  }, []);

  const handleLoadData = useCallback(async () => {
    try {
      setLoading(true);
      const [sitesData, columnsData, categoriesData] = await Promise.all([
        getSites(),
        getColumns(),
        getCategories(), // Fetch all categories
      ]);
      setSites(sitesData);
      setColumns(columnsData);
      setAllCategories(categoriesData);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const siteOptions: DropdownOption[] = sites.map((site) => ({
    id: site.site_id,
    label: site.name,
  }));

  // Get categories for the selected filter site
  const selectedSiteData = sites.find((site) => site.site_id === selectedSite);
  // If no site selected in filter, show ALL categories? Or valid strategy?
  // Let's stick to current behavior: Filter needs site first.
  const categoryOptions: DropdownOption[] = (selectedSiteData?.categories || []).map((category) => ({
    id: category.category_id,
    label: category.category_name,
  }));

  // NOTE: If we want to see Global configs in the list, we might need a "Global" option in the Site Filter.
  // We can add a fake Site option { id: -1, label: "Global Templates" }?
  // For now, let's just focus on Creation.

  // Get categories for the form
  // If Global, use allCategories. If not global, use formSite's categories.
  const formCategoryOptions: DropdownOption[] = isGlobal
    ? allCategories.map((c) => ({ id: c.category_id, label: c.category_name }))
    : (sites.find((s) => s.site_id === formSite)?.categories || []).map((c) => ({
      id: c.category_id,
      label: c.category_name,
    }));

  const handleColumnToggle = (columnId: number) => {
    setFormColumns((prev) =>
      prev.includes(columnId)
        ? prev.filter((id) => id !== columnId)
        : [...prev, columnId]
    );
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Column Configurations</h1>
        <button
          onClick={() => setModalOpen(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Add Column Config
        </button>
      </div>

      <Modal
        title="Add Column Config"
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          resetForm();
        }}
      >
        <form action={formAction}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Config Name *</label>
            <input
              type="text"
              name="config_name"
              required
              placeholder="e.g., Default Config"
              className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
            />
          </div>

          {/* Global Checkbox */}
          <div className="mb-4 flex items-center gap-2">
            <input
              type="checkbox"
              id="isGlobal"
              checked={isGlobal}
              onChange={(e) => {
                setIsGlobal(e.target.checked);
                setFormSite(null);
                setFormCategory(null); // Reset category as list changes
              }}
              className="rounded"
            />
            <label htmlFor="isGlobal" className="text-sm font-medium cursor-pointer">
              Set as Global / Default Template (for new companies)
            </label>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Site {isGlobal ? "(Disabled)" : "*"}</label>
            <Dropdown
              options={siteOptions}
              placeholder={isGlobal ? "Global Config (No Site)" : "Select Site"}
              value={formSite}
              onChange={(option) => {
                setFormSite(option?.id as number);
                setFormCategory(null);
              }}
              searchable={true}
              disabled={isGlobal}
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Category *</label>
            <Dropdown
              options={formCategoryOptions}
              placeholder={isGlobal || formSite ? "Select Category" : "Select a site first"}
              value={formCategory}
              onChange={(option) => setFormCategory(option?.id as number)}
              searchable={true}
              disabled={!isGlobal && !formSite}
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Columns (Optional)</label>
            <div className="border rounded p-3 max-h-48 overflow-y-auto">
              {columns.length === 0 ? (
                <p className="text-gray-500 text-sm">No columns available</p>
              ) : (
                columns.map((col) => (
                  <label key={col.pk_id} className="flex items-center gap-2 py-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formColumns.includes(col.pk_id)}
                      onChange={() => handleColumnToggle(col.pk_id)}
                      className="rounded"
                    />
                    <span>{col.column_name}</span>
                    <span className="text-gray-500 text-sm">({col.column_type})</span>
                  </label>
                ))
              )}
            </div>
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
              placeholder="Select Site"
              value={selectedSite}
              onChange={(option) => {
                setSelectedSite(option?.id as number);
                setSelectedCategory(null);
              }}
              searchable={true}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Filter by Category</label>
            <Dropdown
              options={categoryOptions}
              placeholder={selectedSite ? "Select Category" : "Select a site first"}
              value={selectedCategory}
              onChange={(option) => setSelectedCategory(option?.id as number)}
              searchable={true}
              disabled={!selectedSite}
            />
          </div>
        </div>
      )}

      <ColumnConfigList
        refreshTrigger={refreshTrigger}
        siteId={selectedSite}
        categoryId={selectedCategory}
      />
    </div>
  );
};

export default ColumnConfig;
