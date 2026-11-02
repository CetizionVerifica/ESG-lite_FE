import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Toggle, panel, useToast } from "../../../ui";
import { assistantStatusKey } from "../../../lib/assistant/api";
import { errorMessage, useUpdateCompany } from "../api";
import type { ClientRow } from "../logic";

/**
 * Overview → "Help assistant" (AS-1). Bound to `company.assistant_enabled`
 * (default off, Superadmin only). On: everyone at the client gets "Ask ESGLite"
 * as a bubble at the bottom right, answering how-to questions from ESGLite's
 * help articles. It reads no client data; questions go to an outside AI
 * service. Off: the bubble goes; the call log is kept.
 *
 * `company.assistant_files_enabled` is separate and off by default: a file
 * people attach is client data, so this client has to be told first.
 * `company.assistant_data_enabled` (AS-2) is the same for a summary of a
 * person's own work.
 */
export function AssistantToggle({ row }: { row: ClientRow }) {
  const update = useUpdateCompany();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const on = row.assistant_enabled === true;
  const filesOn = row.assistant_files_enabled === true;
  const dataOn = row.assistant_data_enabled === true;

  const change = (data: { assistant_enabled: boolean } | { assistant_files_enabled: boolean } | { assistant_data_enabled: boolean }, title: string) => {
    setError(null);
    update.mutate(
      { id: row.company_id, data },
      {
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: assistantStatusKey });
          toast({ title, tone: "good" });
        },
        onError: (e) => setError(errorMessage(e, "The switch wasn't changed. Try again.")),
      },
    );
  };
  const save = (next: boolean) =>
    change({ assistant_enabled: next }, next ? `The help assistant is on for ${row.name}. Their people will see "Ask ESGLite" as a bubble at the bottom right.` : `The help assistant is off for ${row.name}.`);
  const saveData = (next: boolean) => change({ assistant_data_enabled: next }, next ? `"Ask ESGLite" can now use a summary of each person's work at ${row.name}.` : `"Ask ESGLite" can't use ${row.name}'s data any more.`);
  const saveFiles = (next: boolean) => change({ assistant_files_enabled: next }, next ? `${row.name}'s people can attach files to the help assistant.` : `${row.name}'s people can't attach files any more.`);

  return (
    <section aria-labelledby="assistant-title" className={`${panel} space-y-3 p-5`} data-testid="assistant-toggle">
      <div className="space-y-1">
        <h2 id="assistant-title" className="text-base font-semibold text-ink">
          Help assistant
        </h2>
        <p className="text-sm text-muted">
          An "Ask ESGLite" button that answers how-to questions from ESGLite's help articles. On its own it can't see this client's data. Questions are sent to an outside AI service to be answered.
        </p>
      </div>
      <Toggle
        label="Help assistant"
        hideLabel
        checked={on}
        onChange={save}
        disabled={update.isPending}
        error={error}
        inlineLabel={on ? `On. ${row.name}'s people see "Ask ESGLite" as a bubble at the bottom right.` : `Off. ${row.name}'s people don't see the help assistant.`}
      />
      {on && (
        <div className="space-y-2 border-t border-line pt-3" data-testid="assistant-files-toggle">
          <p className="text-sm text-muted">
            Let people attach files such as bills and spreadsheets and ask about them. What's in a file goes to an outside AI service to be read, and ESGLite doesn't save it. Tell {row.name} before turning this on.
          </p>
          <Toggle
            label="Attach files"
            hideLabel
            checked={filesOn}
            onChange={saveFiles}
            disabled={update.isPending}
            inlineLabel={filesOn ? `On. ${row.name}'s people see a paperclip in "Ask ESGLite".` : `Off. "Ask ESGLite" can't read ${row.name}'s files.`}
          />
        </div>
      )}
      {on && (
        <div className="space-y-2 border-t border-line pt-3" data-testid="assistant-data-toggle">
          <p className="text-sm text-muted">
            Let it answer questions about each person's own work, such as what's due or waiting for approval. A short summary of what that person can already see goes to an outside AI service, only when they ask about their work. Tell {row.name} before turning this on.
          </p>
          <Toggle
            label="Use their work data"
            hideLabel
            checked={dataOn}
            onChange={saveData}
            disabled={update.isPending}
            inlineLabel={dataOn ? `On. "Ask ESGLite" can tell ${row.name}'s people about their own work.` : `Off. "Ask ESGLite" can't see ${row.name}'s data.`}
          />
        </div>
      )}
    </section>
  );
}
