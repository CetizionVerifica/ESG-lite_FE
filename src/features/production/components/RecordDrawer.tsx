import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Product } from "../../../services/productService";
import {
  Button,
  Callout,
  DateField,
  Drawer,
  EntityAuditTimeline,
  MonthPicker,
  OverlapChip,
  SegmentedControl,
  Select,
  StatusPill,
  Textarea,
  UnitInput,
  formatDate,
  formatNumber,
  overlapsFor,
  shortRange,
} from "../../../ui";
import { errorMessage, useProductionMutations } from "../api";
import {
  type Draft,
  type ProductionRow,
  type SiteOption,
  canChange,
  createPayload,
  draftErrors,
  draftFromRow,
  draftRange,
  periodText,
  unitChoices,
  updatePayload,
} from "../logic";

export type DrawerState =
  | { mode: "view"; row: ProductionRow }
  | { mode: "edit"; row: ProductionRow }
  | { mode: "add"; draft: Draft };

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

/** Record detail with history, and the add / edit form, in one drawer. */
export function RecordDrawer({
  state,
  rows,
  products,
  sites,
  overlaps,
  onChange,
  onClose,
  onDelete,
  onSaved,
}: {
  state: DrawerState | null;
  /** Every loaded record, for the overlap warning. */
  rows: ProductionRow[];
  products: Product[];
  sites: SiteOption[];
  overlaps: Map<number, string[]>;
  onChange: (next: DrawerState) => void;
  onClose: () => void;
  onDelete: (row: ProductionRow) => void;
  onSaved: (kind: "added" | "saved" | "resubmitted") => void;
}) {
  // Keep the last content while the drawer slides out.
  const [shown, setShown] = useState(state);
  useEffect(() => {
    if (state) setShown(state);
  }, [state]);
  const s = state ?? shown;
  const row = s && s.mode !== "add" ? (rows.find((r) => r.production_id === s.row.production_id) ?? s.row) : null;

  const editing = s?.mode === "edit";
  // Leaving the form unmounts the focused control; keep focus inside the drawer so Esc and Tab still work.
  const bodyRef = useRef<HTMLDivElement>(null);
  const refocus = useRef(false);
  const backToView = () => {
    refocus.current = true;
    if (row) onChange({ mode: "view", row });
  };
  // Focus once the record body is back in the DOM (a frame callback can run before React commits it).
  useEffect(() => {
    if (editing || !refocus.current) return;
    refocus.current = false;
    bodyRef.current?.focus();
  }, [editing]);

  const title = !s ? "" : s.mode === "add" ? "Add production" : `${editing ? (row?.status === "rejected" ? "Fix · " : "Edit · ") : ""}${row?.product?.name ?? "Production record"}`;

  return (
    <Drawer
      open={state !== null}
      // Esc while editing goes back to the record, so edits aren't dropped with the drawer.
      onClose={editing ? backToView : onClose}
      size="md"
      title={title}
      subtitle={row ? `${sites.length > 1 ? `${row.site?.name ?? "—"} · ` : ""}${periodText(row.start_date, row.end_date)}` : undefined}
      headerActions={row ? <StatusPill status={row.status} /> : undefined}
      footer={
        row && s?.mode === "view" && canChange(row) ? (
          <>
            <Button variant="danger" onClick={() => onDelete(row)}>
              Delete
            </Button>
            <Button variant="primary" onClick={() => onChange({ mode: "edit", row })}>
              {row.status === "rejected" ? "Fix and resubmit" : "Edit"}
            </Button>
          </>
        ) : undefined
      }
    >
      {s?.mode === "add" && (
        <EntryForm
          key="add"
          initial={s.draft}
          products={products}
          sites={sites}
          rows={rows}
          onCancel={onClose}
          onDone={() => {
            onSaved("added");
            onClose();
          }}
        />
      )}
      {s?.mode === "edit" && row && (
        <EntryForm
          key={`edit-${row.production_id}`}
          row={row}
          initial={draftFromRow(row)}
          products={products}
          sites={sites}
          rows={rows}
          onCancel={backToView}
          onDone={(resubmitted) => {
            onSaved(resubmitted ? "resubmitted" : "saved");
            backToView();
          }}
        />
      )}
      {s?.mode === "view" && row && (
        <div ref={bodyRef} tabIndex={-1} className="focus:outline-none">
          <Body row={row} overlaps={overlaps.get(row.production_id)} />
        </div>
      )}
    </Drawer>
  );
}

function Body({ row, overlaps }: { row: ProductionRow; overlaps: string[] | undefined }) {
  return (
    <div className="space-y-6">
      <div>
        <p className="font-num text-3xl font-semibold tabular-nums" data-testid="drawer-quantity">
          {formatNumber(Number(row.quantity), 2)} <span className="text-base font-normal text-muted">{row.unit}</span>
        </p>
        <p className="mt-1 text-sm text-muted">Logged on {formatDate(row.created_at)}</p>
        {row.status === "rejected" && (
          <Callout tone="warn" title="Sent back by your manager" className="mt-3">
            {row.review_comment?.trim() ? row.review_comment : "No reason was given."} Fix the record and resubmit it.
          </Callout>
        )}
        {row.status === "approved" && <p className="mt-2 text-sm text-muted">Approved records can't be changed. Ask your manager if this one is wrong.</p>}
        {overlaps && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            <OverlapChip ranges={overlaps} />
            <span>Another record of this product covers {overlaps.join(", ")}. Check it isn't counted twice.</span>
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

      <Section title="History">
        <EntityAuditTimeline entityType="production_data" entityId={row.production_id} />
      </Section>
    </div>
  );
}

const MODES = [
  { value: "month" as const, label: "Month" },
  { value: "range" as const, label: "Custom range" },
];

function EntryForm({
  row,
  initial,
  products,
  sites,
  rows,
  onCancel,
  onDone,
}: {
  /** The record being edited; none when adding. */
  row?: ProductionRow;
  initial: Draft;
  products: Product[];
  sites: SiteOption[];
  rows: ProductionRow[];
  onCancel: () => void;
  onDone: (resubmitted: boolean) => void;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const [tried, setTried] = useState(false);
  const { create, update } = useProductionMutations();
  const saving = create.isPending || update.isPending;
  const failure = create.error ?? update.error;
  const errors = draftErrors(draft);
  const show = (k: keyof typeof errors) => (tried ? errors[k] : undefined);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const siteProducts = products.filter((p) => p.site?.site_id === draft.siteId);
  const product = siteProducts.find((p) => p.product_id === draft.productId) ?? (row?.product as Product | undefined);
  const range = draftRange(draft);
  const clashes = range ? overlapsFor(rows, { siteId: draft.siteId, productId: draft.productId, start: range.start, end: range.end, exceptId: row?.production_id }) : [];
  const resubmit = row?.status === "rejected";

  const submit = () => {
    setTried(true);
    if (Object.keys(errors).length > 0) return;
    if (row) update.mutate({ id: row.production_id, body: updatePayload(draft) }, { onSuccess: () => onDone(resubmit) });
    else create.mutate(createPayload(draft), { onSuccess: () => onDone(false) });
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
      {resubmit && (
        <Callout tone="warn" title="Sent back by your manager">
          {row?.review_comment?.trim() ? row.review_comment : "No reason was given."} Saving resubmits it for approval.
        </Callout>
      )}
      {!row && sites.length > 1 && (
        <Select<number>
          label="Site"
          required
          value={draft.siteId}
          onChange={(siteId) => set({ siteId, productId: null, unit: "" })}
          options={sites.map((s) => ({ value: s.site_id, label: s.name }))}
          placeholder="Choose a site"
          error={show("site")}
        />
      )}
      {row ? (
        <dl>
          <Row label="Product">{row.product?.name ?? "—"}</Row>
        </dl>
      ) : (
        <Select<number>
          label="Product"
          required
          value={draft.productId}
          onChange={(productId) => {
            const p = siteProducts.find((x) => x.product_id === productId);
            set({ productId, unit: p?.unit ?? "" });
          }}
          options={siteProducts.map((p) => ({ value: p.product_id, label: `${p.name} (${p.unit})` }))}
          placeholder="Choose a product"
          emptyText={draft.siteId ? "No products on this site" : "Choose a site first"}
          error={show("product")}
        />
      )}
      <UnitInput
        label="Quantity"
        required
        value={{ value: draft.quantity, unit: draft.unit }}
        onChange={(v) => set({ quantity: v.value, unit: v.unit })}
        units={unitChoices(product?.unit, draft.unit)}
        expectedUnit={product?.unit}
        help={product?.unit ? `${product.name} is measured in ${product.unit}.` : undefined}
        error={show("quantity") ?? show("unit")}
      />
      <div className="space-y-3">
        <SegmentedControl label="Period" size="sm" options={MODES} value={draft.mode} onChange={(mode) => set({ mode })} />
        {draft.mode === "month" ? (
          <MonthPicker label="Month" required value={draft.month} onChange={(month) => set({ month })} error={show("month")} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <DateField label="Start" required value={draft.start} onChange={(start) => set({ start })} error={show("start")} />
            <DateField label="End" required value={draft.end} min={draft.start || undefined} onChange={(end) => set({ end })} error={show("end")} />
          </div>
        )}
      </div>
      {clashes.length > 0 && (
        <Callout tone="warn" title="This period overlaps another record">
          {product?.name ?? "This product"} already has {clashes.map((c) => `${shortRange(c.start_date, c.end_date)} (${c.status})`).join(", ")}. Check it isn't counted twice; you can still save.
        </Callout>
      )}
      <Textarea label="Notes" value={draft.notes} onChange={(notes) => set({ notes })} rows={2} />
      {failure && (
        <p role="alert" className="rounded-control bg-bad-soft px-3 py-2 text-sm text-bad">
          {errorMessage(failure, row ? "Couldn't save the changes. Nothing was changed." : "Couldn't add the production record. Nothing was saved.")}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={saving}>
          {row ? (resubmit ? "Resubmit" : "Save changes") : "Add production"}
        </Button>
      </div>
    </form>
  );
}
