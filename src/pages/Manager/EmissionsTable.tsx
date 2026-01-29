import { useState } from "react";
import { EmissionData, EmissionStatus } from "../../services/emissionService";

interface EmissionsTableProps {
  emissions: EmissionData[];
  loading: boolean;
  onApprove?: (id: number, comment?: string) => Promise<void>;
  onReject?: (id: number, comment: string) => Promise<void>;
  onBulkApprove?: (ids: number[]) => Promise<void>;
  onBulkDelete?: (ids: number[]) => Promise<void>;
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const StatusBadge = ({ status }: { status: EmissionStatus }) => {
  const statusStyles: Record<EmissionStatus, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    approved: "bg-green-100 text-green-800",
    rejected: "bg-red-100 text-red-800",
  };

  return (
    <span
      className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${statusStyles[status] || "bg-gray-100 text-gray-800"}`}
    >
      {status}
    </span>
  );
};

const EmissionsTable = ({ emissions, loading, onApprove, onReject, onBulkApprove, onBulkDelete }: EmissionsTableProps) => {
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [selectedPendingIds, setSelectedPendingIds] = useState<Set<number>>(new Set());
  const [selectedApprovedIds, setSelectedApprovedIds] = useState<Set<number>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Get pending and approved emissions
  const pendingEmissions = emissions.filter((e) => e.status === "pending");
  const approvedEmissions = emissions.filter((e) => e.status === "approved");
  const pendingIds = pendingEmissions.map((e) => e.pk_id);
  const approvedIds = approvedEmissions.map((e) => e.pk_id);

  // Check selection states for pending
  const allPendingSelected = pendingIds.length > 0 && pendingIds.every((id) => selectedPendingIds.has(id));
  const somePendingSelected = pendingIds.some((id) => selectedPendingIds.has(id));

  // Check selection states for approved
  const allApprovedSelected = approvedIds.length > 0 && approvedIds.every((id) => selectedApprovedIds.has(id));
  const someApprovedSelected = approvedIds.some((id) => selectedApprovedIds.has(id));

  // Toggle single pending row selection
  const togglePendingRowSelection = (id: number) => {
    setSelectedPendingIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Toggle single approved row selection
  const toggleApprovedRowSelection = (id: number) => {
    setSelectedApprovedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Toggle all pending rows selection
  const toggleSelectAllPending = () => {
    if (allPendingSelected) {
      setSelectedPendingIds(new Set());
    } else {
      setSelectedPendingIds(new Set(pendingIds));
    }
  };

  // Toggle all approved rows selection
  const toggleSelectAllApproved = () => {
    if (allApprovedSelected) {
      setSelectedApprovedIds(new Set());
    } else {
      setSelectedApprovedIds(new Set(approvedIds));
    }
  };

  // Handle bulk approve
  const handleBulkApprove = async () => {
    if (!onBulkApprove || selectedPendingIds.size === 0) return;
    setBulkLoading(true);
    try {
      await onBulkApprove(Array.from(selectedPendingIds));
      setSelectedPendingIds(new Set());
    } finally {
      setBulkLoading(false);
    }
  };

  // Handle bulk delete
  const handleBulkDelete = async () => {
    if (!onBulkDelete || selectedApprovedIds.size === 0) return;
    if (!confirm(`Are you sure you want to delete ${selectedApprovedIds.size} approved emission(s)?`)) {
      return;
    }
    setDeleteLoading(true);
    try {
      await onBulkDelete(Array.from(selectedApprovedIds));
      setSelectedApprovedIds(new Set());
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleApprove = async (id: number) => {
    if (!onApprove) return;
    setActionLoadingId(id);
    try {
      await onApprove(id);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRejectClick = (id: number) => {
    setRejectingId(id);
    setRejectComment("");
  };

  const handleRejectConfirm = async () => {
    if (!onReject || !rejectingId || !rejectComment.trim()) return;
    setActionLoadingId(rejectingId);
    try {
      await onReject(rejectingId, rejectComment.trim());
      setRejectingId(null);
      setRejectComment("");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRejectCancel = () => {
    setRejectingId(null);
    setRejectComment("");
  };

  if (loading) {
    return <div className="text-center py-8">Loading emissions...</div>;
  }

  if (emissions.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        No emissions found for the selected filters.
      </div>
    );
  }

  const showActions = onApprove || onReject;
  const showBulkApprove = onBulkApprove && pendingEmissions.length > 0;
  const showBulkDelete = onBulkDelete && approvedEmissions.length > 0;
  const showCheckboxColumn = showBulkApprove || showBulkDelete;

  return (
    <div>
      {/* Bulk Actions Bar for Pending (Approve) */}
      {showBulkApprove && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allPendingSelected}
                ref={(el) => {
                  if (el) el.indeterminate = somePendingSelected && !allPendingSelected;
                }}
                onChange={toggleSelectAllPending}
                className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <span className="text-sm font-medium text-green-700">Select All Pending</span>
            </label>
            <span className="text-sm text-gray-600">
              {selectedPendingIds.size > 0 ? (
                <>{selectedPendingIds.size} of {pendingEmissions.length} pending row{selectedPendingIds.size !== 1 ? "s" : ""} selected</>
              ) : (
                <>{pendingEmissions.length} pending emission{pendingEmissions.length !== 1 ? "s" : ""}</>
              )}
            </span>
          </div>
          <div className="flex gap-2">
            {selectedPendingIds.size > 0 && (
              <>
                <button
                  onClick={() => setSelectedPendingIds(new Set())}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                >
                  Clear
                </button>
                <button
                  onClick={handleBulkApprove}
                  disabled={bulkLoading}
                  className="px-4 py-1.5 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 disabled:bg-gray-400"
                >
                  {bulkLoading ? "Approving..." : `Approve Selected (${selectedPendingIds.size})`}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Bulk Actions Bar for Approved (Delete) */}
      {showBulkDelete && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={allApprovedSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someApprovedSelected && !allApprovedSelected;
                }}
                onChange={toggleSelectAllApproved}
                className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
              />
              <span className="text-sm font-medium text-red-700">Select All Approved</span>
            </label>
            <span className="text-sm text-gray-600">
              {selectedApprovedIds.size > 0 ? (
                <>{selectedApprovedIds.size} of {approvedEmissions.length} approved row{selectedApprovedIds.size !== 1 ? "s" : ""} selected</>
              ) : (
                <>{approvedEmissions.length} approved emission{approvedEmissions.length !== 1 ? "s" : ""}</>
              )}
            </span>
          </div>
          <div className="flex gap-2">
            {selectedApprovedIds.size > 0 && (
              <>
                <button
                  onClick={() => setSelectedApprovedIds(new Set())}
                  className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                >
                  Clear
                </button>
                <button
                  onClick={handleBulkDelete}
                  disabled={deleteLoading}
                  className="px-4 py-1.5 bg-red-600 text-white rounded text-sm font-medium hover:bg-red-700 disabled:bg-gray-400"
                >
                  {deleteLoading ? "Deleting..." : `Delete Selected (${selectedApprovedIds.size})`}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              {/* Checkbox column for bulk selection */}
              {showCheckboxColumn && (
                <th className="border border-gray-300 px-3 py-3 text-center w-12">
                  <span className="text-xs text-gray-500">Select</span>
                </th>
              )}
              <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700">
                Category
              </th>
              <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700">
                Activity Data
              </th>
              <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700">
                Activity Unit
              </th>
              <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700">
                Total Emission (tCO2e)
              </th>
              <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700">
                Date of Reporting
              </th>
              <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700">
                Status
              </th>
              <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700">
                Submitted By
              </th>
              <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700">
                Submitted At
              </th>
            {showActions && (
              <th className="border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700">
                Actions
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {emissions.map((emission) => {
            const isLoading = actionLoadingId === emission.pk_id;
            const isRejecting = rejectingId === emission.pk_id;
            const isPending = emission.status === "pending";
            const isApproved = emission.status === "approved";

            const isPendingSelected = selectedPendingIds.has(emission.pk_id);
            const isApprovedSelected = selectedApprovedIds.has(emission.pk_id);

            return (
              <tr key={emission.pk_id} className={`hover:bg-gray-50 ${isPendingSelected ? "bg-green-50" : ""} ${isApprovedSelected ? "bg-red-50" : ""}`}>
                {/* Checkbox for selection */}
                {showCheckboxColumn && (
                  <td className="border border-gray-300 px-3 py-3 text-center">
                    {isPending && showBulkApprove ? (
                      <input
                        type="checkbox"
                        checked={isPendingSelected}
                        onChange={() => togglePendingRowSelection(emission.pk_id)}
                        className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                        title="Select for approval"
                      />
                    ) : isApproved && showBulkDelete ? (
                      <input
                        type="checkbox"
                        checked={isApprovedSelected}
                        onChange={() => toggleApprovedRowSelection(emission.pk_id)}
                        className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                        title="Select for deletion"
                      />
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                )}
                <td className="border border-gray-300 px-4 py-3">
                  {emission.category?.category_name || "-"}
                </td>
                <td className="border border-gray-300 px-4 py-3">
                  <div className="max-w-xs">
                    {Object.entries(emission.activity_data || {}).map(([key, value]) => (
                      <div key={key} className="text-sm">
                        <span className="font-medium">{key}:</span> {String(value)}
                      </div>
                    ))}
                  </div>
                </td>
                <td className="border border-gray-300 px-4 py-3">
                  {emission.activity_data_unit || "-"}
                </td>
                <td className="border border-gray-300 px-4 py-3">
                  {Number(emission.total_emission).toFixed(2)}
                </td>
                <td className="border border-gray-300 px-4 py-3">
                  {formatDate(emission.date_of_reporting)}
                </td>
                <td className="border border-gray-300 px-4 py-3">
                  <StatusBadge status={emission.status} />
                </td>
                <td className="border border-gray-300 px-4 py-3">
                  {emission.created_by?.name || "-"}
                </td>
                <td className="border border-gray-300 px-4 py-3">
                  {formatDate(emission.created_at)}
                </td>
                {showActions && (
                  <td className="border border-gray-300 px-4 py-3">
                    {isPending && !isRejecting && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApprove(emission.pk_id)}
                          disabled={isLoading}
                          className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:bg-gray-400"
                        >
                          {isLoading ? "..." : "Approve"}
                        </button>
                        <button
                          onClick={() => handleRejectClick(emission.pk_id)}
                          disabled={isLoading}
                          className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:bg-gray-400"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                    {isRejecting && (
                      <div className="flex flex-col gap-2">
                        <input
                          type="text"
                          placeholder="Rejection reason (required)"
                          value={rejectComment}
                          onChange={(e) => setRejectComment(e.target.value)}
                          className="w-full border border-gray-300 px-2 py-1 rounded text-sm focus:outline-none focus:ring focus:ring-red-300"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={handleRejectConfirm}
                            disabled={isLoading || !rejectComment.trim()}
                            className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 disabled:bg-gray-400"
                          >
                            {isLoading ? "..." : "Confirm"}
                          </button>
                          <button
                            onClick={handleRejectCancel}
                            disabled={isLoading}
                            className="px-3 py-1 bg-gray-400 text-white rounded text-sm hover:bg-gray-500"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                    {!isPending && (
                      <span className="text-sm text-gray-500">-</span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
        </table>
      </div>
    </div>
  );
}

export default EmissionsTable;
