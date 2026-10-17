import { useState } from "react";
import { Modal, SegmentedControl, TextField, useToast } from "../../../ui";
import { useSaveTemplate } from "../api";
import { errorMessage } from "../logic";

/** SE-6 · "Save as template": the form as it is saved now, for its client or for every client. */
export function SaveTemplateModal({ formId, formName, clientName, onClose }: { formId: number; formName: string; clientName: string | null; onClose: () => void }) {
  const { toast } = useToast();
  const save = useSaveTemplate();
  const [name, setName] = useState(formName);
  const [scope, setScope] = useState<"client" | "all">("client");
  const [err, setErr] = useState<string | null>(null);
  const submit = () => {
    setErr(null);
    save.mutate(
      { form_id: formId, name, ...(scope === "all" ? { company_id: null } : {}) },
      {
        onSuccess: (r) => {
          toast({ title: r.message ?? `Template "${name.trim()}" saved`, tone: "good" });
          onClose();
        },
        onError: (e) => setErr(errorMessage(e, "The template wasn't saved. Try again.")),
      },
    );
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Save as template"
      description="The form as it is saved now: its fields, choices, factor match, calculation and what contributors see. Unsaved changes aren't included."
      primaryAction={{ label: "Save template", onClick: submit, loading: save.isPending, disabled: !name.trim() }}
      error={err}
    >
      <div className="space-y-3">
        <TextField label="Template name" value={name} onChange={setName} maxLength={120} required />
        <SegmentedControl
          label="Who can use it"
          value={scope}
          onChange={setScope}
          options={[
            { value: "client", label: clientName ? `${clientName} only` : "This client only" },
            { value: "all", label: "Every client" },
          ]}
        />
        <p className="text-xs text-muted">{scope === "all" ? "A template for every client also fills in new clients' missing forms." : "Applied to this client's sites only."}</p>
      </div>
    </Modal>
  );
}
