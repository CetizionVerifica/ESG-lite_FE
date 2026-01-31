import { useState, useEffect, useCallback } from "react";
import Dropdown, { DropdownOption } from "../components/Dropdown";
import Modal from "../components/Modal";
import { Table, Column } from "../components/Table";
import {
    getMasterData,
    createMasterData,
    updateMasterData,
    deleteMasterData,
    MasterData,
    seedMasterData
} from "../services/masterDataService";


const MasterDataPage = () => {
    const [data, setData] = useState<MasterData[]>([]);
    const [loading, setLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingItem, setEditingItem] = useState<MasterData | null>(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [viewMode, setViewMode] = useState<"table" | "tree">("table");

    // Form State
    const [formData, setFormData] = useState<{
        code: string;
        title: string;
        description: string;
        uom: string;
        type: string;
        parent_id: number | null;
        kpi_field_placeholder: string;
        status: string;
        sequence: number;
    }>({
        code: "",
        title: "",
        description: "",
        uom: "",
        type: "Category",
        parent_id: null,
        kpi_field_placeholder: "",
        status: "Active",
        sequence: 0,
    });

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const result = await getMasterData();
            setData(result);
        } catch (error) {
            console.error("Error fetching master data:", error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleSeed = async () => {
        if (confirm("This will seed demo data (Env -> 302...). Continue?")) {
            setLoading(true);
            try {
                await seedMasterData();
                await fetchData();
                alert("Seeded successfully!");
            } catch (err: any) {
                console.error(err);
                alert(`Seed failed: ${err.response?.data?.message || err.message}`);
            } finally {
                setLoading(false);
            }
        }
    };

    const filteredData = data.filter(item =>
        item.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.title.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (editingItem) {
                await updateMasterData(editingItem.id, { ...formData, parent_id: formData.parent_id || undefined });
            } else {
                await createMasterData({ ...formData, parent_id: formData.parent_id || undefined });
            }
            setModalOpen(false);
            setEditingItem(null);
            resetForm();
            fetchData();
        } catch (error: any) {
            console.error("Error saving master data:", error);
            alert(`Failed to save: ${error.response?.data?.message || error.message}`);
        }
    };

    const handleEdit = (row: MasterData) => {
        setEditingItem(row);
        setFormData({
            code: row.code,
            title: row.title,
            description: row.description || "",
            uom: row.uom || "",
            type: row.type,
            parent_id: row.parent ? row.parent.id : null,
            kpi_field_placeholder: row.kpi_field_placeholder || "",
            status: row.status,
            sequence: row.sequence,
        });
        setModalOpen(true);
    };

    const handleDelete = async (row: MasterData) => {
        if (confirm("Are you sure? This might delete children.")) {
            try {
                await deleteMasterData(row.id);
                fetchData();
            } catch (error) {
                console.error("Error deleting:", error);
            }
        }
    };

    const resetForm = () => {
        setFormData({
            code: "",
            title: "",
            description: "",
            uom: "",
            type: "Category",
            parent_id: null,
            kpi_field_placeholder: "",
            status: "Active",
            sequence: 0,
        });
        setEditingItem(null);
    };

    // Build Options
    const typeOptions: DropdownOption[] = [
        { id: "Category", label: "Category" },
        { id: "Subcategory", label: "Subcategory" },
        { id: "Sub-heading", label: "Sub-heading" },
        { id: "Data Heading", label: "Data Heading" },
        { id: "KPI Field", label: "KPI Field" },
    ];

    const statusOptions: DropdownOption[] = [
        { id: "Active", label: "Active" },
        { id: "Inactive", label: "Inactive" },
    ];

    const parentOptions: DropdownOption[] = data
        .filter((item) => !editingItem || item.id !== editingItem.id) // Simple exclude self
        .map((item) => ({
            id: item.id.toString(), // Convert to string for Dropdown
            label: `${item.code} - ${item.title}`,
        }));

    const columns: Column<MasterData>[] = [
        { key: "code", label: "Code", type: "text", editable: false },
        { key: "title", label: "Title", type: "text", editable: false },
        {
            key: "parent",
            label: "Parent",
            editable: false,
            render: (_, row) => (row.parent ? row.parent.code : "-"),
        },
        { key: "level", label: "Level", type: "text", editable: false },
        { key: "type", label: "Type", type: "text", editable: false },
        {
            key: "uom",
            label: "UOM",
            editable: false,
        },
        { key: "status", label: "Status", type: "text", editable: false },
    ];

    // Tree Building Helper
    const buildTree = (items: MasterData[]) => {
        const map = new Map<number, MasterData & { childrenData: any[] }>();
        const roots: any[] = [];

        // Initialize map
        items.forEach(item => {
            map.set(item.id, { ...item, childrenData: [] });
        });

        // Connect
        items.forEach(item => {
            if (item.parent && map.has(item.parent.id)) {
                map.get(item.parent.id)?.childrenData.push(map.get(item.id));
            } else if (!item.parent) {
                roots.push(map.get(item.id));
            }
        });

        return roots; // Returns hierarchy
    };

    const TreeItem = ({ item, level }: { item: any, level: number }) => {
        const [expanded, setExpanded] = useState(true);
        const hasChildren = item.childrenData && item.childrenData.length > 0;

        return (
            <div className="border-b last:border-b-0 border-gray-100">
                <div
                    className="flex items-center py-2 hover:bg-gray-50 px-2"
                    style={{ paddingLeft: `${level * 20 + 8}px` }}
                >
                    <div
                        className="mr-2 cursor-pointer w-4"
                        onClick={() => setExpanded(!expanded)}
                    >
                        {hasChildren ? (expanded ? "▼" : "▶") : ""}
                    </div>
                    <div className="flex-1 grid grid-cols-12 gap-4 items-center">
                        <div className="col-span-2 font-mono text-sm">{item.code}</div>
                        <div className="col-span-5 font-semibold text-gray-700">
                            {item.title}
                            {item.uom && <span className="ml-2 text-xs text-gray-500 bg-gray-200 px-1 rounded">({item.uom})</span>}
                        </div>
                        <div className="col-span-2 text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded w-fit">{item.type}</div>
                        <div className="col-span-3 flex justify-end gap-2">
                            <button onClick={() => handleEdit(item)} className="text-blue-600 text-sm">Edit</button>
                            <button onClick={() => handleDelete(item)} className="text-red-600 text-sm">Delete</button>
                        </div>
                    </div>
                </div>
                {expanded && hasChildren && (
                    <div>
                        {item.childrenData.map((child: any) => (
                            <TreeItem key={child.id} item={child} level={level + 1} />
                        ))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="p-6">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold mb-2">Master Data Management</h1>
                    <div className="flex gap-2 text-sm">
                        <button
                            onClick={() => setViewMode("table")}
                            className={`px-3 py-1 rounded ${viewMode === 'table' ? 'bg-blue-100 text-blue-700 font-bold' : 'text-gray-500'}`}
                        >
                            Table View
                        </button>
                        <button
                            onClick={() => setViewMode("tree")}
                            className={`px-3 py-1 rounded ${viewMode === 'tree' ? 'bg-blue-100 text-blue-700 font-bold' : 'text-gray-500'}`}
                        >
                            Tree View
                        </button>
                    </div>
                </div>

                <div className="flex gap-4">
                    <input
                        type="text"
                        placeholder="Search..."
                        className="border px-3 py-2 rounded w-64"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    <button
                        onClick={handleSeed}
                        disabled={loading}
                        className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
                    >
                        {loading ? "Seeding..." : "Seed Demo Data"}
                    </button>
                    <button
                        onClick={() => {
                            resetForm();
                            setModalOpen(true);
                        }}
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                        + Add New
                    </button>
                </div>
            </div>

            {viewMode === 'table' ? (
                <Table
                    data={filteredData}
                    columns={columns}
                    keyField="id"
                    onEdit={(row) => handleEdit(row)}
                    onDelete={handleDelete}
                    loading={loading}
                    showActions={true}
                />
            ) : (
                <div className="bg-white border rounded shadow">
                    <div className="grid grid-cols-12 gap-4 border-b px-4 py-3 font-bold bg-gray-50 text-sm">
                        <div className="col-span-2 ml-6">Code</div>
                        <div className="col-span-5">Title</div>
                        <div className="col-span-2">Type</div>
                        <div className="col-span-3 text-right">Actions</div>
                    </div>
                    {loading ? (
                        <div className="p-4 text-center">Loading...</div>
                    ) : (
                        buildTree(filteredData).length > 0 ? (
                            buildTree(filteredData).map(root => (
                                <TreeItem key={root.id} item={root} level={0} />
                            ))
                        ) : (
                            <div className="p-4 text-center text-gray-500">No data found</div>
                        )
                    )}
                </div>
            )}

            <Modal
                title={editingItem ? "Edit Master Entry" : "Add New Master Entry"}
                isOpen={modalOpen}
                onClose={() => {
                    setModalOpen(false);
                    resetForm();
                }}
            >
                <form onSubmit={handleSave}>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="mb-4">
                            <label className="block text-sm font-medium mb-1">Code *</label>
                            <input
                                type="text"
                                value={formData.code}
                                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                                required
                                className="w-full border px-3 py-2 rounded"
                            />
                        </div>
                        <div className="mb-4">
                            <label className="block text-sm font-medium mb-1">Title *</label>
                            <input
                                type="text"
                                value={formData.title}
                                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                required
                                className="w-full border px-3 py-2 rounded"
                            />
                        </div>
                        <div className="mb-4 col-span-2">
                            <label className="block text-sm font-medium mb-1">Description</label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                className="w-full border px-3 py-2 rounded h-20"
                                placeholder="Enter description..."
                            />
                        </div>

                        <div className="mb-4">
                            <label className="block text-sm font-medium mb-1">Type *</label>
                            <Dropdown
                                options={typeOptions}
                                value={formData.type}
                                onChange={(opt) => setFormData({ ...formData, type: opt?.id as string })}
                            />
                        </div>

                        <div className="mb-4">
                            <label className="block text-sm font-medium mb-1">Status</label>
                            <Dropdown
                                options={statusOptions}
                                value={formData.status}
                                onChange={(opt) =>
                                    setFormData({ ...formData, status: opt?.id as string })
                                }
                            />
                        </div>

                        <div className="mb-4 col-span-2">
                            <label className="block text-sm font-medium mb-1">Parent (Optional)</label>
                            <Dropdown
                                options={parentOptions}
                                placeholder="Select Parent"
                                value={formData.parent_id?.toString() || ""}
                                onChange={(opt) =>
                                    setFormData({ ...formData, parent_id: opt ? parseInt(opt.id.toString()) : null })
                                }
                                searchable
                            />
                        </div>

                        {formData.type === "KPI Field" && (
                            <>
                                <div className="mb-4">
                                    <label className="block text-sm font-medium mb-1">UOM</label>
                                    <input
                                        type="text"
                                        value={formData.uom}
                                        onChange={(e) => setFormData({ ...formData, uom: e.target.value })}
                                        className="w-full border px-3 py-2 rounded"
                                        placeholder="e.g. kg, Ltr, Kwh"
                                    />
                                </div>
                                <div className="mb-4">
                                    <label className="block text-sm font-medium mb-1">
                                        KPI Field Placeholder
                                    </label>
                                    <input
                                        type="text"
                                        value={formData.kpi_field_placeholder}
                                        onChange={(e) =>
                                            setFormData({
                                                ...formData,
                                                kpi_field_placeholder: e.target.value,
                                            })
                                        }
                                        placeholder="e.g. Coal, Diesel"
                                        className="w-full border px-3 py-2 rounded"
                                    />
                                </div>
                            </>
                        )}

                        <div className="mb-4">
                            <label className="block text-sm font-medium mb-1">Sequence</label>
                            <input
                                type="number"
                                value={formData.sequence}
                                onChange={(e) => setFormData({ ...formData, sequence: parseInt(e.target.value) || 0 })}
                                className="w-full border px-3 py-2 rounded"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end mt-4">
                        <button
                            type="button"
                            onClick={() => {
                                setModalOpen(false);
                                resetForm();
                            }}
                            className="px-4 py-2 bg-gray-300 rounded mr-2"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-blue-600 text-white rounded"
                        >
                            Save
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default MasterDataPage;
