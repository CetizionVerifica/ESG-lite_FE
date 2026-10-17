import api from "../api/axios";

export interface AuditLogEntry {
  id: number;
  entity_type: "emission" | "production_data" | "pcf_study" | "kpi_value" | `scope3_${string}`; // S3-14: base-year history; KPI-8: a KPI value's history
  entity_id: number;
  action: string;
  changed_fields: Record<string, { old: any; new: any }>;
  reason?: string | null;
  changed_by: { user_id: number; name: string; email: string; role: string } | null;
  changed_at: string;
}

export const getAuditLogs = async (
  entityType: "emission" | "production_data" | "kpi_value",
  entityId: number
): Promise<AuditLogEntry[]> => {
  const response = await api.get("/user/audit-logs", {
    params: { entity_type: entityType, entity_id: entityId },
  });
  // A list, or wrapped by name; anything else reads as no history.
  const data = response.data as unknown;
  if (Array.isArray(data)) return data as AuditLogEntry[];
  const wrapped = (data as { logs?: unknown; audit_logs?: unknown } | null)?.logs ?? (data as { audit_logs?: unknown } | null)?.audit_logs;
  return Array.isArray(wrapped) ? (wrapped as AuditLogEntry[]) : [];
};
