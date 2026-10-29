import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Toggle, panel, useToast } from "../../../ui";
import { assistantStatusKey } from "../../../lib/assistant/api";
import { errorMessage, useUpdateCompany } from "../api";
import type { ClientRow } from "../logic";

/**
 * Overview → "Help assistant" (AS-1). Bound to `company.assistant_enabled`
 * (default off, Superadmin only). On: everyone at the client gets "Ask ESGLite"
 * in the top bar, answering how-to questions from ESGLite's help articles. It
 * reads no client data; questions go to an outside AI service. Off: the button
 * goes; the call log is kept.
 */
export function AssistantToggle({ row }: { row: ClientRow }) {
  const update = useUpdateCompany();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const on = row.assistant_enabled === true;

  const save = (next: boolean) => {
    setError(null);
    update.mutate(
      { id: row.company_id, data: { assistant_enabled: next } },
      {
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: assistantStatusKey });
          toast(
            next
              ? { title: `The help assistant is on for ${row.name}. Their people will see "Ask ESGLite" in the top bar.`, tone: "good" }
              : { title: `The help assistant is off for ${row.name}.`, tone: "good" },
          );
        },
        onError: (e) => setError(errorMessage(e, "The switch wasn't changed. Try again.")),
      },
    );
  };

  return (
    <section aria-labelledby="assistant-title" className={`${panel} space-y-3 p-5`} data-testid="assistant-toggle">
      <div className="space-y-1">
        <h2 id="assistant-title" className="text-base font-semibold text-ink">
          Help assistant
        </h2>
        <p className="text-sm text-muted">
          An "Ask ESGLite" button that answers how-to questions from ESGLite's help articles. It can't see this client's data. Questions are sent to an outside AI service to be answered.
        </p>
      </div>
      <Toggle
        label="Help assistant"
        hideLabel
        checked={on}
        onChange={save}
        disabled={update.isPending}
        error={error}
        inlineLabel={on ? `On. ${row.name}'s people see "Ask ESGLite" in the top bar.` : `Off. ${row.name}'s people don't see the help assistant.`}
      />
    </section>
  );
}
