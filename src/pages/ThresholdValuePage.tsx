import { useActionState, useState, useEffect, useCallback } from "react";
import Modal from "../components/Modal";
import Dropdown, { DropdownOption } from "../components/Dropdown";
import { Table, Column } from "../components/Table";
import {
  getThresholds,
  createThreshold,
  updateThreshold,
  deleteThreshold,
  EmissionThreshold,
} from "../services/thresholdService";
import { getCompanies } from "../services/companyService";

interface Company {
  company_id: number;
  name: string;
}

const MIN_THRESHOLD = 2;
const MAX_THRESHOLD = 5;

const ThresholdValuePage = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [thresholds, setThresholds] = useState<EmissionThreshold[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<any>(null);

  const [_formState, formAction] = useActionState(
    async (_prevData: any, data: any) => {
      try {
        const threshold_percentage = data.get("threshold_percentage");

        if (!selectedCompany) {
          console.error("Please select a company");
          return;
        }

        const result = await createThreshold({
          company_id: selectedCompany,
          threshold_percentage: Number(threshold_percentage),
        });

        setThresholds((prev) => [...prev, result]);
        setModalOpen(false);
        setSelectedCompany(null);
        handleLoadData();
      } catch (error) {
        console.error(error);
      }
    },
    null,
  );

  useEffect(() => {
    handleLoadData();
  }, []);

  // Uses allSettled (not all) so one failing request doesn't blank out
  // data that loaded successfully from the other calls.
  const handleLoadData = useCallback(async () => {
    try {
      setLoading(true);
      const [thresholdsResult, companiesResult] = await Promise.allSettled([
        getThresholds(),
        getCompanies(),
      ]);

      if (thresholdsResult.status === "fulfilled") {
        setThresholds(thresholdsResult.value);
      } else {
        console.error("Error loading thresholds:", thresholdsResult.reason);
      }

      if (companiesResult.status === "fulfilled") {
        setCompanies(companiesResult.value);
      } else {
        console.error("Error loading companies:", companiesResult.reason);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const handleEdit = async (
    row: EmissionThreshold,
    updates: Partial<EmissionThreshold>,
  ) => {
    try {
      await updateThreshold(row.threshold_id, {
        threshold_percentage: Number(updates.threshold_percentage),
      });
      setThresholds((prev) =>
        prev.map((item) =>
          item.threshold_id === row.threshold_id
            ? { ...item, ...updates }
            : item,
        ),
      );
    } catch (error) {
      console.error("Error updating threshold:", error);
      throw error;
    }
  };

  const handleDelete = async (row: EmissionThreshold) => {
    try {
      await deleteThreshold(row.threshold_id);
      setThresholds((prev) =>
        prev.filter((item) => item.threshold_id !== row.threshold_id),
      );
    } catch (error) {
      console.error("Error deleting threshold:", error);
      throw error;
    }
  };

  const companyOptions: DropdownOption[] = companies.map((company) => ({
    id: company.company_id,
    label: company.name,
  }));

  const columns: Column<EmissionThreshold>[] = [
    { key: "threshold_id", label: "ID", editable: false },
    {
      key: "company" as any,
      label: "Company",
      editable: false,
      render: (_value: any, row: EmissionThreshold) => row.company?.name || "N/A",
    },
    {
      key: "threshold_percentage",
      label: "Threshold (%)",
      editable: true,
      type: "number",
    },
  ];

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Emission Thresholds</h1>
        <button
          onClick={() => setModalOpen(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Add Threshold Value
        </button>
      </div>

      <Modal
        title="Add Threshold Value"
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedCompany(null);
        }}
      >
        <form action={formAction}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Company</label>
            <Dropdown
              options={companyOptions}
              placeholder="Select Company"
              value={selectedCompany}
              onChange={(option) =>
                setSelectedCompany(option ? option.id : null)
              }
              searchable={true}
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">
              Threshold Percentage
            </label>
            <input
              type="number"
              name="threshold_percentage"
              required
              min={MIN_THRESHOLD}
              max={MAX_THRESHOLD}
              step="0.01"
              placeholder={`${MIN_THRESHOLD} - ${MAX_THRESHOLD}`}
              className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
            />
            <p className="text-xs text-gray-500 mt-1">
              Must be between {MIN_THRESHOLD}% and {MAX_THRESHOLD}%.
            </p>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                setModalOpen(false);
                setSelectedCompany(null);
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

      <Table<EmissionThreshold>
        data={thresholds}
        columns={columns}
        keyField="threshold_id"
        onEdit={handleEdit}
        onDelete={handleDelete}
        loading={loading}
        showActions={true}
      />
    </div>
  );
};

export default ThresholdValuePage;