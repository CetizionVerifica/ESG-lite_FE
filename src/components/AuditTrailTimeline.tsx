import { useState, useEffect } from "react";
import { getAuditLogs, AuditLogEntry } from "../services/auditLogService";
import Modal from "./Modal";

interface AuditTrailTimelineProps {
  entityType: "emission" | "production_data";
  entityId: number;
  isDark?: boolean;
}

interface AuditTrailModalProps {
  isOpen: boolean;
  onClose: () => void;
  entityType: "emission" | "production_data";
  entityId: number;
  isDark?: boolean;
}

function formatTimestamp(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatFieldName(field: string): string {
  return field
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatValue(value: any): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "object") {
    return Object.entries(value)
      .map(([k, v]) => `${k}: ${v}`)
      .join(", ");
  }
  if (typeof value === "string" && value.includes("T")) {
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
  }
  return String(value);
}

// Shared timeline rendering used by both inline and modal variants
const TimelineContent = ({
  logs,
  isDark = false,
}: {
  logs: AuditLogEntry[];
  isDark?: boolean;
}) => {
  const timelineLine = isDark ? "bg-slate-700" : "bg-gray-200";
  const cardBg = isDark ? "border-slate-600 bg-slate-700/50" : "bg-gray-50 border-gray-200";
  const cardShadow = isDark ? "" : "shadow-sm";
  const userText = isDark ? "text-slate-200" : "text-gray-800";
  const metaText = isDark ? "text-slate-400" : "text-gray-500";
  const roleBadge = isDark ? "bg-blue-900/30 text-blue-400 border-blue-800/40" : "bg-blue-50 text-blue-700 border-blue-200";
  const timeText = isDark ? "text-slate-500" : "text-gray-400";
  const fieldLabel = isDark ? "text-slate-400" : "text-gray-500";
  const oldValueBg = isDark
    ? "bg-red-900/20 text-red-400 border-red-800/30"
    : "bg-red-50 text-red-700 border-red-200";
  const newValueBg = isDark
    ? "bg-green-900/20 text-green-400 border-green-800/30"
    : "bg-green-50 text-green-700 border-green-200";
  const dotRing = isDark ? "ring-slate-800" : "ring-white";

  return (
    <div className="ml-2 relative">
      <div className={`absolute left-[7px] top-2 bottom-2 w-[2px] ${timelineLine}`} />
      <div className="space-y-3">
        {logs.map((log, index) => (
          <div key={log.id} className="relative flex gap-3">
            <div className="relative z-10 flex-shrink-0 mt-1.5">
              <div
                className={`w-4 h-4 rounded-full bg-blue-500 ring-2 ${dotRing} ${index === 0 ? "ring-4 ring-blue-500/20" : ""}`}
              />
            </div>
            <div className={`flex-1 rounded-lg border p-3 ${cardBg} ${cardShadow}`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`text-sm font-medium ${userText}`}>
                    {log.changed_by?.name || "Unknown"}
                  </span>
                  {log.changed_by?.role && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-medium capitalize ${roleBadge}`}>
                      {log.changed_by.role}
                    </span>
                  )}
                </div>
                <span className={`text-xs whitespace-nowrap ${timeText}`}>
                  {formatTimestamp(log.changed_at)}
                </span>
              </div>
              {log.changed_by?.email && (
                <div className={`text-xs mb-2 ${metaText}`}>
                  {log.changed_by.email}
                </div>
              )}
              <div className="space-y-2">
                {Object.entries(log.changed_fields).map(
                  ([field, { old: oldVal, new: newVal }]) => (
                    <div key={field}>
                      <div className={`text-xs font-medium mb-1 ${fieldLabel}`}>
                        {formatFieldName(field)}
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span
                          className={`inline-block px-2 py-0.5 rounded border ${oldValueBg} max-w-[45%] truncate`}
                          title={formatValue(oldVal)}
                        >
                          {formatValue(oldVal)}
                        </span>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={`flex-shrink-0 ${isDark ? "text-slate-500" : "text-gray-400"}`}
                        >
                          <line x1="5" y1="12" x2="19" y2="12" />
                          <polyline points="12 5 19 12 12 19" />
                        </svg>
                        <span
                          className={`inline-block px-2 py-0.5 rounded border ${newValueBg} max-w-[45%] truncate`}
                          title={formatValue(newVal)}
                        >
                          {formatValue(newVal)}
                        </span>
                      </div>
                    </div>
                  )
                )}
              </div>
              {log.reason && (
                <div className={`mt-2 text-xs rounded border px-2.5 py-1.5 ${isDark ? "bg-amber-900/20 text-amber-400 border-amber-800/30" : "bg-amber-50 text-amber-800 border-amber-200"}`}>
                  <span className="font-medium">Reason:</span> {log.reason}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Inline collapsible timeline (used inside edit modals)
const AuditTrailTimeline = ({
  entityType,
  entityId,
  isDark = false,
}: AuditTrailTimelineProps) => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setLoading(true);
        const data = await getAuditLogs(entityType, entityId);
        setLogs(data);
      } catch (error) {
        console.error("Error fetching audit logs:", error);
        setLogs([]);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, [entityType, entityId]);

  if (loading) {
    return (
      <div className={`mt-4 pt-4 border-t ${isDark ? "border-slate-700" : "border-gray-200"}`}>
        <div className="flex items-center gap-2">
          <div className={`w-4 h-4 rounded-full animate-pulse ${isDark ? "bg-slate-600" : "bg-gray-300"}`} />
          <span className={`text-sm ${isDark ? "text-slate-400" : "text-gray-500"}`}>
            Loading edit history...
          </span>
        </div>
      </div>
    );
  }

  if (logs.length === 0) return null;

  const sectionBorder = isDark ? "border-slate-700" : "border-gray-200";
  const headerText = isDark ? "text-slate-300" : "text-gray-600";
  const countBadge = isDark ? "bg-slate-700 text-slate-300" : "bg-gray-200 text-gray-600";
  const chevronColor = isDark ? "text-slate-400" : "text-gray-400";

  return (
    <div className={`mt-4 pt-4 border-t ${sectionBorder}`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between group cursor-pointer"
      >
        <div className="flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isDark ? "text-blue-400" : "text-blue-600"}>
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span className={`text-sm font-medium ${headerText}`}>Edit History</span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${countBadge}`}>{logs.length}</span>
        </div>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform duration-200 ${chevronColor} ${expanded ? "rotate-180" : ""}`}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {expanded && (
        <div className="mt-3">
          <TimelineContent logs={logs} isDark={isDark} />
        </div>
      )}
    </div>
  );
};

// Standalone modal for viewing audit trail from table rows
export const AuditTrailModal = ({
  isOpen,
  onClose,
  entityType,
  entityId,
  isDark = false,
}: AuditTrailModalProps) => {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    const fetchLogs = async () => {
      try {
        setLoading(true);
        const data = await getAuditLogs(entityType, entityId);
        setLogs(data);
      } catch (error) {
        console.error("Error fetching audit logs:", error);
        setLogs([]);
      } finally {
        setLoading(false);
      }
    };
    fetchLogs();
  }, [isOpen, entityType, entityId]);

  const emptyText = isDark ? "text-slate-400" : "text-gray-500";
  const loadingText = isDark ? "text-slate-400" : "text-gray-500";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edit History" isDark={isDark}>
      {loading ? (
        <div className="flex items-center justify-center py-8 gap-3">
          <div className={`w-5 h-5 rounded-full animate-pulse ${isDark ? "bg-slate-600" : "bg-gray-300"}`} />
          <span className={`text-sm ${loadingText}`}>Loading edit history...</span>
        </div>
      ) : logs.length === 0 ? (
        <div className={`text-center py-8 ${emptyText}`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={`mx-auto mb-3 ${isDark ? "text-slate-600" : "text-gray-300"}`}>
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <p className="text-sm">No edit history found for this entry.</p>
        </div>
      ) : (
        <div>
          <p className={`text-xs mb-4 ${isDark ? "text-slate-500" : "text-gray-400"}`}>
            {logs.length} change{logs.length !== 1 ? "s" : ""} recorded
          </p>
          <TimelineContent logs={logs} isDark={isDark} />
        </div>
      )}
    </Modal>
  );
};

export default AuditTrailTimeline;
