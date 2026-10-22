import { useState } from "react";
import { Modal, NumberField, Select, TextField } from "../../../../ui";
import type { PreviewRow } from "../../logic";
import { useActivityOptions } from "../../smart/api";
import { rowUnitIssue } from "../../smart/logic";

export interface RowEdit {
  activity_name: string;
  activity_value: number | null;
  activity_unit: string;
}

/** Edits the three things the engine calculates from, as a plan row change (`PATCH /imports/plans/:id`, `set`). */
export function RowEditModal(props: {
  row: PreviewRow | null;
  /** #183: where the row goes, so Unit offers the units its activity accepts; null keeps Unit free text. */
  siteId?: number | null;
  categoryId?: number | null;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (rowRef: string, edit: RowEdit) => void;
}) {
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
  // #183: the units the row's activity accepts (the import context's accepted_units). While the activity is the
  // sheet's own wording, the factor the plan resolved it to names it ("Diesel (gen-set)" → Diesel).
  const siteId = props.siteId ?? null;
  const categoryId = props.categoryId ?? null;
  const name = current.activity_name.trim();
  const resolved = name === String(row?.emission_category ?? "").trim() ? String(row?.global_category_name ?? "").trim() : "";
  const lookup = resolved || name;
  const found = useActivityOptions(siteId ?? 0, categoryId, lookup, row !== null && siteId !== null && lookup !== "");
  const accepted = found.data?.find((a) => a.name.trim().toLowerCase() === lookup.toLowerCase())?.accepted_units ?? null;
  const sheetUnit = String(row?.activity_data_unit ?? "");
  const unit = current.activity_unit;
  const fromSheet = accepted && unit && !accepted.some((u) => u.toLowerCase() === unit.trim().toLowerCase()) ? unit : null;
  // The engine's own words while the sheet's unit is still the one on the row.
  const unitIssue = unit === sheetUnit ? rowUnitIssue(row) : null;
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
          {accepted ? (
            <Select<string>
              label="Unit"
              required
              value={unit || null}
              placeholder="Choose a unit"
              options={[...accepted, ...(fromSheet ? [fromSheet] : [])].map((u) => ({ value: u, label: u === fromSheet ? `${u} (from the sheet)` : u }))}
              onChange={(v) => setDraft({ ...current, activity_unit: v ?? "" })}
              error={fromSheet ? (unitIssue ?? `${fromSheet} isn't a unit for ${lookup}. Choose one of the others.`) : undefined}
            />
          ) : (
            <TextField label="Unit" required value={unit} onChange={(v) => setDraft({ ...current, activity_unit: v })} error={unitIssue ?? undefined} />
          )}
        </div>
      </div>
    </Modal>
  );
}
