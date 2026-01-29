import { useState, useActionState } from "react";
import Dropdown, { DropdownOption } from "../components/Dropdown";
import Modal from "../components/Modal";
import { createColumn } from "../services/columnService";
import ColumnList from "../components/ColumnList";

const COLUMN_TYPES: DropdownOption[] = [
  { id: "text", label: "Text" },
  { id: "number", label: "Number" },
  { id: "date", label: "Date" },
  { id: "boolean", label: "Boolean" },
  { id: "select", label: "Select" },
];

const ColumnPage = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Form state
  const [formColumnType, setFormColumnType] = useState<string | null>(null);

  const [_formState, formAction] = useActionState(
    async (_prevData: any, data: FormData) => {
      try {
        const column_name = data.get("column_name") as string;

        if (!column_name || !formColumnType) {
          console.error("Column name and type are required");
          return { error: "Column name and type are required" };
        }

        await createColumn({
          column_name,
          column_type: formColumnType,
        });

        setModalOpen(false);
        resetForm();
        setRefreshTrigger((prev) => prev + 1);
        return { success: true };
      } catch (error: any) {
        console.error("Error creating column:", error);
        return { error: error?.response?.data?.message || "Failed to create column" };
      }
    },
    null
  );

  const resetForm = () => {
    setFormColumnType(null);
  };

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Columns</h1>
        <button
          onClick={() => setModalOpen(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Add Column
        </button>
      </div>

      <Modal
        title="Add Column"
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          resetForm();
        }}
      >
        <form action={formAction}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Column Name *</label>
            <input
              type="text"
              name="column_name"
              required
              placeholder="e.g., Amount, Description"
              className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Column Type *</label>
            <Dropdown
              options={COLUMN_TYPES}
              placeholder="Select Column Type"
              value={formColumnType}
              onChange={(option) => setFormColumnType(option?.id as string)}
              searchable={false}
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

      <ColumnList refreshTrigger={refreshTrigger} />
    </div>
  );
};

export default ColumnPage;
