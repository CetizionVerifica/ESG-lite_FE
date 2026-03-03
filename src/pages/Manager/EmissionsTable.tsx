import { useState, useEffect  } from "react";
import { EmissionData, EmissionStatus } from "../../services/emissionService";
import { getDocumentsByEmission, EmissionDocument } from "../../services/documentService";
import DocumentViewerModal from "../../components/DocumentViewerModal";

interface EmissionsTableProps {
  emissions: EmissionData[];
  loading: boolean;
  onApprove?: (id: number, comment?: string) => Promise<void>;
  onReject?: (id: number, comment: string) => Promise<void>;
  onBulkApprove?: (ids: number[]) => Promise<void>;
  onBulkDelete?: (ids: number[]) => Promise<void>;
  isDark?: boolean;
  formatActivityData?: (
    activityData: Record<string, unknown>,
    categoryId: number
  ) => { key: string; displayValue: string }[];
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const StatusBadge = ({ status, isDark = false }: { status: EmissionStatus; isDark?: boolean }) => {
  const statusStyles: Record<EmissionStatus, { light: string; dark: string }> = {
    pending: {
      light: "bg-yellow-100 text-yellow-800",
      dark: "bg-yellow-900/30 text-yellow-400",
    },
    approved: {
      light: "bg-green-100 text-green-800",
      dark: "bg-green-900/30 text-green-400",
    },
    rejected: {
      light: "bg-red-100 text-red-800",
      dark: "bg-red-900/30 text-red-400",
    },
  };

  const style = statusStyles[status] || { light: "bg-gray-100 text-gray-800", dark: "bg-slate-700 text-slate-300" };

  return (
    <span
      className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${isDark ? style.dark : style.light}`}
    >
      {status}
    </span>
  );
};

const EmissionsTable = ({ emissions, loading, onApprove, onReject, onBulkApprove, onBulkDelete, isDark = false,formatActivityData }: EmissionsTableProps) => {
  const [actionLoadingId, setActionLoadingId] = useState<number | null>(null);
  const [rejectingId, setRejectingId] = useState<number | null>(null);
  const [rejectComment, setRejectComment] = useState("");
  const [selectedPendingIds, setSelectedPendingIds] = useState<Set<number>>(new Set());
  const [selectedApprovedIds, setSelectedApprovedIds] = useState<Set<number>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Document viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [viewerDocuments, setViewerDocuments] = useState<EmissionDocument[]>([]);
  const [selectedDocument, setSelectedDocument] = useState<EmissionDocument | null>(null);
  const [loadingDocs, setLoadingDocs] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 5;

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

  // Document viewer handlers
  const handleViewDocuments = async (emissionId: number) => {
    try {
      setLoadingDocs(true);
      const docs = await getDocumentsByEmission(emissionId);
      if (docs.length > 0) {
        setViewerDocuments(docs);
        setSelectedDocument(docs[0]);
        setViewerOpen(true);
      } else {
        alert("No documents found for this emission.");
      }
    } catch (error) {
      console.error("Error fetching documents:", error);
      alert("Failed to load documents.");
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleCloseViewer = () => {
    setViewerOpen(false);
    setViewerDocuments([]);
    setSelectedDocument(null);
  };

  const handleNavigateDocument = (doc: EmissionDocument) => {
    setSelectedDocument(doc);
  };

  const resolveActivityData = (
    emission: EmissionData
  ): { key: string; displayValue: string }[] => {
    const activityData = emission.activity_data || {};
    const categoryId = emission.category?.category_id || 0;

    if (formatActivityData) {
      return formatActivityData(activityData, categoryId);
    }

    // Fallback: display raw values
    return Object.entries(activityData).map(([key, value]) => ({
      key,
      displayValue: String(value),
    }));
  };

  useEffect(() => {
  setCurrentPage(1);
}, [emissions]);

  // Theme classes
  const loadingClass = isDark ? "text-center py-8 text-slate-300" : "text-center py-8 text-gray-700";
  const emptyClass = isDark ? "text-center py-8 text-slate-400" : "text-center py-8 text-gray-500";

  const bulkApproveBgClass = isDark
    ? "mb-4 p-3 bg-green-900/20 border border-green-700/30 rounded-lg flex items-center justify-between"
    : "mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between";

  const bulkDeleteBgClass = isDark
    ? "mb-4 p-3 bg-red-900/20 border border-red-700/30 rounded-lg flex items-center justify-between"
    : "mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center justify-between";

  const tableClass = isDark
    ? "w-full border-collapse border border-slate-600"
    : "w-full border-collapse border border-gray-300";

  const thClass = isDark
    ? "border border-slate-600 px-4 py-3 text-left font-semibold text-slate-200 bg-slate-800"
    : "border border-gray-300 px-4 py-3 text-left font-semibold text-gray-700 bg-gray-100";

  const tdClass = isDark
    ? "border border-slate-600 px-4 py-3 text-slate-300"
    : "border border-gray-300 px-4 py-3 text-gray-900";

  const getRowClass = (isPendingSelected: boolean, isApprovedSelected: boolean) => {
    if (isPendingSelected) {
      return isDark ? "bg-green-900/20" : "bg-green-50";
    }
    if (isApprovedSelected) {
      return isDark ? "bg-red-900/20" : "bg-red-50";
    }
    return isDark ? "hover:bg-slate-800" : "hover:bg-gray-50";
  };

  const inputClass = isDark
    ? "w-full border border-slate-600 bg-slate-700 text-slate-200 px-2 py-1 rounded text-sm focus:outline-none focus:ring focus:ring-red-500/30"
    : "w-full border border-gray-300 px-2 py-1 rounded text-sm focus:outline-none focus:ring focus:ring-red-300";

  const viewDocsClass = isDark
    ? "px-3 py-1 text-sm bg-blue-600/30 text-blue-300 rounded hover:bg-blue-600/50 disabled:opacity-50 transition-colors"
    : "px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200 disabled:opacity-50 transition-colors";

  if (loading) {
    return <div className={loadingClass}>Loading emissions...</div>;
  }

  if (emissions.length === 0) {
    return (
      <div className={emptyClass}>
        No emissions found for the selected filters.
      </div>
    );
  }

  const showActions = onApprove || onReject;
  const showBulkApprove = onBulkApprove && pendingEmissions.length > 0;
  const showBulkDelete = onBulkDelete && approvedEmissions.length > 0;
  const showCheckboxColumn = showBulkApprove || showBulkDelete;

  const totalPages = Math.ceil(emissions.length / rowsPerPage);
const paginatedEmissions = emissions.slice(
  (currentPage - 1) * rowsPerPage,
  currentPage * rowsPerPage
);

  return (
    <div>
      {/* Bulk Actions Bar for Pending (Approve) */}
      {showBulkApprove && (
        <div className={bulkApproveBgClass}>
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
              <span className={`text-sm font-medium ${isDark ? "text-green-400" : "text-green-700"}`}>Select All Pending</span>
            </label>
            <span className={`text-sm ${isDark ? "text-slate-400" : "text-gray-600"}`}>
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
                  className={`px-3 py-1.5 text-sm ${isDark ? "text-slate-400 hover:text-slate-200" : "text-gray-600 hover:text-gray-800"}`}
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
        <div className={bulkDeleteBgClass}>
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
              <span className={`text-sm font-medium ${isDark ? "text-red-400" : "text-red-700"}`}>Select All Approved</span>
            </label>
            <span className={`text-sm ${isDark ? "text-slate-400" : "text-gray-600"}`}>
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
                  className={`px-3 py-1.5 text-sm ${isDark ? "text-slate-400 hover:text-slate-200" : "text-gray-600 hover:text-gray-800"}`}
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
        <table className={tableClass}>
          <thead>
            <tr>
              {/* Checkbox column for bulk selection */}
              {showCheckboxColumn && (
                <th className={`${thClass} text-center w-12`}>
                  <span className={`text-xs ${isDark ? "text-slate-400" : "text-gray-500"}`}>Select</span>
                </th>
              )}
              <th className={thClass}>Category</th>
              <th className={thClass}>Activity Data</th>
              <th className={thClass}>Activity Unit</th>
              <th className={thClass}>Total Emission (tCO2e)</th>
              <th className={thClass}>Date of Reporting</th>
              <th className={thClass}>Status</th>
              <th className={thClass}>Submitted By</th>
              <th className={thClass}>Submitted At</th>
              <th className={thClass}>Documents</th>
            {showActions && (
              <th className={thClass}>Actions</th>
            )}
          </tr>
        </thead>
        <tbody>
          {paginatedEmissions.map((emission) => {
            const isLoading = actionLoadingId === emission.pk_id;
            const isRejecting = rejectingId === emission.pk_id;
            const isPending = emission.status === "pending";
            const isApproved = emission.status === "approved";

            const isPendingSelected = selectedPendingIds.has(emission.pk_id);
            const isApprovedSelected = selectedApprovedIds.has(emission.pk_id);
            const activityRows = resolveActivityData(emission);


            return (
              <tr key={emission.pk_id} className={getRowClass(isPendingSelected, isApprovedSelected)}>
                {/* Checkbox for selection */}
                {showCheckboxColumn && (
                  <td className={`${tdClass} text-center`}>
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
                      <span className={isDark ? "text-slate-600" : "text-gray-300"}>-</span>
                    )}
                  </td>
                )}
                <td className={tdClass}>
                  {emission.category?.category_name || "-"}
                </td>
                {/* <td className={tdClass}>
                  <div className="max-w-xs">
                    {Object.entries(emission.activity_data || {}).map(([key, value]) => (
                      <div key={key} className="text-sm">
                        <span className="font-medium">{key}:</span> {String(value)}
                      </div>
                    ))}
                  </div>
                </td> */}
                <td className={tdClass}>
                    <div className="max-w-xs">
                      {activityRows.map(({ key, displayValue }) => (
                        <div key={key} className="text-sm">
                          <span className="font-medium">{key}:</span> {displayValue}
                        </div>
                      ))}
                    </div>
                  </td>
                <td className={tdClass}>
                  {emission.activity_data_unit || "-"}
                </td>
                <td className={tdClass}>
                  {Number(emission.total_emission).toFixed(2)}
                </td>
                <td className={tdClass}>
                  {formatDate(emission.date_of_reporting)}
                </td>
                <td className={tdClass}>
                  <StatusBadge status={emission.status} isDark={isDark} />
                </td>
                <td className={tdClass}>
                  {emission.created_by?.name || "-"}
                </td>
                <td className={tdClass}>
                  {formatDate(emission.created_at)}
                </td>
                <td className={tdClass}>
                  <button
                    onClick={() => handleViewDocuments(emission.pk_id)}
                    disabled={loadingDocs}
                    className={viewDocsClass}
                  >
                    View Docs
                  </button>
                </td>
                {showActions && (
                  <td className={tdClass}>
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
                          className={inputClass}
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
                            className={`px-3 py-1 rounded text-sm ${isDark ? "bg-slate-600 text-slate-200 hover:bg-slate-500" : "bg-gray-400 text-white hover:bg-gray-500"}`}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                    {!isPending && (
                      <span className={`text-sm ${isDark ? "text-slate-500" : "text-gray-500"}`}>-</span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
        </table>
      </div>

 {totalPages > 1 && (
        <div className={`flex items-center justify-between px-4 py-3 border-t mt-2 ${isDark ? "border-slate-600 bg-slate-800" : "border-gray-200 bg-white"}`}>
          <p className={`text-sm ${isDark ? "text-slate-400" : "text-gray-600"}`}>
            Showing{" "}
            <span className="font-medium">{(currentPage - 1) * rowsPerPage + 1}</span>{" "}
            to{" "}
            <span className="font-medium">{Math.min(currentPage * rowsPerPage, emissions.length)}</span>{" "}
            of{" "}
            <span className="font-medium">{emissions.length}</span> entries
          </p>
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1}
              className={`px-2 py-1 text-sm rounded border disabled:opacity-40 disabled:cursor-not-allowed ${isDark ? "border-slate-600 hover:bg-slate-700 text-slate-300" : "border-gray-300 hover:bg-gray-50 text-gray-700"}`}>«</button>
            <button onClick={() => setCurrentPage((p) => p - 1)} disabled={currentPage === 1}
              className={`px-2 py-1 text-sm rounded border disabled:opacity-40 disabled:cursor-not-allowed ${isDark ? "border-slate-600 hover:bg-slate-700 text-slate-300" : "border-gray-300 hover:bg-gray-50 text-gray-700"}`}>‹</button>

            {Array.from({ length: totalPages }, (_, i) => i + 1)
              .filter((page) => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 2)
              .reduce<(number | "...")[]>((acc, page, idx, arr) => {
                if (idx > 0 && page - (arr[idx - 1] as number) > 1) acc.push("...");
                acc.push(page);
                return acc;
              }, [])
              .map((item, idx) =>
                item === "..." ? (
                  <span key={`ellipsis-${idx}`} className={`px-2 ${isDark ? "text-slate-500" : "text-gray-400"}`}>…</span>
                ) : (
                  <button key={item} onClick={() => setCurrentPage(item as number)}
                    className={`px-3 py-1 text-sm rounded border transition-colors ${
                      currentPage === item
                        ? "bg-blue-600 text-white border-blue-600"
                        : isDark ? "border-slate-600 hover:bg-slate-700 text-slate-300" : "border-gray-300 hover:bg-gray-50 text-gray-700"
                    }`}>{item}</button>
                )
              )}

            <button onClick={() => setCurrentPage((p) => p + 1)} disabled={currentPage === totalPages}
              className={`px-2 py-1 text-sm rounded border disabled:opacity-40 disabled:cursor-not-allowed ${isDark ? "border-slate-600 hover:bg-slate-700 text-slate-300" : "border-gray-300 hover:bg-gray-50 text-gray-700"}`}>›</button>
            <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages}
              className={`px-2 py-1 text-sm rounded border disabled:opacity-40 disabled:cursor-not-allowed ${isDark ? "border-slate-600 hover:bg-slate-700 text-slate-300" : "border-gray-300 hover:bg-gray-50 text-gray-700"}`}>»</button>
          </div>
        </div>
      )}

      {/* Document Viewer Modal */}
      <DocumentViewerModal
        isOpen={viewerOpen}
        onClose={handleCloseViewer}
        document={selectedDocument}
        documents={viewerDocuments}
        onNavigate={handleNavigateDocument}
      />
    </div>
  );
}

export default EmissionsTable;
