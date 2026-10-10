import { useState } from "react";
import { Button, Callout, Drawer, Modal, Select, TextField, Toggle } from "../../../ui";
import { type Company, type CompanyDraft, type DraftField, EMPLOYEE_RANGES, draftFrom, isDirty, validate } from "../logic";

type Props = {
  company: Company;
  saving: boolean;
  /** Server error from the last save. */
  error: string | null;
  onClose: () => void;
  onSave: (draft: CompanyDraft) => void;
};

/** Edit the client's company details. Mount with `key` per open so it starts from the saved values. */
export function CompanyDrawer({ company, saving, error, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<CompanyDraft>(() => draftFrom(company));
  const [touched, setTouched] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const errors = validate(draft);
  const invalid = Object.keys(errors).length > 0;
  const dirty = isDirty(draft, company);
  const set = <K extends DraftField>(k: K, v: CompanyDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const err = (k: DraftField) => (touched ? errors[k] : undefined);

  const close = () => (dirty && !saving ? setConfirmClose(true) : onClose());
  const save = () => {
    setTouched(true);
    if (!invalid) onSave(draft);
  };

  return (
    <>
      <Drawer
        open
        size="md"
        onClose={close}
        title="Edit details"
        subtitle={company.name}
        footer={
          <div className="ml-auto flex gap-2">
            <Button onClick={close} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} loading={saving} disabled={saving || !dirty}>
              Save
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {error && (
            <div key={error} ref={(el) => el?.focus()} tabIndex={-1} className="focus:outline-none">
              <Callout tone="warn" title="Couldn't save the details">
                {error}
              </Callout>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField className="sm:col-span-2" label="Company name" required value={draft.name} onChange={(v) => set("name", v)} error={err("name")} maxLength={160} />
            <TextField className="sm:col-span-2" label="Address" required value={draft.address} onChange={(v) => set("address", v)} error={err("address")} />
            <TextField label="Contact person" required value={draft.contact_person} onChange={(v) => set("contact_person", v)} error={err("contact_person")} />
            <TextField label="Email" type="email" value={draft.email} onChange={(v) => set("email", v)} error={err("email")} />
            <TextField label="Phone" type="tel" value={draft.phone_number} onChange={(v) => set("phone_number", v)} />
            <TextField label="CIN" value={draft.cin_number} onChange={(v) => set("cin_number", v)} />
            <TextField label="Industry" value={draft.industry} onChange={(v) => set("industry", v)} />
            <TextField label="Region" value={draft.region} onChange={(v) => set("region", v)} />
            <Select<string>
              label="Employee range"
              value={draft.employee_range || null}
              onChange={(v) => set("employee_range", v ?? "")}
              placeholder="Not set"
              options={EMPLOYEE_RANGES.map((r) => ({ value: r, label: r }))}
            />
            <Toggle
              className="sm:col-span-2"
              label="ESG-Mitra access"
              inlineLabel="This client can use ESG-Mitra"
              checked={draft.esgMitraAccess}
              onChange={(v) => set("esgMitraAccess", v)}
            />
          </div>
        </div>
      </Drawer>
      <Modal
        open={confirmClose}
        onClose={() => setConfirmClose(false)}
        title="Discard your changes?"
        description="Your edits to this client haven't been saved."
        cancelLabel="Keep editing"
        primaryAction={{
          label: "Discard",
          onClick: () => {
            setConfirmClose(false);
            onClose();
          },
        }}
      />
    </>
  );
}
