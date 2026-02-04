import { useActionState, useState, useEffect, useCallback } from "react";
import Modal from "../components/Modal";
import Dropdown, { DropdownOption } from "../components/Dropdown";
import { Table, Column } from "../components/Table";
import {
  getUsers,
  createUser,
  updateUser,
  deleteUser,
} from "../services/userService";
import { getSites } from "../services/siteService";

interface Site {
  site_id: number;
  name: string;
}

interface User {
  user_id: number;
  name?: string;
  email: string;
  password: string;
  role: string;
  site?: Site;
  sites?: Site[];
}

const ROLES = ["Superadmin", "Admin", "User", "Manager"];

const UserPage = () => {
  const [modalOpen, setModalOpen] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSite, setSelectedSite] = useState<number | null>(null);
  const [selectedSites, setSelectedSites] = useState<number[]>([]);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);

  // Roles that support multiple site assignment
  const isMultiSiteRole = selectedRole === "Manager" || selectedRole === "User";

  const [_formState, formAction] = useActionState(
    async (_prevData: any, data: any) => {
      try {
        const name = data.get("name");
        const email = data.get("email");
        const password = data.get("password");

        if (!selectedRole) {
          console.error("Please select a role");
          return;
        }

        // For managers, use site_ids array; for others, use site_id
        const userData: any = {
          name,
          email,
          password,
          role: selectedRole,
        };

        if (isMultiSiteRole && selectedSites.length > 0) {
          userData.site_ids = selectedSites;
        } else if (selectedSite) {
          userData.site_id = selectedSite;
        }

        const newUser = await createUser(userData);

        setUsers((prev) => [...prev, newUser.user || newUser]);
        setModalOpen(false);
        setSelectedSite(null);
        setSelectedSites([]);
        setSelectedRole(null);
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

  // Reset site selections when role changes
  useEffect(() => {
    setSelectedSite(null);
    setSelectedSites([]);
  }, [selectedRole]);

  const handleLoadData = useCallback(async () => {
    try {
      setLoading(true);
      const [usersData, sitesData] = await Promise.all([
        getUsers(),
        getSites(),
      ]);

      // Normalize user data: ensure all users have a sites array
      const normalizedUsers = usersData.map((user: User) => {
        if (user.role === "Manager" || user.role === "User") {
          // Managers and Users can have multiple sites
          // Use sites array if available, otherwise convert single site
          return {
            ...user,
            sites:
              user.sites && user.sites.length > 0
                ? user.sites
                : user.site
                  ? [user.site]
                  : [],
          };
        } else {
          // Admin/Superadmin: convert single site to sites array for consistent editing
          return {
            ...user,
            sites: user.site ? [user.site] : [],
          };
        }
      });

      setUsers(normalizedUsers);
      setSites(sitesData);
    } catch (error) {
      console.error("Error loading data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleEdit = async (row: User, updates: Partial<User>) => {
    try {
      const updateData: any = { ...updates };

      // Handle sites update (multiselect returns array of IDs)
      if (updates.sites !== undefined) {
        const siteIds = updates.sites as unknown as number[];
        const currentRole = updateData.role || row.role;
        // For Managers and Users, use site_ids array for multiple sites
        if (currentRole === "Manager" || currentRole === "User") {
          updateData.site_ids = siteIds;
        } else {
          // For Admin/Superadmin, use the first site_id (or null if empty)
          updateData.site_id = siteIds.length > 0 ? siteIds[0] : null;
        }
        delete updateData.sites;
      }

      // Handle site update - convert site object to site_id (for backward compatibility)
      if (updates.site !== undefined) {
        updateData.site_id =
          (updates.site as any)?.site_id ?? updates.site ?? null;
        delete updateData.site;
      }

      await updateUser(row.user_id, updateData);
      setUsers((prev) =>
        prev.map((item) =>
          item.user_id === row.user_id ? { ...item, ...updates } : item,
        ),
      );
      handleLoadData();
    } catch (error) {
      console.error("Error updating user:", error);
      throw error;
    }
  };

  const handleDelete = async (row: User) => {
    try {
      await deleteUser(row.user_id);
      setUsers((prev) => prev.filter((item) => item.user_id !== row.user_id));
    } catch (error) {
      console.error("Error deleting user:", error);
      throw error;
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

  const columns: Column<User>[] = [
    {
      key: "user_id",
      label: "ID",
      editable: false,
    },
    {
      key: "name",
      label: "Name",
      editable: true,
      type: "text",
    },
    {
      key: "email",
      label: "Email",
      editable: true,
      type: "text",
    },
    {
      key: "role",
      label: "Role",
      editable: true,
      type: "dropdown",
      options: roleOptions,
    },
    {
      key: "sites" as keyof User,
      label: "Site(s)",
      editable: true,
      type: "multiselect",
      options: siteOptions,
      render: (_value: any, row: User) => {
        // For Managers and Users, show multiple sites if available
        if (
          (row.role === "Manager" || row.role === "User") &&
          row.sites &&
          row.sites.length > 0
        ) {
          return row.sites.map((s) => s.name).join(", ");
        }
        // Fallback to single site
        return row.site?.name || "N/A";
      },
    },
    {
      key: "password",
      label: "Password",
      editable: true,
      type: "text",
      render: () => {
        return "••••••••";
      },
    },
  ];

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Users</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setModalOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Add User
          </button>
        </div>
      </div>

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

      <Table<User>
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

export default UserPage;
