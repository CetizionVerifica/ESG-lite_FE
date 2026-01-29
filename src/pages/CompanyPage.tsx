import { useActionState, useCallback, useEffect, useState } from "react";
import Modal from "../components/Modal";
import { Table, Column } from "../components/Table";
import { getCompanies, createCompany, updateCompany, deleteCompany } from "../services/companyService";

interface Company {
  company_id: number;
  name: string;
  address: string;
  contact_person: string;
}

const CompanyPage = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);

  const [_formState, formAction] = useActionState(
    async (_prevData: any, data: any) => {
      try {
        const name = data.get("name");
        const address = data.get("address");
        const contact_person = data.get("contact_person");

        const newCompany = await createCompany({
          name,
          address,
          contact_person,
        });

        setCompanies((prev) => [...prev, newCompany.company || newCompany]);
        setModalOpen(false);
      } catch (error) {
        console.log(error);
      }
    },
    null
  );
const fetchCompanies = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCompanies();
      setCompanies(data.companies || data);
    } catch (error) {
      console.error("Error fetching companies:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const handleEdit = async (row: Company, updates: Partial<Company>) => {
    try {
      await updateCompany(row.company_id, updates);
      setCompanies((prev) =>
        prev.map((item) =>
          item.company_id === row.company_id
            ? { ...item, ...updates }
            : item
        )
      );
    } catch (error) {
      console.error("Error updating company:", error);
      throw error;
    }
  };

  const handleDelete = async (row: Company) => {
    try {
      await deleteCompany(row.company_id);
      setCompanies((prev) =>
        prev.filter((item) => item.company_id !== row.company_id)
      );
    } catch (error) {
      console.error("Error deleting company:", error);
      throw error;
    }
  };

  const columns: Column<Company>[] = [
    {
      key: "company_id",
      label: "ID",
      editable: false,
    },
    {
      key: "name",
      label: "Company Name",
      editable: true,
      type: "text",
    },
    {
      key: "address",
      label: "Address",
      editable: true,
      type: "text",
    },
    {
      key: "contact_person",
      label: "Contact Person",
      editable: true,
      type: "text",
    },
  ];

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Companies</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setModalOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Add Company
          </button>
        </div>
      </div>

      <Modal
        title="Add Company"
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      >
        <form action={formAction}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">
              Company Name
            </label>
            <input
              type="text"
              name="name"
              required
              className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Address</label>
            <input
              type="text"
              name="address"
              required
              className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">
              Contact Person
            </label>
            <input
              type="text"
              name="contact_person"
              required
              className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
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

      <Table<Company>
        data={companies}
        columns={columns}
        keyField="company_id"
        onEdit={handleEdit}
        onDelete={handleDelete}
        loading={loading}
        showActions={true}
      />
    </div>
  );
};

export default CompanyPage;