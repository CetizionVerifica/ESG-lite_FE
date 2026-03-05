import { useState, useEffect, useCallback, useActionState } from "react";
import Dropdown, { DropdownOption } from "../components/Dropdown";
import Modal from "../components/Modal";
import { getSites } from "../services/siteService";
import { getColumns } from "../services/columnService";
import { createColumnConfig } from "../services/columnConfigService";
import ColumnConfigList from "../components/ColumnConfigList";
import AutoGenerateColumnConfigModal from "../components/AutoGenerateColumnConfigModal";

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
  const [columns, setColumns] = useState<Column[]>([]);
  const [selectedSite, setSelectedSite] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [autoGenModalOpen, setAutoGenModalOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Form state
  const [formSite, setFormSite] = useState<number | null>(null);
  const [formCategory, setFormCategory] = useState<number | null>(null);
  const [formColumns, setFormColumns] = useState<number[]>([]);

  const [_formState, formAction] = useActionState(
    async (_prevData: any, data: FormData) => {
      try {
        const config_name = data.get("config_name") as string;

        if (!config_name || !formSite || !formCategory) {
          console.error("Config name, site and category are required");
          return { error: "Config name, site and category are required" };
        }

        await createColumnConfig({
          config_name,
          site_id: formSite,
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
  };

  useEffect(() => {
    handleLoadData();
  }, []);

  const handleLoadData = useCallback(async () => {
    try {
      setLoading(true);
      const [sitesData, columnsData] = await Promise.all([
        getSites(),
        getColumns(),
      ]);
      setSites(sitesData);
      setColumns(columnsData);
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

  // Get categories for the selected site (filter dropdown)
  const selectedSiteData = sites.find((site) => site.site_id === selectedSite);
  const categoryOptions: DropdownOption[] = (selectedSiteData?.categories || []).map((category) => ({
    id: category.category_id,
    label: category.category_name,
  }));

  // Get categories for the form site (modal form)
  const formSiteData = sites.find((site) => site.site_id === formSite);
  const formCategoryOptions: DropdownOption[] = (formSiteData?.categories || []).map((category) => ({
    id: category.category_id,
    label: category.category_name,
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
        <div className="flex gap-2">
          <button
            onClick={() => setAutoGenModalOpen(true)}
            disabled={!selectedSite || !selectedCategory}
            className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            title={!selectedSite || !selectedCategory ? "Select a site and category first" : "Auto-generate from emission factors"}
          >
            Auto-Generate Config
          </button>
          <button
            onClick={() => setModalOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Add Column Config
          </button>
        </div>
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
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Site *</label>
            <Dropdown
              options={siteOptions}
              placeholder="Select Site"
              value={formSite}
              onChange={(option) => {
                setFormSite(option?.id as number);
                setFormCategory(null);
              }}
              searchable={true}
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Category *</label>
            <Dropdown
              options={formCategoryOptions}
              placeholder={formSite ? "Select Category" : "Select a site first"}
              value={formCategory}
              onChange={(option) => setFormCategory(option?.id as number)}
              searchable={true}
              disabled={!formSite}
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

      {selectedSite && selectedCategory && (
        <AutoGenerateColumnConfigModal
          isOpen={autoGenModalOpen}
          onClose={() => setAutoGenModalOpen(false)}
          siteId={selectedSite}
          categoryId={selectedCategory}
          onSuccess={() => setRefreshTrigger((prev) => prev + 1)}
        />
      )}
    </div>
  );
};

export default ColumnConfig;
