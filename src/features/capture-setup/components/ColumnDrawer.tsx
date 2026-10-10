import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button, Callout, Drawer, Modal, Select, TextField } from "../../../ui";
import { COLUMN_TYPES, type ColumnDraft, type ColumnRow, type ColumnType, type LibraryColumn, draftFrom, hasErrors, validateDraft, wipesChoices } from "../logic";
import { ChoicesEditor } from "./ChoicesEditor";

export type ColumnDrawerProps = {
  /** The column being edited; null when adding one. */
  row: ColumnRow | null;
  open: boolean;
  loading?: boolean;
  /** Every column, for the duplicate-name check. */
  library: LibraryColumn[];
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (draft: ColumnDraft) => void;
  onDelete: () => void;
};

/** Add or edit a library column: name, type and, for Select, its default choices. */
export function ColumnDrawer({ row, open, loading, library, saving, error, onClose, onSave, onDelete }: ColumnDrawerProps) {
  const [draft, setDraft] = useState<ColumnDraft>(() => draftFrom(row));
  const [tried, setTried] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const others = library.filter((c) => c.pk_id !== row?.pk_id);
  const errors = validateDraft(draft, others);
  const shown = tried ? errors : { rows: {} as Record<string, string> };
  const wipe = wipesChoices(row, draft);

  const submit = () => {
    setTried(true);
    if (hasErrors(errors)) return;
    if (wipe > 0) setConfirmWipe(true);
    else onSave(draft);
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={row ? row.column_name : "Add column"}
      subtitle={row ? `${row.typeLabel} · used by ${row.usedBy.length} ${row.usedBy.length === 1 ? "form" : "forms"}` : "A field forms can use"}
      loading={loading}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          {row ? (
            <Button variant="ghost" icon={<Trash2 aria-hidden className="size-4" />} onClick={onDelete} className="text-bad">
              Delete column
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" loading={saving} onClick={submit}>
              {row ? "Save column" : "Add column"}
            </Button>
          </div>
        </div>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {error && (
          <Callout tone="warn" title="Not saved">
            {error}
          </Callout>
        )}
        <TextField label="Column name" required value={draft.name} onChange={(v) => setDraft((d) => ({ ...d, name: v }))} error={shown.name} placeholder="e.g. Fuel type" />
        <Select<ColumnType>
          label="Type"
          required
          value={draft.type}
          onChange={(v) => setDraft((d) => ({ ...d, type: v }))}
          options={COLUMN_TYPES}
          placeholder="Choose a type"
          error={shown.type}
          help={draft.type === "select" ? "Contributors pick one of the choices below." : undefined}
        />
        {wipe > 0 && (
          <Callout tone="warn" title={`Saving removes ${wipe} ${wipe === 1 ? "choice" : "choices"}`}>
            Only Select columns keep choices. Forms that override them keep their own lists.
          </Callout>
        )}
        {draft.type === "select" && <ChoicesEditor choices={draft.choices} onChange={(choices) => setDraft((d) => ({ ...d, choices }))} errors={shown.rows} />}
        {row && row.usedBy.length > 0 && (
          <section aria-labelledby="used-by-title" className="space-y-1">
            <h3 id="used-by-title" className="text-sm font-medium text-ink">
              Used by
            </h3>
            <ul className="flex flex-wrap gap-1.5">
              {row.usedBy.map((f) => (
                <li key={f.id} className="rounded-chip bg-tint px-2 py-0.5 text-xs text-ink">
                  {f.name}
                </li>
              ))}
            </ul>
          </section>
        )}
      </form>
      {confirmWipe && (
        <Modal
          open
          tone="destructive"
          title={`Remove ${wipe} ${wipe === 1 ? "choice" : "choices"}?`}
          description={`"${row?.column_name}" becomes a ${COLUMN_TYPES.find((t) => t.value === draft.type)?.label ?? ""} column and loses its default choices.`}
          primaryAction={{
            label: "Change type",
            onClick: () => {
              setConfirmWipe(false);
              onSave(draft);
            },
          }}
          onClose={() => setConfirmWipe(false)}
        />
      )}
    </Drawer>
  );
}
