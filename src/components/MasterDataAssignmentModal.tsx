import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import Modal from "./Modal";
import Dropdown, { DropdownOption } from "./Dropdown";
import { getSiteMasterData, updateSiteMasterData } from "../services/siteService";
import { getUnitMasters, UnitMaster } from "../services/unitMasterService";
import { getCategories, getSubcategories } from "../services/masterDataService";

interface MasterDataNode {
    id: number;
    title: string;
    code: string;
    type: string;
    level: number;
    parent?: { id: number };
    is_active: boolean;
    assigned_unit?: string | null;
}

interface MasterDataAssignmentModalProps {
    isOpen: boolean;
    onClose: () => void;
    siteId: number | null;
    siteName: string;
}

const MasterDataAssignmentModal = ({
    isOpen,
    onClose,
    siteId,
    siteName,
}: MasterDataAssignmentModalProps) => {
    const [data, setData] = useState<MasterDataNode[]>([]);
    const [units, setUnits] = useState<UnitMaster[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    // Filters
    const [categories, setCategories] = useState<DropdownOption[]>([]);
    const [subcategories, setSubcategories] = useState<DropdownOption[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
    const [selectedSubcategories, setSelectedSubcategories] = useState<number[]>([]);

    // Search within results
    const [searchCode, setSearchCode] = useState("");
    const [searchTitle, setSearchTitle] = useState("");

    // Initial Load: Fetch Units & Categories
    useEffect(() => {
        if (isOpen && siteId) {
            fetchInitialData();
        }
    }, [isOpen, siteId]);

    const fetchInitialData = async () => {
        setLoading(true);
        try {
            const [unitsData, catsData] = await Promise.all([
                getUnitMasters(),
                getCategories()
            ]);
            setUnits(unitsData);

            const catOptions = catsData.map((c: any) => ({ id: c.id, label: c.title }));
            setCategories(catOptions);

            // Default Category: Index 0
            if (catOptions.length > 0) {
                setSelectedCategory(Number(catOptions[0].id));
            }
        } catch (error) {
            console.error("Error fetching initial data:", error);
        } finally {
            setLoading(false);
        }
    };

    // Category Changed -> Fetch Subcategories
    useEffect(() => {
        const fetchSubs = async () => {
            if (!selectedCategory) return;
            setLoading(true);
            try {
                const subsData = await getSubcategories(selectedCategory);
                const subOptions = subsData.map((s: any) => ({ id: s.id, label: s.title }));
                setSubcategories(subOptions);

                // Default Subcategory: Index 0 (Multi-select array)
                if (subOptions.length > 0) {
                    setSelectedSubcategories([Number(subOptions[0].id)]);
                } else {
                    setSelectedSubcategories([]);
                }
            } catch (error) {
                console.error("Error fetching subcategories:", error);
            } finally {
                setLoading(false);
            }
        };

        if (selectedCategory) {
            fetchSubs();
        }
    }, [selectedCategory]);

    // Filters Changed -> Fetch Site Master Data
    useEffect(() => {
        const fetchData = async () => {
            if (!siteId || !selectedCategory) return;
            // Ensure we have active subcategories selection if subcategories exist, 
            // OR if strictly required. But let's fetch if we have at least Category.
            // If subcategories list is empty (no subs), we still fetch.
            // If subcategories list exists but none selected? User might want that.
            // Requirement: "default 0 index selected... onchange par filter wise data fetch"

            setLoading(true);
            try {
                const result = await getSiteMasterData(siteId, selectedCategory, selectedSubcategories);
                setData(result);
            } catch (error) {
                console.error("Error fetching site master data:", error);
            } finally {
                setLoading(false);
            }
        };

        // Fetch only if we have initialized defaults
        if (siteId && selectedCategory) {
            fetchData();
        }
    }, [siteId, selectedCategory, selectedSubcategories]);


    const handleChange = (id: number, field: "is_active" | "assigned_unit", value: any) => {
        setData((prev) =>
            prev.map((item) => {
                if (item.id !== id) return item;

                let updatedItem = { ...item, [field]: value };

                // If enabling and no unit assigned, set default
                if (field === "is_active" && value === true && !updatedItem.assigned_unit && item.type === "KPI Field" && units.length > 0) {
                    updatedItem.assigned_unit = units[0].shortName;
                }

                return updatedItem;
            })
        );
    };

    const handleSave = async () => {
        if (!siteId) return;
        setSaving(true);
        try {
            const payload = data.map((item) => ({
                master_data_id: item.id,
                is_active: item.is_active,
                unit: item.assigned_unit || undefined,
            }));
            await updateSiteMasterData(siteId, payload);
            toast.success("Assignments saved successfully!");
            onClose();
        } catch (error) {
            console.error("Error saving assignments:", error);
            toast.error("Failed to save assignments.");
        } finally {
            setSaving(false);
        }
    };

    const filteredData = data.filter((item) => {
        const matchesCode = item.code.toLowerCase().includes(searchCode.toLowerCase());
        const matchesTitle = item.title.toLowerCase().includes(searchTitle.toLowerCase());
        return matchesCode && matchesTitle;
    });

    const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
        const checked = e.target.checked;
        const idsToUpdate = new Set(filteredData.map(d => d.id));
        const defaultUnit = units.length > 0 ? units[0].shortName : undefined;

        setData(prev => prev.map(item => {
            if (idsToUpdate.has(item.id)) {
                const newItem = { ...item, is_active: checked };
                if (checked && !newItem.assigned_unit && newItem.type === "KPI Field" && defaultUnit) {
                    newItem.assigned_unit = defaultUnit;
                }
                return newItem;
            }
            return item;
        }));
    };

    const allFilteredSelected = filteredData.length > 0 && filteredData.every(item => item.is_active);

    return (
        <Modal title={`Assign Master Data: ${siteName}`} isOpen={isOpen} onClose={onClose}>
            <div className="space-y-4 mb-4">
                {/* Filters Row 1: Category & Subcategory */}
                <div className="flex gap-4">
                    <div className="w-1/2">
                        <label className="block text-sm font-medium mb-1">Category</label>
                        <Dropdown
                            options={categories}
                            value={selectedCategory}
                            onChange={(opt) => setSelectedCategory(Number(opt.id))}
                            placeholder="Select Category"
                            searchable
                        />
                    </div>
                    <div className="w-1/2">
                        <label className="block text-sm font-medium mb-1">Subcategory</label>
                        <Dropdown
                            options={subcategories}
                            multiple
                            multipleValue={selectedSubcategories}
                            onMultipleChange={(opts) => setSelectedSubcategories(opts.map(o => Number(o.id)))}
                            placeholder="Select Subcategories"
                            searchable
                        />
                    </div>
                </div>

                {/* Filters Row 2: Search within results */}
                <div className="flex gap-4">
                    <input
                        type="text"
                        placeholder="Filter by Code"
                        className="border px-3 py-2 rounded w-1/2"
                        value={searchCode}
                        onChange={(e) => setSearchCode(e.target.value)}
                    />
                    <input
                        type="text"
                        placeholder="Filter by Title"
                        className="border px-3 py-2 rounded w-1/2"
                        value={searchTitle}
                        onChange={(e) => setSearchTitle(e.target.value)}
                    />
                </div>
            </div>

            <div className="max-h-[60vh] overflow-y-auto">
                {loading ? (
                    <div className="text-center py-4">Loading...</div>
                ) : (
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-gray-700 uppercase bg-gray-50 sticky top-0 z-10">
                            <tr>
                                <th className="px-4 py-3 bg-gray-50">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            checked={allFilteredSelected}
                                            onChange={handleSelectAll}
                                            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                                        />
                                        <span>Active</span>
                                    </div>
                                </th>
                                <th className="px-4 py-3 bg-gray-50">Code</th>
                                <th className="px-4 py-3 bg-gray-50">Title</th>
                                <th className="px-4 py-3 bg-gray-50">Type</th>
                                <th className="px-4 py-3 bg-gray-50">Unit</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredData.length > 0 ? (
                                filteredData.map((item) => (
                                    <tr key={item.id} className="bg-white border-b hover:bg-gray-50">
                                        <td className="px-4 py-2">
                                            <input
                                                type="checkbox"
                                                checked={item.is_active}
                                                onChange={(e) => handleChange(item.id, "is_active", e.target.checked)}
                                                className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500"
                                            />
                                        </td>
                                        <td className="px-4 py-2 font-medium text-gray-900">{item.code}</td>
                                        <td className="px-4 py-2">
                                            <div style={{ paddingLeft: `${(item.level - 1) * 10}px` }}>
                                                {item.title}
                                            </div>
                                        </td>
                                        <td className="px-4 py-2 text-gray-500">{item.type}</td>
                                        <td className="px-4 py-2">
                                            {item.type === "KPI Field" ? (
                                                <div className="w-40" onClick={(e) => e.stopPropagation()}>
                                                    <Dropdown
                                                        options={units.map((u) => ({ id: u.shortName, label: u.shortName }))}
                                                        value={item.assigned_unit || (units.length > 0 ? units[0].shortName : null)}
                                                        onChange={(opt) => handleChange(item.id, "assigned_unit", opt?.id)}
                                                        searchable={true}
                                                        placeholder="Select Unit"
                                                        className="w-full text-xs"
                                                    />
                                                </div>
                                            ) : (
                                                "-"
                                            )}
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={5} className="px-4 py-4 text-center text-gray-500">
                                        No data found for selected filters.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>
            <div className="flex justify-end mt-4 pt-4 border-t">
                <button
                    onClick={onClose}
                    className="mr-3 px-4 py-2 bg-gray-300 text-gray-700 rounded hover:bg-gray-400"
                >
                    Cancel
                </button>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-blue-400"
                >
                    {saving ? "Saving..." : "Save Assignments"}
                </button>
            </div>
        </Modal>
    );
};

export default MasterDataAssignmentModal;
