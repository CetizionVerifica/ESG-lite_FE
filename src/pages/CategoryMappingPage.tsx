import { useState, useEffect } from "react";
import { Trash2, Upload, Search, Pencil, Check, X } from "lucide-react";
import Dropdown, { DropdownOption } from "../components/Dropdown";
import MappingUploadModal from "../components/MappingUploadModal";
import {
  getMappings,
  deleteMapping,
  bulkDeleteMappings,
  updateMapping,
  CategoryMapping,
} from "../services/categoryMappingService";
import { getCompanies } from "../services/companyService";
import { getSites } from "../services/siteService";
import { getCategories } from "../services/categoryService";

interface Company {
  company_id: number;
  name: string;
}

interface Site {
  site_id: number;
  name: string;
}

interface Category {
  category_id: number;
  category_name: string;
}

const CategoryMappingPage = () => {
  const [mappings, setMappings] = useState<CategoryMapping[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCompanyId, setFilterCompanyId] = useState<number | null>(null);
  const [filterCategoryId, setFilterCategoryId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<{
    company_category_name: string;
    global_category_name: string;
  }>({ company_category_name: "", global_category_name: "" });
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Fetch data
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [mappingsData, companiesData, sitesData, categoriesData] = await Promise.all([
          getMappings(filterCompanyId ?? undefined, filterCategoryId ?? undefined),
          getCompanies(),
          getSites(),
          getCategories(),
        ]);
        setMappings(mappingsData);
        setCompanies(companiesData);
        setSites(sitesData);
        setCategories(categoriesData);
      } catch (error) {
        console.error("Failed to fetch data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [filterCompanyId, filterCategoryId, refreshTrigger]);

  // Filter by search
  const filteredMappings = mappings.filter((m) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      m.company_category_name.toLowerCase().includes(term) ||
      m.global_category_name.toLowerCase().includes(term) ||
      m.company_name.toLowerCase().includes(term)
    );
  });

  // Selection
  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredMappings.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredMappings.map((m) => m.id)));
    }
  };

  // Delete
  const handleDelete = async (id: number) => {
    if (!confirm("Delete this mapping?")) return;
    try {
      await deleteMapping(id);
      setRefreshTrigger((p) => p + 1);
    } catch (error) {
      console.error("Delete failed:", error);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} mapping(s)?`)) return;
    try {
      await bulkDeleteMappings(Array.from(selectedIds));
      setSelectedIds(new Set());
      setRefreshTrigger((p) => p + 1);
    } catch (error) {
      console.error("Bulk delete failed:", error);
    }
  };

  // Inline edit
  const startEdit = (m: CategoryMapping) => {
    setEditingId(m.id);
    setEditValues({
      company_category_name: m.company_category_name,
      global_category_name: m.global_category_name,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
  };

  const saveEdit = async () => {
    if (editingId === null) return;
    try {
      await updateMapping(editingId, editValues);
      setEditingId(null);
      setRefreshTrigger((p) => p + 1);
    } catch (error) {
      console.error("Update failed:", error);
    }
  };

  // Dropdown options
  const companyOptions: DropdownOption[] = [
    { id: "all", label: "All Companies" },
    ...companies.map((c) => ({ id: c.company_id, label: c.name })),
  ];

  const categoryOptions: DropdownOption[] = [
    { id: "all", label: "All Categories" },
    ...categories.map((c) => ({ id: c.category_id, label: c.category_name })),
  ];

  const getSiteName = (siteId: number | null) => {
    if (!siteId) return "All Sites";
    const site = sites.find((s) => s.site_id === siteId);
    return site?.name || `Site #${siteId}`;
  };

  const getCategoryName = (categoryId: number) => {
    const cat = categories.find((c) => c.category_id === categoryId);
    return cat?.category_name || `Category #${categoryId}`;
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Category Mappings</h1>
        <button
          onClick={() => setUploadOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          <Upload size={16} />
          Upload Mapping
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-4">
        <div className="w-56">
          <Dropdown
            options={companyOptions}
            value={filterCompanyId ?? "all"}
            onChange={(opt) =>
              setFilterCompanyId(opt.id === "all" ? null : Number(opt.id))
            }
            placeholder="Filter by company"
            searchable
          />
        </div>
        <div className="w-56">
          <Dropdown
            options={categoryOptions}
            value={filterCategoryId ?? "all"}
            onChange={(opt) =>
              setFilterCategoryId(opt.id === "all" ? null : Number(opt.id))
            }
            placeholder="Filter by category"
            searchable
          />
        </div>
        <div className="flex-1 relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Search mappings..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded text-sm"
          />
        </div>
        {selectedIds.size > 0 && (
          <button
            onClick={handleBulkDelete}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            <Trash2 size={16} />
            Delete ({selectedIds.size})
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12 text-gray-500">Loading...</div>
      ) : filteredMappings.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No category mappings found. Upload a mapping Excel to get started.
        </div>
      ) : (
        <div className="border rounded overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="p-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={
                      selectedIds.size === filteredMappings.length &&
                      filteredMappings.length > 0
                    }
                    onChange={toggleSelectAll}
                  />
                </th>
                <th className="p-3 text-left">Company</th>
                <th className="p-3 text-left">Category</th>
                <th className="p-3 text-left">Company Category</th>
                <th className="p-3 text-left">Global Category</th>
                <th className="p-3 text-left">Site</th>
                <th className="p-3 text-left w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredMappings.map((m) => (
                <tr key={m.id} className="border-t hover:bg-gray-50">
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(m.id)}
                      onChange={() => toggleSelect(m.id)}
                    />
                  </td>
                  <td className="p-3 font-medium">{m.company_name}</td>
                  <td className="p-3 text-gray-600">
                    {getCategoryName(m.category_id)}
                  </td>
                  <td className="p-3">
                    {editingId === m.id ? (
                      <input
                        className="border rounded px-2 py-1 text-sm w-full"
                        value={editValues.company_category_name}
                        onChange={(e) =>
                          setEditValues((v) => ({
                            ...v,
                            company_category_name: e.target.value,
                          }))
                        }
                      />
                    ) : (
                      m.company_category_name
                    )}
                  </td>
                  <td className="p-3">
                    {editingId === m.id ? (
                      <input
                        className="border rounded px-2 py-1 text-sm w-full"
                        value={editValues.global_category_name}
                        onChange={(e) =>
                          setEditValues((v) => ({
                            ...v,
                            global_category_name: e.target.value,
                          }))
                        }
                      />
                    ) : (
                      m.global_category_name
                    )}
                  </td>
                  <td className="p-3 text-gray-500">
                    {getSiteName(m.site_id)}
                  </td>
                  <td className="p-3">
                    {editingId === m.id ? (
                      <div className="flex gap-1">
                        <button
                          onClick={saveEdit}
                          className="p-1 text-green-600 hover:bg-green-50 rounded"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="p-1 text-gray-500 hover:bg-gray-100 rounded"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        <button
                          onClick={() => startEdit(m)}
                          className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                        >
                          <Pencil size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(m.id)}
                          className="p-1 text-red-600 hover:bg-red-50 rounded"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Upload Modal */}
      <MappingUploadModal
        isOpen={uploadOpen}
        onClose={() => setUploadOpen(false)}
        companies={companies}
        sites={sites}
        categories={categories}
        onRefresh={() => setRefreshTrigger((p) => p + 1)}
      />
    </div>
  );
};

export default CategoryMappingPage;
