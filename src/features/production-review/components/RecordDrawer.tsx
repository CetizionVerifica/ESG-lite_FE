import { useEffect, useRef, useState, type ReactNode } from "react";
import type { ProductionDataStatus } from "../../../services/productionDataService";
import {
  Button,
  Callout,
  DateField,
  Drawer,
  EntityAuditTimeline,
  SkeletonText,
  StatusPill,
  Textarea,
  UnitInput,
  formatDate,
  formatNumber,
} from "../../../ui";
import { errorMessage, useImpactBase, useReviewMutations } from "../api";
import { type EditDraft, type ProductionRow, editErrors, intensityImpact, periodText, unitChoices } from "../logic";
import { OverlapChip } from "./OverlapChip";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(8rem,40%)_1fr] gap-3 border-b border-line py-1.5 text-sm last:border-b-0">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

export function RecordDrawer({
  row,
  status,
  overlaps,
  startEditing,
  onClose,
  onApprove,
  onReject,
  onEdited,
}: {
  row: ProductionRow | null;
  /** Status to show (an approval in its undo window shows as approved). */
  status: ProductionDataStatus | undefined;
  overlaps: string[] | undefined;
  /** Open straight in edit mode (row menu "Edit"). */
  startEditing?: boolean;
  onClose: () => void;
  onApprove: (row: ProductionRow) => void;
  onReject: (row: ProductionRow) => void;
  onEdited: (saved?: Partial<ProductionRow>) => void;
}) {
  const shown = status ?? row?.status;
  const [editing, setEditing] = useState(false);
  const id = row?.production_id;
  useEffect(() => setEditing(!!startEditing), [id, startEditing]);
  // Leaving the form unmounts the focused control; keep focus inside the drawer so Esc and Tab still work there.
  const bodyRef = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);
  const leaveEdit = () => {
    refocus.current = true;
    setEditing(false);
  };
  // Focus once the record body is back in the DOM; a frame callback can run before React commits it.
  useEffect(() => {
    if (editing || !refocus.current) return;
    refocus.current = false;
    bodyRef.current?.focus();
  }, [editing]);
  return (
    <Drawer
      open={row !== null}
      // Esc or the backdrop while editing leaves the form, not the record, so edits aren't dropped silently.
      onClose={editing ? leaveEdit : onClose}
      size="md"
      title={`${editing ? "Edit · " : ""}${row?.product?.name ?? "Production record"}`}
      subtitle={row ? `${row.site?.name ?? "—"} · ${periodText(row.start_date, row.end_date)}` : undefined}
      headerActions={shown ? <StatusPill status={shown} /> : undefined}
      footer={
        row && !editing ? (
          <>
            <Button onClick={() => setEditing(true)}>Edit</Button>
            {shown === "pending" && (
              <>
                <Button variant="danger" onClick={() => onReject(row)}>
                  Reject
                </Button>
                <Button variant="primary" onClick={() => onApprove(row)}>
                  Approve
                </Button>
              </>
            )}
          </>
        ) : undefined
      }
    >
      {row &&
        (editing ? (
          <EditForm
            row={row}
            onCancel={leaveEdit}
            onDone={(saved) => {
              leaveEdit();
              onEdited(saved);
            }}
          />
        ) : (
          <div ref={bodyRef} tabIndex={-1} className="focus:outline-none">
            <Body row={row} status={shown ?? row.status} overlaps={overlaps} />
          </div>
        ))}
    </Drawer>
  );
}

function Body({ row, status, overlaps }: { row: ProductionRow; status: ProductionDataStatus; overlaps: string[] | undefined }) {
  return (
    <div className="space-y-6">
      <div>
        <p className="font-num text-3xl font-semibold tabular-nums" data-testid="drawer-quantity">
          {formatNumber(Number(row.quantity), 2)} <span className="text-base font-normal text-muted">{row.unit}</span>
        </p>
        <p className="mt-1 text-sm text-muted">
          Submitted by {row.created_by?.name ?? "—"} on {formatDate(row.created_at)}
          {row.reviewed_by && row.status !== "pending" && ` · reviewed by ${row.reviewed_by.name}`}
        </p>
        {row.status === "rejected" && row.review_comment && (
          <p className="mt-2 rounded-control bg-bad-soft px-3 py-2 text-sm text-bad">Rejected: {row.review_comment}</p>
        )}
        {overlaps && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            <OverlapChip ranges={overlaps} />
            <span>Another record of this product on this site covers {overlaps.join(", ")}. Check it isn't counted twice.</span>
          </div>
        )}
      </div>

      <Section title="Values">
        <dl>
          <Row label="Product">{row.product?.name ?? "—"}</Row>
          <Row label="Site">{row.site?.name ?? "—"}</Row>
          <Row label="Quantity">
            <span className="font-num tabular-nums">{formatNumber(Number(row.quantity), 2)}</span> {row.unit}
          </Row>
          <Row label="Period">{periodText(row.start_date, row.end_date)}</Row>
          <Row label="Notes">{row.notes?.trim() ? row.notes : <span className="text-muted">None</span>}</Row>
        </dl>
      </Section>

      <Section title="Intensity impact">
        <Impact row={row} status={status} />
      </Section>

      <Section title="History">
        <EntityAuditTimeline entityType="production_data" entityId={row.production_id} />
      </Section>
    </div>
  );
}

function Impact({ row, status }: { row: ProductionRow; status: ProductionDataStatus }) {
  const base = useImpactBase(row);
  if (base.isPending) return <SkeletonText lines={2} />;
  if (base.isError) return <p className="text-sm text-bad">Couldn't load the site's intensity for this period.</p>;
  const production = base.data.byUnit.find((u) => u.unit?.toLowerCase() === row.unit.toLowerCase())?.totalProduction ?? 0;
  // An approval still in its undo window isn't in the server totals yet: treat it as pending.
  const counted = status === "approved" && row.status === "approved" ? "approved" : status === "rejected" ? "rejected" : "pending";
  const impact = intensityImpact({
    status: counted,
    quantity: Number(row.quantity),
    unit: row.unit,
    start: row.start_date,
    end: row.end_date,
    emissions: base.data.emissions,
    production,
  });
  return (
    <p className="text-sm" data-testid="intensity-impact">
      {impact.text}
    </p>
  );
}

function EditForm({ row, onDone, onCancel }: { row: ProductionRow; onDone: (saved?: Partial<ProductionRow>) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState<EditDraft>(() => ({
    quantity: Number(row.quantity),
    unit: row.unit || row.product?.unit || "",
    start: row.start_date.slice(0, 10),
    end: row.end_date.slice(0, 10),
    notes: row.notes ?? "",
    reason: "",
  }));
  const [tried, setTried] = useState(false);
  const { edit } = useReviewMutations();
  const errors = editErrors(draft);
  const show = (k: keyof EditDraft) => (tried ? errors[k] : undefined);
  const set = (patch: Partial<EditDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const productUnit = row.product?.unit;

  const submit = () => {
    setTried(true);
    if (Object.keys(errors).length > 0) return;
    edit.mutate({ id: row.production_id, draft }, { onSuccess: (data) => onDone(data?.productionData) });
  };

  return (
    <form
      className="space-y-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      {row.status === "approved" && <Callout tone="info">This record is approved. Changes are logged with your reason.</Callout>}
      <UnitInput
        label="Quantity"
        required
        value={{ value: draft.quantity, unit: draft.unit }}
        onChange={(v) => set({ quantity: v.value, unit: v.unit })}
        units={unitChoices(row)}
        expectedUnit={productUnit}
        help={productUnit ? `The product is measured in ${productUnit}.` : undefined}
        error={show("quantity") ?? show("unit")}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <DateField label="Start" required value={draft.start} onChange={(start) => set({ start })} error={show("start")} />
        <DateField label="End" required value={draft.end} min={draft.start || undefined} onChange={(end) => set({ end })} error={show("end")} />
      </div>
      <Textarea label="Notes" value={draft.notes} onChange={(notes) => set({ notes })} rows={2} />
      <Textarea
        label="Reason for the change"
        required
        value={draft.reason}
        onChange={(reason) => set({ reason })}
        rows={2}
        placeholder="Why is this record being changed?"
        error={show("reason")}
      />
      {edit.isError && (
        <p role="alert" className="rounded-control bg-bad-soft px-3 py-2 text-sm text-bad">
          {errorMessage(edit.error, "Couldn't save the changes. Nothing was changed.")}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onCancel} disabled={edit.isPending}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={edit.isPending}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
