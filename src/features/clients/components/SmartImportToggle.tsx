import { useState } from "react";
import { Toggle, panel, useToast } from "../../../ui";
import { errorMessage, useUpdateCompany } from "../api";
import type { ClientRow } from "../logic";

/**
 * Overview → "Smart import" (XI4). Bound to `company.ai_import_enabled`: off
 * (the default) means the client's Managers and Admins get the column mapper
 * on Bulk upload; on, they can drop any workbook and the app works out the
 * mapping, which sends sheet headers and sample rows through a hosted model.
 * Separate from Claude imports, which stay for ESGLite staff only.
 */
export function SmartImportToggle({ row }: { row: ClientRow }) {
  const update = useUpdateCompany();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const on = row.ai_import_enabled === true;

  const onChange = (next: boolean) => {
    setError(null);
    update.mutate(
      { id: row.company_id, data: { ai_import_enabled: next } },
      {
        onSuccess: () => toast({ title: next ? `Smart import on for ${row.name}` : `Smart import off for ${row.name}`, tone: "good" }),
        onError: (e) => setError(errorMessage(e, "The switch wasn't changed. Try again.")),
      },
    );
  };

  return (
    <section aria-labelledby="smart-import-title" className={`${panel} space-y-3 p-5`}>
      <div className="space-y-1">
        <h2 id="smart-import-title" className="text-base font-semibold text-ink">
          Smart import
        </h2>
        <p className="text-sm text-muted">
          With this on, the client's managers and admins can drop any workbook on Bulk upload and the app works out the sheets, columns and activities for them to confirm. Sheet headers and a few sample rows go through a hosted model; the mapping is remembered for this client only. Imported rows still wait for a manager's approval.
        </p>
      </div>
      <Toggle
        label="Smart import"
        hideLabel
        checked={on}
        onChange={onChange}
        disabled={update.isPending}
        error={error}
        inlineLabel={on ? "On: managers can use Smart import on Bulk upload." : "Off: managers map columns themselves on Bulk upload."}
      />
    </section>
  );
}
