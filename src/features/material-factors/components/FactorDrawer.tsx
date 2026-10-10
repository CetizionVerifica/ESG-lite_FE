import { useState } from "react";
import {
  Badge,
  Button,
  Callout,
  Combobox,
  DateField,
  Drawer,
  Modal,
  NumberField,
  Select,
  TextField,
  Toggle,
} from "../../../ui";
import {
  type Company,
  type Draft,
  type DraftField,
  type FactorDetail,
  type MaterialFactor,
  type Role,
  GROUPS,
  LICENCES,
  LICENCE_LABEL,
  STATUS_LABEL,
  UNITS,
  canEdit,
  draftFrom,
  emptyDraft,
  geographyLabel,
  groupLabel,
  isDirty,
  sourceLabel,
  validate,
} from "../logic";
import { LicensedValue } from "./LicensedValue";

export type SaveError = { message: string; existingId: number | null } | null;

type Props = {
  role: Role;
  /** The factor being viewed or edited; null with `creating` for a new one. */
  row: MaterialFactor | null;
  creating: boolean;
  loading?: boolean;
  /** Usage list for `row`, loaded separately (C04 backend). */
  detail: { data: FactorDetail | undefined; loading: boolean; error: boolean };
  companies: Company[];
  defaultCompanyId: number | null;
  saving: boolean;
  error: SaveError;
  onOpenExisting: (id: number) => void;
  onClose: () => void;
  onSave: (draft: Draft) => void;
  onDelete: () => void;
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Create, view and edit one factor, with the footprints that use it. Mount with `key` per factor. */
export function FactorDrawer(props: Props) {
  const { row, creating, role } = props;
  const [draft, setDraft] = useState<Draft>(() => (row ? draftFrom(row) : emptyDraft(props.defaultCompanyId)));
  const [touched, setTouched] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);

  if (props.loading) return <Drawer open loading onClose={props.onClose} title="Loading factor…" />;
  if (!creating && !row) return <Drawer open={false} onClose={props.onClose} title="" />;

  const editable = creating || canEdit(row!, role);
  const valueHidden = !!row?.value_hidden;
  const errors = validate(draft, { valueHidden });
  const invalid = Object.keys(errors).length > 0;
  const dirty = editable && isDirty(draft, row);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const fieldError = (k: DraftField) => (touched ? errors[k] : undefined);
  const close = () => (dirty && !props.saving ? setConfirmClose(true) : props.onClose());
  const save = () => {
    setTouched(true);
    if (!invalid) props.onSave(draft);
  };

  const usedBy = row?.used_by ?? props.detail.data?.used_by ?? 0;
  const approved = row?.used_by_approved ?? props.detail.data?.used_by_approved ?? 0;
  const groupOptions = [...GROUPS, ...(draft.material_group && !(GROUPS as readonly string[]).includes(draft.material_group) ? [draft.material_group] : [])].map(
    (g) => ({ value: g, label: groupLabel(g) }),
  );
  const unitOptions = [...UNITS, ...(draft.unit && !(UNITS as readonly string[]).includes(draft.unit) ? [draft.unit] : [])].map((u) => ({ value: u, label: u }));
  // Managers can't add licensed rows; a superadmin picks any licence.
  const licenceOptions = LICENCES.filter((l) => role === "Superadmin" || l !== "ecoinvent").map((l) => ({ value: l, label: LICENCE_LABEL[l] }));
  const companyOptions = [{ value: 0, label: "Global library" }, ...props.companies.map((c) => ({ value: c.company_id, label: c.name }))];

  return (
    <>
      <Drawer
        open
        size="md"
        onClose={close}
        title={creating ? "Add factor" : row!.name}
        subtitle={creating ? "kgCO₂e per unit, cradle to gate, with its source." : [groupLabel(row!.material_group), geographyLabel(row!.geography), sourceLabel(row!)].filter(Boolean).join(" · ")}
        footer={
          <div className="flex w-full flex-wrap items-center gap-2">
            {!creating && editable && (
              <Button variant="danger" onClick={props.onDelete} disabled={props.saving || usedBy > 0} title={usedBy > 0 ? "Used by footprints; replace it there first" : undefined}>
                Delete factor
              </Button>
            )}
            <div className="ml-auto flex gap-2">
              <Button onClick={close} disabled={props.saving}>
                {editable ? "Cancel" : "Close"}
              </Button>
              {editable && (
                <Button variant="primary" onClick={save} loading={props.saving} disabled={props.saving || (!creating && !dirty)}>
                  {creating ? "Add factor" : "Save"}
                </Button>
              )}
            </div>
          </div>
        }
      >
        <div className="space-y-4">
          {props.error && (
            <div key={props.error.message} ref={(el) => el?.focus()} tabIndex={-1} className="focus:outline-none">
              <Callout
                tone="warn"
                title={props.error.existingId ? "This factor is already in the library" : "Couldn't save the factor"}
                action={
                  props.error.existingId ? (
                    <Button size="sm" variant="ghost" onClick={() => props.onOpenExisting(props.error!.existingId!)}>
                      Open the existing factor
                    </Button>
                  ) : undefined
                }
              >
                {props.error.existingId ? "One factor per name, geography, source year and company. Change one of those, or edit the existing row." : props.error.message}
              </Callout>
            </div>
          )}
          {!creating && approved > 0 && editable && (
            <Callout tone="info">
              Used by {plural(approved, "approved footprint")}. They keep the old value until recalculated.
            </Callout>
          )}
          {!editable && (
            <Callout tone="info">
              {row!.company_id === null ? "This factor is in the global library. Only a superadmin can change it." : "Only a superadmin can change licensed (ecoinvent) factors."}
            </Callout>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {creating && role === "Superadmin" && (
              <Combobox<number>
                className="sm:col-span-2"
                label="Belongs to"
                help="Global factors are visible to every client. A client row is that client's own value, such as a supplier's figure."
                value={draft.company_id ?? 0}
                onChange={(v) => set("company_id", v ? v : null)}
                options={companyOptions}
              />
            )}
            <TextField className="sm:col-span-2" label="Name" required disabled={!editable} value={draft.name} onChange={(v) => set("name", v)} error={fieldError("name")} maxLength={200} />
            <Select<string> label="Group" required disabled={!editable} value={draft.material_group || null} onChange={(v) => set("material_group", v ?? "")} options={groupOptions} placeholder="Pick a group" error={fieldError("material_group")} />
            <TextField label="Geography" help="Country or region code; empty means global." disabled={!editable} value={draft.geography} onChange={(v) => set("geography", v)} maxLength={60} />
            {valueHidden ? (
              <div className="space-y-1">
                <p className="text-sm font-medium text-ink">Value</p>
                <LicensedValue />
                <p className="text-xs text-muted">Licensed values are only shown to superadmins.</p>
              </div>
            ) : (
              <NumberField label="Value" required disabled={!editable} value={draft.value} onChange={(v) => set("value", v)} unit={`kgCO₂e/${draft.unit || "unit"}`} min={0} step={0.0001} error={fieldError("value")} />
            )}
            <Select<string> label="Unit" required disabled={!editable} value={draft.unit || null} onChange={(v) => set("unit", v ?? "")} options={unitOptions} error={fieldError("unit")} />
            <Select<string> label="GWP set" disabled={!editable} value={draft.gwp_set} onChange={(v) => set("gwp_set", v === "AR5" ? "AR5" : "AR6")} options={[{ value: "AR6", label: "AR6" }, { value: "AR5", label: "AR5" }]} />
            <Select<string> label="Licence" disabled={!editable} value={draft.licence} onChange={(v) => set("licence", (v as Draft["licence"]) ?? "open")} options={editable ? licenceOptions : LICENCES.map((l) => ({ value: l, label: LICENCE_LABEL[l] }))} />
            <TextField label="Source" help="Publisher or database, e.g. IAI, ICA, DEFRA." disabled={!editable} value={draft.source} onChange={(v) => set("source", v)} maxLength={120} />
            <NumberField label="Source year" disabled={!editable} value={draft.source_year} onChange={(v) => set("source_year", v)} min={1900} max={2100} step={1} error={fieldError("source_year")} />
            <TextField className="sm:col-span-2" label="Dataset reference" disabled={!editable} value={draft.dataset_ref} onChange={(v) => set("dataset_ref", v)} maxLength={200} />
            <DateField label="Valid from" disabled={!editable} value={draft.valid_from} onChange={(v) => set("valid_from", v)} />
            <DateField label="Valid to" disabled={!editable} value={draft.valid_to} onChange={(v) => set("valid_to", v)} error={fieldError("valid_to")} />
            <Toggle
              className="sm:col-span-2"
              label="Recycled variant"
              disabled={!editable}
              checked={draft.recycled_variant}
              onChange={(v) => set("recycled_variant", v)}
              inlineLabel={draft.recycled_variant ? "Carries collection and reprocessing only (cut-off)" : "Virgin material"}
            />
          </div>

          {!creating && <UsageList detail={props.detail} />}
        </div>
      </Drawer>
      <Modal
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        title="Discard your changes?"
        description="Your edits to this factor haven't been saved."
        cancelLabel="Keep editing"
        primaryAction={{
          label: "Discard",
          onClick: () => {
            setConfirmClose(false);
            props.onClose();
          },
        }}
      />
    </>
  );
}

const statusTone = { draft: "neutral", in_review: "info", approved: "good", published: "brand", superseded: "neutral" } as const;

function UsageList({ detail }: { detail: Props["detail"] }) {
  const uses = detail.data?.used_in;
  return (
    <section aria-labelledby="factor-usage" className="space-y-2 border-t border-line pt-4">
      <h3 id="factor-usage" className="text-sm font-semibold text-ink">
        Used by
      </h3>
      {detail.loading ? (
        <p className="text-sm text-muted">Loading footprints…</p>
      ) : detail.error || !uses ? (
        <p className="text-sm text-muted">Couldn't load the footprints that use this factor.</p>
      ) : uses.length === 0 ? (
        <p className="text-sm text-muted">No footprint uses this factor yet.</p>
      ) : (
        <ul className="divide-y divide-line rounded-control border border-line">
          {uses.map((u) => (
            <li key={u.pcf_study_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 truncate text-ink">
                {u.product.name} <span className="text-muted">v{u.version}</span>
              </span>
              <Badge tone={statusTone[u.status]}>{STATUS_LABEL[u.status]}</Badge>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
