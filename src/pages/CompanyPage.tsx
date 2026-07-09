import { useActionState, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Modal from "../components/Modal";
import { Table, Column } from "../components/Table";
import {
  getCompanies,
  createCompany,
  updateCompany,
  deleteCompany,
} from "../services/companyService";

interface Company {
  company_id: number;
  name: string;
  address: string;
  contact_person: string;
  logo_url?: string;
  color_guideline_url?: string;
  r2_bucket_name?: string;
}

const CompanyPage = () => {
  const navigate = useNavigate();
  const [modalOpen, setModalOpen] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);

  // Branding upload modal state
  const [brandingCompany, setBrandingCompany] = useState<Company | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [guidelineFile, setGuidelineFile] = useState<File | null>(null);
  const [savingBranding, setSavingBranding] = useState(false);

  const openBranding = (row: Company) => {
    setBrandingCompany(row);
    setLogoFile(null);
    setGuidelineFile(null);
  };

  const handleBrandingSave = async () => {
    if (!brandingCompany) return;
    setSavingBranding(true);
    try {
      const payload = new FormData();
      if (logoFile) payload.append("logo", logoFile);
      if (guidelineFile) payload.append("colorGuideline", guidelineFile);
      const res = await updateCompany(brandingCompany.company_id, payload);
      const updated: Company = res.company || res;
      setCompanies((prev) =>
        prev.map((item) =>
          item.company_id === brandingCompany.company_id
            ? { ...item, ...updated }
            : item,
        ),
      );
      setBrandingCompany(null);
    } catch (error) {
      console.error("Error saving branding:", error);
    } finally {
      setSavingBranding(false);
    }
  };

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
    null,
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
          item.company_id === row.company_id ? { ...item, ...updates } : item,
        ),
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
        prev.filter((item) => item.company_id !== row.company_id),
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
    {
      key: "logo_url",
      label: "Branding",
      editable: false,
      render: (_value: any, row: Company) => (
        <div className="flex items-center gap-2">
          {row.logo_url ? (
            <img
              src={row.logo_url}
              alt="logo"
              className="h-8 w-8 object-contain rounded border border-gray-200"
            />
          ) : (
            <span className="text-xs text-gray-400">No logo</span>
          )}
          <button
            onClick={() => openBranding(row)}
            className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
          >
            Upload
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Companies</h1>
        <div className="flex gap-2">
          <button
            onClick={() => navigate("onboard")}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Onboard Company
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

      <Modal
        title={`Branding${brandingCompany ? ` — ${brandingCompany.name}` : ""}`}
        isOpen={!!brandingCompany}
        onClose={() => setBrandingCompany(null)}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              Company Logo
            </label>
            {brandingCompany?.logo_url && (
              <img
                src={brandingCompany.logo_url}
                alt="current logo"
                className="h-12 mb-2 object-contain border rounded"
              />
            )}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              onChange={(e) => setLogoFile(e.target.files?.[0] || null)}
              className="block w-full text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">
              Color Guideline
            </label>
            {brandingCompany?.color_guideline_url && (
              <a
                href={brandingCompany.color_guideline_url}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-600 underline block mb-2"
              >
                View current file
              </a>
            )}
            <input
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp,.doc,.docx,.xls,.xlsx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => setGuidelineFile(e.target.files?.[0] || null)}
              className="block w-full text-sm"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setBrandingCompany(null)}
              className="px-4 py-2 bg-gray-300 rounded hover:bg-gray-400"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleBrandingSave}
              disabled={savingBranding || (!logoFile && !guidelineFile)}
              className={`px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 ${
                savingBranding || (!logoFile && !guidelineFile)
                  ? "opacity-50 cursor-not-allowed"
                  : ""
              }`}
            >
              {savingBranding ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
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
