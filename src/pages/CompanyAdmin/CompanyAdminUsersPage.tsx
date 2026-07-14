import { useActionState, useState, useEffect, useCallback } from "react";
import Modal from "../../components/Modal";
import Dropdown, { DropdownOption } from "../../components/Dropdown";
import { Table, Column } from "../../components/Table";
import {
  getCompanyUsers,
  getCompanySites,
  createCompanyUser,
  updateCompanyUser,
  deleteCompanyUser,
} from "../../services/companyAdminService";

interface Site {
  site_id: number;
  name: string;
}

interface CompanyUser {
  user_id: number;
  name?: string;
  email: string;
  role: string;
  site?: Site;
  sites?: Site[];
}

// A company Admin may only manage Users and Managers of their own company.
const ROLES = ["User", "Manager"];

const CompanyAdminUsersPage = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSite, setSelectedSite] = useState<number | null>(null);
  const [selectedSites, setSelectedSites] = useState<number[]>([]);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  // Managers and Users can be assigned to multiple sites.
  const isMultiSiteRole = selectedRole === "Manager" || selectedRole === "User";

  const [_formState, formAction] = useActionState(
    async (_prevData: any, data: FormData) => {
      try {
        setError(null);
        if (!selectedRole) {
          setError("Please select a role");
          return;
        }

        const payload: any = {
          name: data.get("name"),
          email: data.get("email"),
          password: data.get("password"),
          role: selectedRole,
        };

        if (isMultiSiteRole && selectedSites.length > 0) {
          payload.site_ids = selectedSites;
        } else if (selectedSite) {
          payload.site_id = selectedSite;
        }

        await createCompanyUser(payload);
        setModalOpen(false);
        setSelectedSite(null);
        setSelectedSites([]);
        setSelectedRole(null);
        handleLoadData();
      } catch (err: any) {
        setError(err?.response?.data?.message || "Failed to create user");
      }
    },
    null,
  );

  useEffect(() => {
    handleLoadData();
  }, []);

  // Reset site selections when role changes.
  useEffect(() => {
    setSelectedSite(null);
    setSelectedSites([]);
  }, [selectedRole]);

  const handleLoadData = useCallback(async () => {
    try {
      setLoading(true);
      const [usersData, sitesData] = await Promise.all([
        getCompanyUsers(),
        getCompanySites(),
      ]);

      const normalizedUsers = usersData.map((user: CompanyUser) => ({
        ...user,
        sites:
          user.sites && user.sites.length > 0
            ? user.sites
            : user.site
              ? [user.site]
              : [],
      }));

      setUsers(normalizedUsers);
      setSites(sitesData);
    } catch (err: any) {
      setError(err?.response?.data?.message || "Error loading data");
    } finally {
      setLoading(false);
    }
  }, []);

  const handleEdit = async (row: CompanyUser, updates: Partial<CompanyUser>) => {
    try {
      const updateData: any = { ...updates };

      if (updates.sites !== undefined) {
        const siteIds = updates.sites as unknown as number[];
        const currentRole = updateData.role || row.role;
        if (currentRole === "Manager" || currentRole === "User") {
          updateData.site_ids = siteIds;
        } else {
          updateData.site_id = siteIds.length > 0 ? siteIds[0] : null;
        }
        delete updateData.sites;
      }

      if (updates.site !== undefined) {
        updateData.site_id =
          (updates.site as any)?.site_id ?? updates.site ?? null;
        delete updateData.site;
      }

      await updateCompanyUser(row.user_id, updateData);
      handleLoadData();
    } catch (err: any) {
      setError(err?.response?.data?.message || "Error updating user");
      throw err;
    }
  };

  const handleDelete = async (row: CompanyUser) => {
    try {
      await deleteCompanyUser(row.user_id);
      setUsers((prev) => prev.filter((item) => item.user_id !== row.user_id));
    } catch (err: any) {
      setError(err?.response?.data?.message || "Error deleting user");
      throw err;
    }
  };

  const siteOptions: DropdownOption[] = sites.map((site) => ({
    id: site.site_id,
    label: site.name,
  }));

  const roleOptions: DropdownOption[] = ROLES.map((role) => ({
    id: role,
    label: role,
  }));

  const columns: Column<CompanyUser>[] = [
    { key: "user_id", label: "ID", editable: false },
    { key: "name", label: "Name", editable: true, type: "text" },
    { key: "email", label: "Email", editable: true, type: "text" },
    {
      key: "role",
      label: "Role",
      editable: true,
      type: "dropdown",
      options: roleOptions,
    },
    {
      key: "sites" as keyof CompanyUser,
      label: "Site(s)",
      editable: true,
      type: "multiselect",
      options: siteOptions,
      render: (_value: any, row: CompanyUser) => {
        if (row.sites && row.sites.length > 0) {
          return row.sites.map((s) => s.name).join(", ");
        }
        return row.site?.name || "N/A";
      },
    },
    {
      key: "password" as keyof CompanyUser,
      label: "Password",
      editable: true,
      type: "text",
      render: () => "••••••••",
    },
  ];

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Company Users</h1>
          <p className="text-sm text-slate-500">
            Manage the users and managers of your company.
          </p>
        </div>
        <button
          onClick={() => {
            setError(null);
            setModalOpen(true);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          Add User
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <Modal
        title="Add User"
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedSite(null);
          setSelectedSites([]);
          setSelectedRole(null);
        }}
      >
        <form action={formAction}>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              name="name"
              className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Email</label>
            <input
              type="email"
              name="email"
              required
              className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Password</label>
            <input
              type="password"
              name="password"
              required
              className="w-full border px-3 py-2 rounded focus:outline-none focus:ring"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Role</label>
            <Dropdown
              options={roleOptions}
              placeholder="Select Role"
              value={selectedRole}
              onChange={(option) => setSelectedRole(option.id as string)}
              searchable={true}
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">
              {isMultiSiteRole ? "Sites (Select multiple)" : "Site (Optional)"}
            </label>
            {isMultiSiteRole ? (
              <Dropdown
                options={siteOptions}
                placeholder="Select Sites"
                multiple={true}
                multipleValue={selectedSites}
                onMultipleChange={(options) =>
                  setSelectedSites(options.map((o) => o.id as number))
                }
                searchable={true}
              />
            ) : (
              <Dropdown
                options={siteOptions}
                placeholder="Select Site"
                value={selectedSite}
                onChange={(option) => setSelectedSite(option.id as number)}
                searchable={true}
              />
            )}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                setModalOpen(false);
                setSelectedSite(null);
                setSelectedSites([]);
                setSelectedRole(null);
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

      <Table<CompanyUser>
        data={users}
        columns={columns}
        keyField="user_id"
        onEdit={handleEdit}
        onDelete={handleDelete}
        loading={loading}
        showActions={true}
      />
    </div>
  );
};

export default CompanyAdminUsersPage;
