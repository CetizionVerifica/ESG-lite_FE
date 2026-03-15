import { useState, useEffect, useCallback } from "react";
import { useTheme } from "../../context/ThemeContext";
import Modal from "../../components/Modal";
import {
  getManagerUsers,
  updateUserCategories,
  type ManagerUser,
  type SiteCategoryAccess,
} from "../../services/managerService";

const ManagerUsersPage = () => {
  const { isDark } = useTheme();
  const [users, setUsers] = useState<ManagerUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<ManagerUser | null>(null);
  const [categorySelections, setCategorySelections] = useState<
    Record<number, boolean>
  >({});
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getManagerUsers();
      setUsers(data);
    } catch (error) {
      console.error("Failed to load users:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const openManageModal = (user: ManagerUser) => {
    setSelectedUser(user);
    // Build initial checkbox state from user's category access
    const selections: Record<number, boolean> = {};
    for (const site of user.sites) {
      for (const cat of site.categories) {
        selections[cat.category_id] = cat.has_access;
      }
    }
    setCategorySelections(selections);
  };

  const handleToggleCategory = (categoryId: number) => {
    setCategorySelections((prev) => ({
      ...prev,
      [categoryId]: !prev[categoryId],
    }));
  };

  const handleSave = async () => {
    if (!selectedUser) return;

    const enabledCategoryIds = Object.entries(categorySelections)
      .filter(([, enabled]) => enabled)
      .map(([id]) => parseInt(id));

    try {
      setSaving(true);
      await updateUserCategories(selectedUser.user_id, enabledCategoryIds);
      setSuccessMsg(
        `Category access updated for ${selectedUser.name || selectedUser.email}`
      );
      setTimeout(() => setSuccessMsg(null), 3000);
      setSelectedUser(null);
      loadUsers();
    } catch (error) {
      console.error("Failed to update categories:", error);
    } finally {
      setSaving(false);
    }
  };

  const bgClass = isDark ? "bg-gray-900" : "bg-gray-50";
  const cardClass = isDark
    ? "bg-gray-800 border-gray-700"
    : "bg-white border-gray-200";
  const textClass = isDark ? "text-gray-100" : "text-gray-900";
  const subTextClass = isDark ? "text-gray-400" : "text-gray-500";
  const headerBg = isDark ? "bg-gray-700" : "bg-gray-50";
  const rowHover = isDark ? "hover:bg-gray-700" : "hover:bg-gray-50";
  const borderClass = isDark ? "border-gray-700" : "border-gray-200";

  return (
    <div className={`p-6 min-h-screen ${bgClass}`}>
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className={`text-2xl font-bold ${textClass}`}>
            User Access Management
          </h1>
          <p className={`mt-1 ${subTextClass}`}>
            Manage category access for users on your sites
          </p>
        </div>

        {successMsg && (
          <div className="mb-4 p-3 bg-green-100 text-green-800 rounded-lg border border-green-200">
            {successMsg}
          </div>
        )}

        {loading ? (
          <div className={`text-center py-12 ${subTextClass}`}>
            Loading users...
          </div>
        ) : users.length === 0 ? (
          <div className={`text-center py-12 ${subTextClass}`}>
            No users found on your sites.
          </div>
        ) : (
          <div className={`border rounded-lg overflow-hidden ${cardClass}`}>
            <table className="w-full">
              <thead>
                <tr className={headerBg}>
                  <th
                    className={`text-left px-4 py-3 text-sm font-medium ${subTextClass}`}
                  >
                    Name
                  </th>
                  <th
                    className={`text-left px-4 py-3 text-sm font-medium ${subTextClass}`}
                  >
                    Email
                  </th>
                  <th
                    className={`text-left px-4 py-3 text-sm font-medium ${subTextClass}`}
                  >
                    Role
                  </th>
                  <th
                    className={`text-left px-4 py-3 text-sm font-medium ${subTextClass}`}
                  >
                    Sites
                  </th>
                  <th
                    className={`text-left px-4 py-3 text-sm font-medium ${subTextClass}`}
                  >
                    Categories
                  </th>
                  <th
                    className={`text-center px-4 py-3 text-sm font-medium ${subTextClass}`}
                  >
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => {
                  const totalCategories = user.sites.reduce(
                    (sum, s) => sum + s.categories.length,
                    0
                  );
                  const enabledCategories = user.sites.reduce(
                    (sum, s) =>
                      sum + s.categories.filter((c) => c.has_access).length,
                    0
                  );

                  return (
                    <tr
                      key={user.user_id}
                      className={`border-t ${borderClass} ${rowHover}`}
                    >
                      <td className={`px-4 py-3 text-sm ${textClass}`}>
                        {user.name || "-"}
                        {user.last_name ? ` ${user.last_name}` : ""}
                      </td>
                      <td className={`px-4 py-3 text-sm ${subTextClass}`}>
                        {user.email}
                      </td>
                      <td className={`px-4 py-3 text-sm ${textClass}`}>
                        <span className="px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                          {user.role}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-sm ${textClass}`}>
                        {user.sites.map((s) => s.site_name).join(", ")}
                      </td>
                      <td className={`px-4 py-3 text-sm ${textClass}`}>
                        <span
                          className={
                            enabledCategories === totalCategories
                              ? "text-green-600"
                              : "text-amber-600"
                          }
                        >
                          {enabledCategories}/{totalCategories}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => openManageModal(user)}
                          className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                        >
                          Manage
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Manage Categories Modal */}
      {selectedUser && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedUser(null)}
          title={`Manage Categories — ${selectedUser.name || selectedUser.email}`}
          isDark={isDark}
        >
          <div className="space-y-6">
            {selectedUser.sites.map((site: SiteCategoryAccess) => (
              <div key={site.site_id}>
                <h3
                  className={`text-sm font-semibold mb-3 ${isDark ? "text-slate-200" : "text-gray-900"}`}
                >
                  Site: {site.site_name}
                </h3>
                <div className="space-y-1">
                  {site.categories.length === 0 ? (
                    <p className={`text-sm ${isDark ? "text-slate-400" : "text-gray-500"}`}>
                      No categories configured for this site.
                    </p>
                  ) : (
                    site.categories.map((cat) => {
                      const isEnabled = categorySelections[cat.category_id] ?? false;
                      return (
                        <label
                          key={cat.category_id}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                            isDark
                              ? "hover:bg-slate-700/50"
                              : "hover:bg-gray-50"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isEnabled}
                            onChange={() =>
                              handleToggleCategory(cat.category_id)
                            }
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className={`text-sm flex-1 ${
                            isDark ? "text-slate-200" : "text-gray-800"
                          }`}>
                            {cat.category_name}
                          </span>
                          {isEnabled ? (
                            <span className="text-xs font-medium text-green-500">
                              Enabled
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-red-400">
                              Revoked
                            </span>
                          )}
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            ))}

            <div className={`flex justify-end gap-3 pt-4 border-t ${isDark ? "border-slate-600" : "border-gray-200"}`}>
              <button
                onClick={() => setSelectedUser(null)}
                className={`px-4 py-2 text-sm rounded transition-colors ${
                  isDark
                    ? "text-slate-300 bg-slate-700 hover:bg-slate-600"
                    : "text-gray-600 bg-gray-100 hover:bg-gray-200"
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default ManagerUsersPage;
