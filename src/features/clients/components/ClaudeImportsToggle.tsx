import { useState } from "react";
import { Toggle, panel, useToast } from "../../../ui";
import { errorMessage, useUpdateCompany } from "../api";
import type { ClientRow } from "../logic";

/**
 * Overview → "Allow Claude imports" (IM10). Bound to `company.mcp_enabled`:
 * off (the default) means every Claude import for this client is refused.
 * Saves on toggle through the client update endpoint.
 */
export function ClaudeImportsToggle({ row }: { row: ClientRow }) {
  const update = useUpdateCompany();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const on = row.mcp_enabled === true;

  const onChange = (next: boolean) => {
    setError(null);
    update.mutate(
      { id: row.company_id, data: { mcp_enabled: next } },
      {
        onSuccess: () => toast({ title: next ? `Claude imports allowed for ${row.name}` : `Claude imports switched off for ${row.name}`, tone: "good" }),
        onError: (e) => setError(errorMessage(e, "The switch wasn't changed. Try again.")),
      },
    );
  };

  return (
    <section aria-labelledby="claude-imports-title" className={`${panel} space-y-3 p-5`}>
      <div className="space-y-1">
        <h2 id="claude-imports-title" className="text-base font-semibold text-ink">
          Claude imports
        </h2>
        <p className="text-sm text-muted">
          With this on, ESGLite staff connected to Claude can import this client's activity data from spreadsheets. Imported rows wait for the site managers' approval; Claude can never approve, edit or delete anything.
        </p>
      </div>
      <Toggle
        label="Allow Claude imports"
        hideLabel
        checked={on}
        onChange={onChange}
        disabled={update.isPending}
        error={error}
        inlineLabel={on ? "Allowed: Claude can create entries for review for this client." : "Off: every Claude import for this client is refused."}
      />
    </section>
  );
}
