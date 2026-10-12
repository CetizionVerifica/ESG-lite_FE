import { AuditTimeline } from "../../../ui";
import type { AuditLogEntry } from "../../../services/auditLogService";
import { errorMessage, useAudit } from "../api";
import { AUDIT_ACTION_LABEL } from "../logic";

type Props = { studyId: number; active: boolean };

/** The study's audit log (E1 writes one row per calculate, submit, approve, send back, publish and supersede). */
export function AuditTab({ studyId, active }: Props) {
  const audit = useAudit(studyId, active);
  const entries: AuditLogEntry[] = (audit.data ?? []).map((e) => ({
    id: e.id,
    entity_type: "pcf_study",
    entity_id: studyId,
    action: AUDIT_ACTION_LABEL[e.action] ?? e.action,
    changed_fields: e.changed_fields ?? {},
    reason: e.reason,
    changed_by: e.changed_by ? { ...e.changed_by, email: "", role: "" } : null,
    changed_at: e.changed_at,
  }));
  return <AuditTimeline entries={entries} loading={audit.isPending} error={audit.error ? errorMessage(audit.error, "Couldn't load the history.") : null} onRetry={() => void audit.refetch()} />;
}
