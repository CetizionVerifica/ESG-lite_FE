import api from "../api/axios";

export interface AuditLogEntry {
  id: number;
  entity_type: "emission" | "production_data";
  entity_id: number;
  action: string;
  changed_fields: Record<string, { old: any; new: any }>;
  changed_by: { user_id: number; name: string; email: string; role: string } | null;
  changed_at: string;
}

export const getAuditLogs = async (
  entityType: "emission" | "production_data",
  entityId: number
): Promise<AuditLogEntry[]> => {
  const response = await api.get("/user/audit-logs", {
    params: { entity_type: entityType, entity_id: entityId },
  });
  return response.data;
};
