import { useState } from "react";
import { Modal, NumberField, TextField } from "../../../../ui";
import type { PreviewRow } from "../../logic";

export interface RowEdit {
  activity_name: string;
  activity_value: number | null;
  activity_unit: string;
}

/** Edits the three things the engine calculates from, as a plan row change (`PATCH /imports/plans/:id`, `set`). */
export function RowEditModal(props: { row: PreviewRow | null; saving: boolean; error: string | null; onClose: () => void; onSave: (rowRef: string, edit: RowEdit) => void }) {
  const { row } = props;
  // The draft belongs to one row: opening another row starts from that row's values.
  const [drafted, setDrafted] = useState<{ ref: string; edit: RowEdit } | null>(null);
  const ref = row?.row_ref ?? "";
  const draft = drafted && drafted.ref === ref ? drafted.edit : null;
  const setDraft = (edit: RowEdit | null) => setDrafted(edit ? { ref, edit } : null);
  const current: RowEdit = draft ?? {
    activity_name: String(row?.emission_category ?? ""),
    activity_value: row?.activity_value == null || row.activity_value === "" ? null : Number(row.activity_value),
    activity_unit: String(row?.activity_data_unit ?? ""),
  };
  const close = () => {
    setDraft(null);
    props.onClose();
  };
  const valid = current.activity_name.trim().length > 0 && current.activity_unit.trim().length > 0 && current.activity_value !== null && current.activity_value > 0;

  return (
    <Modal
      open={row !== null}
      onClose={close}
      title={`Edit row ${row?.row_ref ?? ""}`}
      description="The row is checked and calculated again when you save. Other cells of the row stay as they are."
      error={props.error}
      primaryAction={{ label: "Save and recheck", loading: props.saving, disabled: !valid, onClick: () => row?.row_ref && props.onSave(row.row_ref, current) }}
    >
      <div className="space-y-3">
        <TextField label="Activity" required value={current.activity_name} onChange={(v) => setDraft({ ...current, activity_name: v })} help="As an emission factor or mapping names it." />
        <div className="grid gap-3 sm:grid-cols-2">
          <NumberField label="Value" required value={current.activity_value} min={0} onChange={(v) => setDraft({ ...current, activity_value: v })} />
          <TextField label="Unit" required value={current.activity_unit} onChange={(v) => setDraft({ ...current, activity_unit: v })} />
        </div>
      </div>
    </Modal>
  );
}
