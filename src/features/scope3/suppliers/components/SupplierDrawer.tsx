import { useState } from "react";
import { Link } from "react-router-dom";
import { FileCheck, Pencil } from "lucide-react";
import { useAuth } from "../../../../context/AuthContext";
import type { AllocationKey, SupplierBoundary, SupplierDetail } from "../../../../services/scope3SuppliersService";
import { Badge, Button, Callout, Drawer, NumberField, SegmentedControl, Select, TextField, cn, focusRing, formatNumber, panel, useToast } from "../../../../ui";
import { errorMessage, isBoundaryRefusal, useAddFigure, useSaveFacility, useSupplier } from "../api";
import {
  ALLOCATION_LABEL,
  BOUNDARY_LABEL,
  type FacilityDraft,
  type FigureDraft,
  REQUEST_STATUS_LABEL,
  SOURCE_LABEL,
  emptyFacility,
  emptyFigure,
  facilityBody,
  facilityErrors,
  figureBody,
  figureErrors,
  requestDataLink,
} from "../logic";
import { SupplierFormDrawer } from "./SupplierFormDrawer";

const fmt = (n: number) => formatNumber(n, n % 1 ? Math.min(6, String(n).split(".")[1]?.length ?? 2) : 0);
const BOUNDARY_OPTIONS = (Object.keys(BOUNDARY_LABEL) as SupplierBoundary[]).map((b) => ({ value: b, label: BOUNDARY_LABEL[b] }));
const ALLOCATION_OPTIONS = (Object.keys(ALLOCATION_LABEL) as AllocationKey[]).map((k) => ({ value: k, label: ALLOCATION_LABEL[k] }));

type Props = { companyId: number | null; supplierId: number; year: number; onClose: () => void };

/** One supplier: its figures, facility data and requests, and adding to them (Manager and above). */
export function SupplierDrawer({ companyId, supplierId, year, onClose }: Props) {
  const detail = useSupplier(companyId, supplierId);
  const [editing, setEditing] = useState(false);
  const d = detail.data;

  if (editing && d)
    return <SupplierFormDrawer companyId={companyId} supplier={d.supplier} onClose={() => setEditing(false)} onSaved={() => setEditing(false)} />;

  return (
    <Drawer
      open
      onClose={onClose}
      size="md"
      title={d?.supplier.name ?? "Supplier"}
      subtitle={d ? [d.supplier.country, d.supplier.email].filter(Boolean).join(" · ") || "No country or email yet" : undefined}
      loading={detail.isLoading}
      error={detail.isError ? errorMessage(detail.error, "Couldn't load this supplier.") : null}
      onRetry={() => detail.refetch()}
      headerActions={
        d?.can_edit ? (
          <Button variant="ghost" size="sm" icon={<Pencil className="size-4" aria-hidden />} onClick={() => setEditing(true)}>
            Edit
          </Button>
        ) : undefined
      }
    >
      {d && (
        <div className="space-y-6">
          <Figures detail={d} companyId={companyId} supplierId={supplierId} year={year} />
          <Facility detail={d} companyId={companyId} supplierId={supplierId} year={year} />
          <Requests detail={d} />
        </div>
      )}
    </Drawer>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3" aria-label={title}>
      <header>
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {description && <p className="text-xs text-muted">{description}</p>}
      </header>
      {children}
    </section>
  );
}

function Figures({ detail, companyId, supplierId, year }: { detail: SupplierDetail; companyId: number | null; supplierId: number; year: number }) {
  const { toast } = useToast();
  const add = useAddFigure(companyId, supplierId);
  const [draft, setDraft] = useState<FigureDraft>(() => emptyFigure(year));
  const [tried, setTried] = useState(false);
  const [open, setOpen] = useState(false);
  const errors = figureErrors(draft);
  const shown = tried ? errors : {};
  const set = (patch: Partial<FigureDraft>) => setDraft((x) => ({ ...x, ...patch }));
  const refusedBoundary = add.isError && isBoundaryRefusal(add.error);

  const submit = (confirm: boolean) => {
    setTried(true);
    if (Object.keys(errors).length) return;
    add.mutate(figureBody(draft, confirm), {
      onSuccess: (f) => {
        toast({ title: `Figure for ${f.item} added`, tone: "good" });
        setDraft(emptyFigure(year));
        setTried(false);
        setOpen(false);
        add.reset();
      },
    });
  };

  return (
    <Section title="Supplier figures" description="Cradle-to-gate kgCO₂e per unit. A Category 1 or 2 entry with “Supplier's own figure” uses the newest one up to its year.">
      {detail.factors.length === 0 ? (
        <Callout tone="info">No figure from this supplier yet. Request one, or add one it has given you.</Callout>
      ) : (
        <ul className={cn(panel, "divide-y divide-line")} aria-label="Figures">
          {detail.factors.map((f) => (
            <li key={f.id} className="flex flex-wrap items-start justify-between gap-2 p-3 text-sm">
              <div className="min-w-0">
                <p className="font-medium text-ink">{f.item}</p>
                <p className="text-xs text-muted">
                  {SOURCE_LABEL[f.source]} · {f.reference_year}
                  {f.gwp_set ? ` · ${f.gwp_set}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-num tabular-nums text-ink">
                  {fmt(f.kgco2e_per_unit)} kgCO₂e/{f.unit}
                </span>
                {f.boundary !== "cradle_to_gate" && <Badge tone="warn">{BOUNDARY_LABEL[f.boundary]}</Badge>}
                {f.has_evidence ? (
                  <Badge tone="good">
                    <FileCheck className="mr-1 inline size-3.5" aria-hidden />
                    Evidence
                  </Badge>
                ) : (
                  <Badge tone="neutral">No evidence</Badge>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {detail.can_edit &&
        (open ? (
          <form
            className={cn(panel, "space-y-3 p-3")}
            aria-label="Add a figure"
            onSubmit={(e) => {
              e.preventDefault();
              submit(false);
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label="Item" value={draft.item} onChange={(v) => set({ item: v })} required error={shown.item} placeholder="e.g. P1020 ingot" maxLength={200} />
              <TextField label="Unit" value={draft.unit} onChange={(v) => set({ unit: v })} required error={shown.unit} maxLength={20} />
              <NumberField label="kgCO₂e per unit" value={draft.kgco2e_per_unit} onChange={(v) => set({ kgco2e_per_unit: v })} min={0} required error={shown.kgco2e_per_unit} />
              <NumberField label="Year" value={draft.reference_year} onChange={(v) => set({ reference_year: v })} min={1990} max={2100} step={1} required error={shown.reference_year} />
              <Select<SupplierBoundary> label="Boundary" value={draft.boundary} options={BOUNDARY_OPTIONS} onChange={(v) => v && set({ boundary: v })} />
            </div>
            {refusedBoundary ? (
              <Callout tone="warn" title="This figure isn't cradle-to-gate">
                <p>A Category 1 figure should cover the goods up to the supplier's gate. Add it anyway only if you have checked it is comparable.</p>
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={() => submit(true)} loading={add.isPending}>
                    Add anyway
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => add.reset()}>
                    Change it
                  </Button>
                </div>
              </Callout>
            ) : (
              add.isError && (
                <p role="alert" className="text-sm text-bad">
                  {errorMessage(add.error, "The figure wasn't added. Try again.")}
                </p>
              )
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={add.isPending}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={add.isPending && !refusedBoundary} disabled={refusedBoundary}>
                Add figure
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            Add a figure
          </Button>
        ))}
    </Section>
  );
}

function Facility({ detail, companyId, supplierId, year }: { detail: SupplierDetail; companyId: number | null; supplierId: number; year: number }) {
  const { toast } = useToast();
  const save = useSaveFacility(companyId, supplierId);
  const [draft, setDraft] = useState<FacilityDraft>(() => emptyFacility(year));
  const [tried, setTried] = useState(false);
  const [open, setOpen] = useState(false);
  const errors = facilityErrors(draft);
  const shown = tried ? errors : {};
  const set = (patch: Partial<FacilityDraft>) => setDraft((x) => ({ ...x, ...patch }));

  const submit = () => {
    setTried(true);
    if (Object.keys(errors).length) return;
    save.mutate(facilityBody(draft), {
      onSuccess: (f) => {
        toast({ title: f.replaced ? `${f.year} facility data replaced` : `${f.year} facility data added`, tone: "good" });
        setTried(false);
        setOpen(false);
      },
    });
  };

  return (
    <Section title="Facility data" description="For “Supplier's energy and materials”: the facility's Scope 1 and 2 and what it made, so your share can be allocated.">
      {detail.facility_data.length === 0 ? (
        <p className="text-sm text-muted">No facility data yet.</p>
      ) : (
        <ul className={cn(panel, "divide-y divide-line")} aria-label="Facility data">
          {detail.facility_data.map((f) => (
            <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <span className="font-medium text-ink">{f.year}</span>
              <span className="font-num tabular-nums text-ink">
                {fmt(f.scope12_tco2e)} tCO₂e · {fmt(f.output_qty)} {f.output_unit}
              </span>
              <Badge tone="neutral">{ALLOCATION_LABEL[f.allocation_key]}</Badge>
            </li>
          ))}
        </ul>
      )}
      {detail.can_edit &&
        (open ? (
          <form
            className={cn(panel, "space-y-3 p-3")}
            aria-label="Add facility data"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <SegmentedControl<AllocationKey> label="Allocation" options={ALLOCATION_OPTIONS} value={draft.allocation_key} onChange={(k) => set({ allocation_key: k, output_unit: k === "economic" ? "USD" : "kg" })} size="sm" />
            <div className="grid gap-3 sm:grid-cols-2">
              <NumberField label="Year" value={draft.year} onChange={(v) => set({ year: v })} min={1990} max={2100} step={1} required error={shown.year} />
              <NumberField label="Scope 1 and 2" unit="tCO₂e" value={draft.scope12_tco2e} onChange={(v) => set({ scope12_tco2e: v })} min={0} required error={shown.scope12_tco2e} />
              <NumberField label={draft.allocation_key === "economic" ? "Revenue" : "Output"} value={draft.output_qty} onChange={(v) => set({ output_qty: v })} min={0} required error={shown.output_qty} />
              <TextField label={draft.allocation_key === "economic" ? "Currency" : "Output unit"} value={draft.output_unit} onChange={(v) => set({ output_unit: v })} required error={shown.output_unit} maxLength={20} />
            </div>
            <p className="text-xs text-muted">Sending a year again replaces its figures; the old ones stay in the audit log.</p>
            {save.isError && (
              <p role="alert" className="text-sm text-bad">
                {errorMessage(save.error, "The facility data wasn't saved. Try again.")}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)} disabled={save.isPending}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={save.isPending}>
                Save facility data
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
            Add facility data
          </Button>
        ))}
    </Section>
  );
}

function Requests({ detail }: { detail: SupplierDetail }) {
  const { role } = useAuth();
  // Supplier requests belong to a product footprint (C06), which only Managers open.
  const canRequest = role === "Manager";
  return (
    <Section title="Requests" description="Supplier requests sent for product footprints. An accepted answer becomes a figure here.">
      {detail.requests.length === 0 ? (
        <p className="text-sm text-muted">No requests yet.</p>
      ) : (
        <ul className="space-y-1 text-sm" aria-label="Requests">
          {detail.requests.map((r) => (
            <li key={r.supplier_request_id} className="flex flex-wrap justify-between gap-2">
              <span className="text-ink">{r.material}</span>
              <span className="text-muted">{REQUEST_STATUS_LABEL[r.status] ?? r.status}</span>
            </li>
          ))}
        </ul>
      )}
      {canRequest && (
        <Link
          to={requestDataLink(detail.supplier)}
          className={cn(focusRing, "inline-flex rounded-control text-sm font-medium text-brand underline-offset-2 hover:underline")}
        >
          Request data
        </Link>
      )}
    </Section>
  );
}
