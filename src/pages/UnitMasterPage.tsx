import { useState, useEffect } from "react";
import Modal from "../components/Modal";
import { Table, Column } from "../components/Table";
import {
    getUnitMasters,
    createUnitMaster,
    updateUnitMaster,
    deleteUnitMaster,
    UnitMaster,
} from "../services/unitMasterService";
import { Plus } from "lucide-react";
import ConfirmationModal from "../components/ConfirmationModal";
import { useTheme } from "../context/ThemeContext";
import toast from "react-hot-toast";

const UnitMasterPage = () => {
    const { isDark } = useTheme();
    const [units, setUnits] = useState<UnitMaster[]>([]);
    const [loading, setLoading] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [editingUnit, setEditingUnit] = useState<UnitMaster | null>(null);

    const [status, setStatus] = useState<"Active" | "Inactive">("Active");
    const [deleteModalOpen, setDeleteModalOpen] = useState(false);
    const [unitToDelete, setUnitToDelete] = useState<UnitMaster | null>(null);

    // Form state
    const [name, setName] = useState("");
    const [shortName, setShortName] = useState("");
    const [formError, setFormError] = useState("");

    useEffect(() => {
        fetchUnits();
    }, []);

    const fetchUnits = async () => {
        setLoading(true);
        try {
            const data = await getUnitMasters();
            setUnits(data);
        } catch (error) {
            console.error("Error fetching units:", error);
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setName("");
        setShortName("");
        setStatus("Active");
        setEditingUnit(null);
        setFormError("");
    };

    const handleOpenModal = (unit?: UnitMaster) => {
        if (unit) {
            setEditingUnit(unit);
            setName(unit.name);
            setShortName(unit.shortName);
            setStatus(unit.status);
        } else {
            resetForm();
        }
        setModalOpen(true);
    };

    const handleCloseModal = () => {
        setModalOpen(false);
        resetForm();
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError("");

        if (!name.trim() || !shortName.trim()) {
            setFormError("All fields are required");
            return;
        }

        try {
            if (editingUnit) {
                await updateUnitMaster(editingUnit.id, { name, shortName, status });
            } else {
                await createUnitMaster({ name, shortName, status });
            }
            handleCloseModal();
            fetchUnits();
        } catch (error: any) {
            console.error("Error saving unit:", error);
            setFormError(error.response?.data?.message || "Failed to save unit");
        }
    };

    const confirmDelete = (row: UnitMaster) => {
        setUnitToDelete(row);
        setDeleteModalOpen(true);
    }

    const handleDelete = async () => {
        if (!unitToDelete) return;
        try {
            await deleteUnitMaster(unitToDelete.id);
            setDeleteModalOpen(false);
            setUnitToDelete(null);
            fetchUnits();
        } catch (error) {
            console.error("Error deleting unit:", error);
            toast.error("Failed to delete unit");
        }
    };

    const handleInlineUpdate = async (row: UnitMaster, updates: Partial<UnitMaster>) => {
        try {
            await updateUnitMaster(row.id, updates);
            fetchUnits();
        } catch (error: any) {
            console.error("Error updating unit:", error);
            toast.error(error.response?.data?.message || "Failed to update unit");
        }
    };

    const columns: Column<UnitMaster>[] = [
        {
            key: "id",
            label: "ID",
        },
        {
            key: "name",
            label: "Name",
            type: "text",
            editable: true,
        },
        {
            key: "shortName",
            label: "Short Name",
            type: "text",
            editable: true,
        },
        {
            key: "status",
            label: "Status",
            editable: true,
            type: "dropdown",
            options: [
                { id: "Active", label: "Active" },
                { id: "Inactive", label: "Inactive" },
            ],
            render: (value) => (
                <span
                    className={`px-2 py-1 rounded text-xs font-semibold ${value === "Active"
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                        }`}
                >
                    {value}
                </span>
            ),
        },
    ];

    return (
        <div className={`p-6 min-h-screen ${isDark ? "bg-slate-900 text-white" : "bg-gray-50 text-gray-900"}`}>
            <div className="flex justify-between items-center mb-6">
                <h1 className={`text-2xl font-bold ${isDark ? "text-white" : "text-gray-800"}`}>
                    Global Unit Master
                </h1>
                <button
                    onClick={() => handleOpenModal()}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
                >
                    <Plus size={18} />
                    Add Unit
                </button>
            </div>

            <Table<UnitMaster>
                data={units}
                columns={columns}
                keyField="id"
                loading={loading}
                showActions={true}
                onEdit={handleInlineUpdate}
                onDelete={confirmDelete}
                isDark={isDark}
            />

            {/* Add/Edit Modal */}
            <Modal
                title={editingUnit ? "Edit Unit" : "Add Unit"}
                isOpen={modalOpen}
                onClose={handleCloseModal}
                isDark={isDark}
            >
                <form onSubmit={handleSubmit} className="space-y-4">
                    {formError && <div className="text-red-500 text-sm">{formError}</div>}
                    <div>
                        <label className={`block text-sm font-medium mb-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                            Unit Name
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Kilogram"
                            className={`w-full border rounded px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 ${isDark
                                ? "bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                                : "bg-white border-gray-300 text-gray-900"
                                }`}
                            required
                        />
                    </div>
                    <div>
                        <label className={`block text-sm font-medium mb-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                            Short Name
                        </label>
                        <input
                            type="text"
                            value={shortName}
                            onChange={(e) => setShortName(e.target.value)}
                            placeholder="e.g. kg"
                            className={`w-full border rounded px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 ${isDark
                                ? "bg-slate-700 border-slate-600 text-white placeholder-slate-400"
                                : "bg-white border-gray-300 text-gray-900"
                                }`}
                            required
                        />
                    </div>
                    <div>
                        <label className={`block text-sm font-medium mb-1 ${isDark ? "text-slate-300" : "text-gray-700"}`}>
                            Status
                        </label>
                        <select
                            value={status}
                            onChange={(e) => setStatus(e.target.value as "Active" | "Inactive")}
                            className={`w-full border rounded px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 mt-1 ${isDark
                                ? "bg-slate-700 border-slate-600 text-white"
                                : "bg-white border-gray-300 text-gray-900"
                                }`}
                        >
                            <option value="Active">Active</option>
                            <option value="Inactive">Inactive</option>
                        </select>
                    </div>

                    <div className={`flex justify-end gap-3 pt-4 border-t ${isDark ? "border-slate-700" : "border-gray-200"}`}>
                        <button
                            type="button"
                            onClick={handleCloseModal}
                            className={`px-4 py-2 rounded transition ${isDark
                                ? "bg-slate-700 text-slate-300 hover:bg-slate-600"
                                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                }`}
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

            {/* Delete Confirmation Modal */}
            <ConfirmationModal
                title="Confirm Delete"
                isOpen={deleteModalOpen}
                onClose={() => setDeleteModalOpen(false)}
                onConfirm={handleDelete}
                confirmLabel="Delete"
                isDanger={true}
                isDark={isDark}
                message={
                    <p className={isDark ? "text-slate-300" : "text-gray-700"}>
                        Are you sure you want to delete <strong>{unitToDelete?.name}</strong>?
                    </p>
                }
            />
        </div>

    );
};

export default UnitMasterPage;
