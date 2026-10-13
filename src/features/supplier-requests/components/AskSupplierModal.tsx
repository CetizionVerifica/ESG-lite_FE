import { useEffect, useMemo, useState } from "react";
import { Button, Callout, DateField, Drawer, Select, TextField, Textarea, cn, panel } from "../../../ui";
import type { SendResponse } from "../../../services/supplierRequestService";
import { usePreview, useSendRequest, useStudyInputs, useStudyOptions } from "../api";
import { type AskForm, PCF_UNITS, askProblem, errorMessage, unitLabel } from "../logic";

type Props = {
  open: boolean;
  onClose: () => void;
  /** From `?study=&input=`: the line "Ask supplier" was pressed on. */
  studyId: number | null;
  inputId: number | null;
  onSent: (sent: SendResponse) => void;
};

const blank = (studyId: number | null, inputId: number | null): AskForm => ({
  study_id: studyId,
  input_id: inputId,
  material: "",
  unit: "kg",
  supplier_name: "",
  supplier_email: "",
  due_date: "",
  note: "",
});

const UNIT_OPTIONS = PCF_UNITS.map((u) => ({ value: u, label: unitLabel(u) }));

/**
 * "Ask supplier" (the spec's modal, built as a Drawer because the form plus
 * the full message outgrows a Modal): supplier, material, unit wanted, due
 * date, then the exact message. Sending email to an outside address is an
 * outward action, so the message is shown in full and only an explicit Send
 * sends it.
 */
export function AskSupplierModal({ open, onClose, studyId, inputId, onSent }: Props) {
  const [form, setForm] = useState<AskForm>(() => blank(studyId, inputId));
  const [touched, setTouched] = useState(false);
  const set = (patch: Partial<AskForm>) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (open) {
      setForm(blank(studyId, inputId));
      setTouched(false);
    }
  }, [open, studyId, inputId]);

  const studies = useStudyOptions(open);
  const study = useStudyInputs(open ? form.study_id : null);

  // A chosen line fills in the material, unit and supplier.
  useEffect(() => {
    if (!study.data || form.input_id === null) return;
    const line = study.data.inputs.find((i) => i.pcf_input_id === form.input_id);
    if (!line) return;
    setForm((f) => ({
      ...f,
      material: f.material || line.name,
      unit: (PCF_UNITS as readonly string[]).includes(line.unit) ? line.unit : f.unit,
      supplier_name: f.supplier_name || line.supplier_name || "",
    }));
  }, [study.data, form.input_id]);

  const previewParams = useMemo(
    () =>
      open && form.study_id !== null && form.material.trim()
        ? {
            study_id: form.study_id,
            input_id: form.input_id,
            material: form.material.trim(),
            unit: form.unit,
            supplier_name: form.supplier_name.trim() || null,
            due_date: form.due_date || null,
            note: form.note.trim() || null,
          }
        : null,
    [open, form],
  );
  const preview = usePreview(previewParams);
  const send = useSendRequest();
  const problem = askProblem(form);

  const studyOptions = (studies.data ?? []).map((s) => ({
    value: s.pcf_study_id,
    label: `${s.product?.name ?? "Footprint"} · v${s.version} · ${s.status.replace(/_/g, " ")}${s.site ? ` · ${s.site.name}` : ""}`,
  }));
  const lineOptions = (study.data?.inputs ?? [])
    .filter((i) => i.stage !== "A2")
    .map((i) => ({ value: i.pcf_input_id, label: `${i.name} (${unitLabel(i.unit)})${i.supplier_pcf_kgco2e != null ? " · has a supplier figure" : ""}` }));

  const submit = () => {
    setTouched(true);
    if (problem || form.study_id === null) return;
    send.mutate(
      {
        study_id: form.study_id,
        input_id: form.input_id,
        material: form.material.trim(),
        unit: form.unit,
        supplier_email: form.supplier_email.trim(),
        supplier_name: form.supplier_name.trim() || null,
        due_date: form.due_date || null,
        note: form.note.trim() || null,
      },
      { onSuccess: (sent) => onSent(sent) },
    );
  };

  const error = send.isError ? errorMessage(send.error, "The request couldn't be sent.") : touched && problem ? problem : null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Ask a supplier for their footprint"
      subtitle="The supplier gets a link that needs no account, where they upload a PCF or EPD file or type the value."
      size="md"
      footer={
        <div className="flex flex-col gap-2">
          {error && (
            <p className="text-sm text-bad" role="alert">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose} disabled={send.isPending}>
              Cancel
            </Button>
            <Button onClick={submit} loading={send.isPending} disabled={!!problem && touched}>
              Send
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <Select<number>
          label="Footprint"
          value={form.study_id}
          onChange={(v) => set({ study_id: v, input_id: null, material: "", supplier_name: "" })}
          options={studyOptions}
          placeholder="Choose a footprint"
          loading={studies.isLoading}
          emptyText="No footprints yet"
          required
        />
        <Select<number>
          label="Input line"
          help="Optional. The accepted figure goes onto this line while the footprint is a draft."
          value={form.input_id}
          onChange={(v) => set({ input_id: v })}
          options={lineOptions}
          placeholder="No specific line"
          loading={study.isLoading}
          emptyText={form.study_id === null ? "Choose a footprint first" : "No material lines yet"}
        />
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <TextField label="Material" value={form.material} onChange={(v) => set({ material: v })} required placeholder="e.g. EC-grade aluminium ingot" />
          <Select<string> label="Per" value={form.unit} onChange={(v) => set({ unit: v ?? "kg" })} options={UNIT_OPTIONS} required />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Supplier" value={form.supplier_name} onChange={(v) => set({ supplier_name: v })} placeholder="Company name" />
          <TextField label="Supplier email" type="email" value={form.supplier_email} onChange={(v) => set({ supplier_email: v })} required autoComplete="off" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <DateField label="Due date" value={form.due_date} onChange={(v) => set({ due_date: v })} min={new Date().toISOString().slice(0, 10)} />
        </div>
        <Textarea label="Note to the supplier" value={form.note} onChange={(v) => set({ note: v })} rows={2} placeholder="Optional, e.g. your purchase order or part number" />
        <section aria-label="Message the supplier will receive" className={cn(panel, "p-3")}>
          <p className="text-xs font-medium text-muted">Message the supplier will receive</p>
          {preview.data ? (
            <>
              <p className="mt-1 text-sm font-medium text-ink">{preview.data.subject}</p>
              <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap font-sans text-sm text-ink" data-testid="ask-preview">
                {preview.data.text}
              </pre>
              {preview.data.mail_mode === "sink" && (
                <Callout tone="warn" className="mt-2">
                  Email sending is off on this server. The request is recorded and you copy the link to the supplier yourself.
                </Callout>
              )}
            </>
          ) : (
            <p className="mt-1 text-sm text-muted">{preview.isLoading ? "Building the message…" : "Fill in the footprint and material to see the message."}</p>
          )}
        </section>
      </div>
    </Drawer>
  );
}
