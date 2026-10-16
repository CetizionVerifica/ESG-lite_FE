import { useState } from "react";
import type { SupplierRecord } from "../../../../services/scope3SuppliersService";
import { Button, Drawer, TextField } from "../../../../ui";
import { errorMessage, useSaveSupplier } from "../api";
import { type SupplierDraft, supplierBody, supplierDraftErrors } from "../logic";

type Props = {
  companyId: number | null;
  /** The supplier being edited; null adds one. */
  supplier: SupplierRecord | null;
  onClose: () => void;
  onSaved: (supplier: SupplierRecord) => void;
};

/** Add a supplier, or change its name, country and email. Mounted per open, so it starts from that supplier. */
export function SupplierFormDrawer({ companyId, supplier, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState<SupplierDraft>(() => ({ name: supplier?.name ?? "", country: supplier?.country ?? "", email: supplier?.email ?? "" }));
  const [tried, setTried] = useState(false);
  const save = useSaveSupplier(companyId);
  const errors = supplierDraftErrors(draft);
  const shown = tried ? errors : {};
  const set = (patch: Partial<SupplierDraft>) => setDraft((d) => ({ ...d, ...patch }));

  const onSave = () => {
    setTried(true);
    if (Object.keys(errors).length) return;
    save.mutate({ id: supplier?.supplier_id ?? null, body: supplierBody(draft) }, { onSuccess: (saved) => onSaved(saved) });
  };

  return (
    <Drawer
      open
      onClose={onClose}
      size="sm"
      title={supplier ? `Edit ${supplier.name}` : "Add supplier"}
      footer={
        <div className="flex flex-wrap items-center justify-end gap-3">
          {save.isError && (
            <p role="alert" className="mr-auto text-sm text-bad">
              {errorMessage(save.error, "The supplier wasn't saved. Try again.")}
            </p>
          )}
          <Button variant="ghost" onClick={onClose} disabled={save.isPending}>
            Cancel
          </Button>
          <Button variant="primary" onClick={onSave} loading={save.isPending}>
            {supplier ? "Save changes" : "Add supplier"}
          </Button>
        </div>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          onSave();
        }}
      >
        <TextField label="Name" value={draft.name} onChange={(v) => set({ name: v })} required error={shown.name} maxLength={200} help="As the supplier writes it. Names that differ only in capitals are the same supplier." />
        <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
          <TextField label="Country" value={draft.country} onChange={(v) => set({ country: v })} error={shown.country} maxLength={2} placeholder="AE" />
          <TextField label="Email" type="email" value={draft.email} onChange={(v) => set({ email: v })} error={shown.email} maxLength={200} autoComplete="off" />
        </div>
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden="true" />
      </form>
    </Drawer>
  );
}
