import { type CSSProperties, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, FileText } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button, Callout, DateField, EmptyState, FileDrop, type FileDropItem, Loading, NumberField, PoweredBy, Select, TextField, Textarea, cn, panel } from "../../ui";
import { PLANETPULSE, buildTheme, toCssVars, useTheme } from "../../theme";
import { type PublicRequest, type PublicSubmission, openPublicRequest, submitPublicRequest } from "../../services/supplierRequestService";
import { BOUNDARIES, BOUNDARY_LABEL, type Boundary, type SupplierForm as Form, BLANK_SUPPLIER_FORM, boundaryLabel, errorMessage, submitProblem, unitLabel } from "./logic";

const status = (e: unknown): number | undefined => (e as { response?: { status?: number } })?.response?.status;

const dateText = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : null);

/**
 * C06 · `/supplier/:token`: the supplier's side, outside the shell and with
 * no account. The token is the key; the page shows what is asked for and
 * takes a PCF/EPD file, a PACT JSON, or typed values. PlanetPulse theme.
 */
export default function SupplierPage() {
  const { token = "" } = useParams();
  const { resolvedAppearance } = useTheme();
  const style = useMemo(
    () => ({ ...toCssVars(buildTheme(PLANETPULSE, PLANETPULSE.defaultLook, resolvedAppearance)), colorScheme: resolvedAppearance }) as CSSProperties,
    [resolvedAppearance],
  );
  const request = useQuery({ queryKey: ["supplier-link", token], queryFn: () => openPublicRequest(token), enabled: !!token, retry: false, staleTime: Infinity });
  const [form, setForm] = useState<Form>(BLANK_SUPPLIER_FORM);
  const [items, setItems] = useState<FileDropItem[]>([]);
  const [touched, setTouched] = useState(false);
  const [sent, setSent] = useState<PublicRequest | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const file = items[0]?.file ?? null;
  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const submit = useMutation({ mutationFn: (s: PublicSubmission) => submitPublicRequest(token, s) });
  const problem = submitProblem(form, file);

  const send = () => {
    setTouched(true);
    if (problem) return;
    submit.mutate(
      {
        file,
        value_kgco2e: form.value,
        unit: form.value !== null ? request.data?.unit : null,
        boundary: form.boundary,
        standard: form.standard.trim() || null,
        reference_start: form.reference_start || null,
        reference_end: form.reference_end || null,
        valid_from: form.valid_from || null,
        valid_to: form.valid_to || null,
        verifier: form.verifier.trim() || null,
        product_name: form.product_name.trim() || null,
        note: form.note.trim() || null,
      },
      {
        onSuccess: (r) => {
          setSent(r);
          setCorrecting(false);
          setItems([]);
        },
      },
    );
  };

  let body: React.ReactNode;
  if (request.isPending) {
    body = <Loading label="Opening the request">{null}</Loading>;
  } else if (request.isError) {
    const code = status(request.error);
    body = (
      <EmptyState
        variant="error"
        title={code === 410 ? "This link has expired." : code === 404 ? "This link isn't valid." : "The request couldn't be opened."}
        description={code === 410 ? "Ask the company for a new link." : code === 404 ? "Check the link in the email, or ask the company for a new one." : errorMessage(request.error, "Check your connection and try again.")}
        action={code === 404 || code === 410 ? undefined : <Button onClick={() => void request.refetch()}>Try again</Button>}
      />
    );
  } else {
    const r = sent ?? request.data!;
    const closed = r.status === "accepted" || r.status === "rejected";
    const already = !!r.received_at && !sent;
    body = (
      <div className="space-y-6">
        <section className={cn(panel, "space-y-2 p-4")} aria-label="What is asked for">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{r.company} asks for</p>
          <h1 className="text-xl font-semibold text-ink">
            {boundaryLabel(r.boundary)} footprint of {r.material}
          </h1>
          <p className="text-sm text-muted">
            In kg CO₂e per {unitLabel(r.unit)}
            {r.product ? `, used in ${r.product}` : ""}
            {r.due_date ? `. Wanted by ${dateText(r.due_date)}.` : "."}
          </p>
        </section>

        {sent || closed || already ? (
          <section className={cn(panel, "space-y-3 p-4")} aria-live="polite">
            <p className="flex items-center gap-2 text-sm font-medium text-ink">
              <CheckCircle2 aria-hidden className="size-5 text-good" />
              {sent ? "Thank you, your data was received." : closed ? "This request is closed." : "Your data was received."}
            </p>
            {r.reply && (
              <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-sm">
                {r.reply.value_kgco2e != null && (
                  <>
                    <dt className="text-muted">Value</dt>
                    <dd className="text-ink">
                      {r.reply.value_kgco2e.toLocaleString("en-GB", { maximumFractionDigits: 4 })} kg CO₂e per {unitLabel(r.reply.unit ?? r.unit)}
                    </dd>
                  </>
                )}
                {r.reply.boundary && (
                  <>
                    <dt className="text-muted">Boundary</dt>
                    <dd className="text-ink">{boundaryLabel(r.reply.boundary)}</dd>
                  </>
                )}
                {r.reply.file && (
                  <>
                    <dt className="text-muted">File</dt>
                    <dd className="flex items-center gap-1 text-ink">
                      <FileText aria-hidden className="size-4 text-muted" />
                      {r.reply.file.name}
                    </dd>
                  </>
                )}
              </dl>
            )}
            {!closed && (
              <Button variant="secondary" onClick={() => setCorrecting(true)}>
                {sent ? "Send a correction" : "Send again"}
              </Button>
            )}
          </section>
        ) : null}

        {!closed && (correcting || (!sent && !already)) && (
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            aria-label="Your footprint data"
          >
            <FileDrop
              label="Your product carbon footprint or EPD"
              help="A PDF, or a PACT JSON file, up to 10 MB. Or type the value below."
              items={items}
              onAdd={(files) => setItems(files.slice(0, 1).map((f) => ({ id: `${f.name}-${f.size}`, file: f, status: "done" })))}
              onRemove={() => setItems([])}
              accept={[".pdf", ".json", "application/pdf", "application/json"]}
              maxSize={10 * 1024 * 1024}
              multiple={false}
              disabled={submit.isPending}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <NumberField label="Value" unit={`kg CO₂e per ${unitLabel(r.unit)}`} value={form.value} onChange={(v) => set({ value: v })} min={0} step={0.0001} placeholder="e.g. 7.85" />
              <Select<string>
                label="System boundary"
                value={form.boundary}
                onChange={(v) => set({ boundary: (v as Boundary) ?? null })}
                options={BOUNDARIES.map((b) => ({ value: b, label: BOUNDARY_LABEL[b] }))}
                placeholder="Choose"
                required={form.value !== null}
                help={form.boundary && form.boundary !== r.boundary ? `${r.company} asked for a ${boundaryLabel(r.boundary).toLowerCase()} figure; they will see the difference.` : undefined}
              />
              <TextField label="Standard" value={form.standard} onChange={(v) => set({ standard: v })} placeholder="e.g. ISO 14067, EN 15804" />
              <TextField label="Product name" value={form.product_name} onChange={(v) => set({ product_name: v })} placeholder="As it appears in your declaration" />
              <DateField label="Reference period from" value={form.reference_start} onChange={(v) => set({ reference_start: v })} />
              <DateField label="Reference period to" value={form.reference_end} onChange={(v) => set({ reference_end: v })} />
              <DateField label="Valid from" value={form.valid_from} onChange={(v) => set({ valid_from: v })} />
              <DateField label="Valid to" value={form.valid_to} onChange={(v) => set({ valid_to: v })} />
              <TextField label="Verified by" value={form.verifier} onChange={(v) => set({ verifier: v })} placeholder="Third-party verifier, if any" className="sm:col-span-2" />
            </div>
            <Textarea label="Note" value={form.note} onChange={(v) => set({ note: v })} rows={2} placeholder="Anything the company should know" />
            {submit.isError && (
              <Callout tone="warn">
                {status(submit.error) === 410 ? "This link has expired; ask the company for a new one." : status(submit.error) === 409 ? "This request is closed." : errorMessage(submit.error, "Your answer couldn't be saved. Try again.")}
              </Callout>
            )}
            {touched && problem && (
              <p className="text-sm text-bad" role="alert">
                {problem}
              </p>
            )}
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted">Only {r.company} sees what you send.</p>
              <Button type="submit" loading={submit.isPending}>
                Send to {r.company}
              </Button>
            </div>
          </form>
        )}
      </div>
    );
  }

  return (
    <div style={style} data-pack={PLANETPULSE.id} className="flex min-h-screen flex-col bg-page text-ink">
      <header className="bg-linear-to-br from-cover-from to-cover-to px-6 py-5">
        <span className="font-brand text-lg font-semibold text-on-brand">ESGLite</span>
      </header>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">{body}</main>
      <footer className="px-6 py-6">
        <PoweredBy />
      </footer>
    </div>
  );
}
