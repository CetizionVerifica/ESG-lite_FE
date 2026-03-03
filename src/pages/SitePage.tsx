
import { useActionState, useState, useEffect, useCallback } from "react";
import Modal from "../components/Modal";
import Dropdown, { DropdownOption } from "../components/Dropdown";
import { Table, Column } from "../components/Table";
import {
  getSites,
  createSite,
  updateSite,
  deleteSite,
} from "../services/siteService";
import { getCompanies } from "../services/companyService";
import { getCountries } from "../services/countryService";
import { getCategories } from "../services/categoryService";
import MasterDataAssignmentModal from "../components/MasterDataAssignmentModal";

interface Site {
  site_id: number;
  name: string;
  address: string;
  contact_person: string;
  company_id: number;
  country_id: number;
  company?: { company_id: number; name: string };
  country?: { country_id: number; name: string };
  categories?: Array<{ category_id: number; category_name: string }>;
}

interface Company {
  company_id: number;
  name: string;
}

interface Country {
  country_id: number;
  name: string;
  code: string;
}

interface Category {
  category_id: number;
  category_name: string;
  scope: string;
}

const SitePage = () => {
  const [modalOpen, setModalOpen] = useState(false);

  // Assignment Modal State
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [selectedSiteForAssignment, setSelectedSiteForAssignment] = useState<Site | null>(null);

  const [sites, setSites] = useState<Site[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<any>(null);
  const [selectedCountry, setSelectedCountry] = useState<any>(null);
  const [selectedCategories, setSelectedCategories] = useState<
    (string | number)[]
  >([]);

  const [_formState, formAction] = useActionState(
    async (_prevData: any, data: any) => {
      try {
        const name = data.get("name");
        const address = data.get("address");
        const contact_person = data.get("contact_person");

        if (!selectedCompany || !selectedCountry) {
          console.error("Please select both company and country");
          return;
        }
        console.log(selectedCategories);

        const newSite = await createSite({
          name,
          address,
          contact_person,
          company_id: selectedCompany,
          country_id: selectedCountry,
          category_ids: selectedCategories,
        });

        setSites((prev) => [...prev, newSite.site || newSite]);
        setModalOpen(false);
        setSelectedCompany(null);
        setSelectedCountry(null);
        setSelectedCategories([]);
        handleLoadData();
      } catch (error) {
        console.log(error);
      }
    },
    null,
  );

  useEffect(() => {
    handleLoadData();
  }, []);

  const handleLoadData = useCallback(async () => {
    try {
      setLoading(true);
      const [sitesData, companiesData, countriesData, categoriesData] =
        await Promise.all([
          getSites(),
          getCompanies(),
          getCountries(),
          getCategories(),
        ]);

      setSites(sitesData);
      setCompanies(companiesData);
      setCountries(countriesData);
      setCategories(categoriesData);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleEdit = async (row: Site, updates: Partial<Site>) => {
    try {
      if (updates.categories) {
        const categoryIds = Array.isArray(updates.categories)
          ? updates.categories.map((c: any) =>
            typeof c === "number" || typeof c === "string"
              ? c
              : c.category_id || c.id
          )
          : [];
        await updateSite(row.site_id, {
          ...updates,
          category_ids: categoryIds,
        } as any);
        handleLoadData()
      } else {
        await updateSite(row.site_id, updates);
      }
      setSites((prev) =>
        prev.map((item) =>
          item.site_id === row.site_id ? { ...item, ...updates } : item,
        ),
      );
    } catch (error) {
      console.error("Error updating site:", error);
      throw error;
    }
  };

  const handleDelete = async (row: Site) => {
    try {
      await deleteSite(row.site_id);
      setSites((prev) => prev.filter((item) => item.site_id !== row.site_id));
    } catch (error) {
      console.error("Error deleting site:", error);
      throw error;
    }
  };

  const openAssignmentModal = (site: Site) => {
    setSelectedSiteForAssignment(site);
    setAssignmentModalOpen(true);
  };

  const companyOptions: DropdownOption[] = companies.map((company) => ({
    id: company.company_id,
    label: company.name,
  }));

  const countryOptions: DropdownOption[] = countries.map((country) => ({
    id: country.country_id,
    label: country.name,
  }));

  const categoryOptions: DropdownOption[] = categories.map((category) => ({
    id: category.category_id,
    label: category.category_name,
  }));

  const columns: Column<Site>[] = [
    {
      key: "site_id",
      label: "ID",
      editable: false,
    },
    {
      key: "name",
      label: "Site Name",
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
      key: "company_id",
      label: "Company",
      editable: true,
      type: "dropdown",
      options: companyOptions,
      render: (_value: any, row: Site) => row.company?.name || "N/A",
    },
    {
      key: "country_id",
      label: "Country",
      editable: true,
      type: "dropdown",
      options: countryOptions,
      render: (_value: any, row: Site) => row.country?.name || "N/A",
    },
    {
      key: "categories",
      label: "Categories",
      editable: true,
      type: "multiselect",
      options: categoryOptions,
      render: (_value: any, row: Site) =>
        row.categories?.map((c) => c.category_name).join(", ") || "N/A",
    },
  ];

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Sites</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setModalOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Add Site
          </button>
        </div>
      </div>

      <Modal
        title="Add Site"
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedCompany(null);
          setSelectedCountry(null);
          setSelectedCategories([]);
        }}
      >
        <form action={formAction}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Site Name</label>
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
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Company</label>
            <Dropdown
              options={companyOptions}
              placeholder="Select Company"
              value={selectedCompany}
              onChange={(option) => {
                setSelectedCompany(option.id);
              }}
              searchable={true}
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Country</label>
            <Dropdown
              options={countryOptions}
              placeholder="Select Country"
              value={selectedCountry}
              onChange={(option) => setSelectedCountry(option.id)}
              searchable={true}
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Categories</label>
            <Dropdown
              options={categoryOptions}
              placeholder="Select Categories"
              multipleValue={selectedCategories}
              onMultipleChange={(options) =>
                setSelectedCategories(options.map((o) => o.id))
              }
              searchable={true}
              multiple={true}
            />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                setModalOpen(false);
                setSelectedCompany(null);
                setSelectedCountry(null);
                setSelectedCategories([]);
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

      {/* Assignment Modal */}
      {selectedSiteForAssignment && (
        <MasterDataAssignmentModal
          isOpen={assignmentModalOpen}
          onClose={() => setAssignmentModalOpen(false)}
          siteId={selectedSiteForAssignment.site_id}
          siteName={selectedSiteForAssignment.name}
        />
      )}

      <Table<Site>
        data={sites}
        columns={columns}
        keyField="site_id"
        onEdit={handleEdit}
        onDelete={handleDelete}
        loading={loading}
        showActions={true}
        renderActions={(row, { editButton, deleteButton }) => (
          <div className="flex gap-2">
            <button
              onClick={() => openAssignmentModal(row)}
              className="px-2 py-1 bg-purple-600 text-white rounded text-sm hover:bg-purple-700 font-medium"
              title="Assign Master Data"
            >
              Assign
            </button>
            {editButton}
            {deleteButton}
          </div>
        )}
      />
    </div>
  );
};

export default SitePage;
