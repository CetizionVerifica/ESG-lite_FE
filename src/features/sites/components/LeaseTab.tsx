import { useState } from "react";
import {
  LEASE_ROLE_LABEL,
  LEASE_ROLE_OPTIONS,
  LEASE_TYPES,
  LEASE_TYPE_LABEL,
  type LeaseRole,
  type LeaseType,
  leaseBoundaryNote,
  needsLeaseType,
} from "../../../lib/scope3/assets";
import { CONSOLIDATION_LABEL } from "../../../lib/scope3/boundary";
import type { LeaseSite } from "../../../services/scope3AssetsService";
import { Button, Callout, EmptyState, NumberField, Select, SkeletonText, useToast } from "../../../ui";
import { errorMessage, useLeaseSites, useSaveSiteLease } from "../api";

type RoleChoice = LeaseRole | "none";
type LeaseDraft = { role: RoleChoice; type: LeaseType | null; floor: number | null };

const TYPE_OPTIONS = LEASE_TYPES.map((t) => ({ value: t, label: LEASE_TYPE_LABEL[t] }));

const draftOf = (s: LeaseSite | undefined): LeaseDraft => ({ role: s?.lease_role ?? "none", type: s?.lease_type ?? null, floor: s?.floor_area_m2 ?? null });

const sameDraft = (a: LeaseDraft, b: LeaseDraft) => a.role === b.role && a.type === b.type && a.floor === b.floor;

/**
 * S3-11 Lease section of a site: whether the company leases it, leases it out
 * or runs it as a franchise, the lease type and floor area, and a live note
 * on where the site's energy belongs under the client's consolidation
 * approach. Saved on its own (not with the site's details).
 */
export function LeaseTab({ siteId, companyId }: { siteId: number; companyId: number | null }) {
  const sites = useLeaseSites(companyId);
  const save = useSaveSiteLease(companyId);
  const { toast } = useToast();
  const saved = sites.data?.sites.find((s) => s.site_id === siteId);
  const [edit, setEdit] = useState<LeaseDraft | null>(null);
  const draft = edit ?? draftOf(saved);
  const set = (patch: Partial<LeaseDraft>) => setEdit({ ...draft, ...patch });

  if (companyId === null) return <EmptyState compact title="Choose the site's client first." />;
  if (sites.isLoading) return <SkeletonText lines={4} />;
  if (sites.isError || !sites.data)
    return (
      <EmptyState
        compact
        variant="error"
        title="Couldn't load the lease details."
        description={errorMessage(sites.error, "Try again.")}
        action={<Button onClick={() => sites.refetch()}>Try again</Button>}
      />
    );
  if (!saved) return <EmptyState compact title="This site isn't in the client's list yet." />;

  const approach = sites.data.consolidation_approach;
  const role = draft.role === "none" ? null : draft.role;
  const roleOptions = saved.lease_role === "franchisee" ? [...LEASE_ROLE_OPTIONS, { value: "franchisee" as const, label: LEASE_ROLE_LABEL.franchisee }] : LEASE_ROLE_OPTIONS;
  const note = leaseBoundaryNote(role, draft.type, approach);
  const dirty = !sameDraft(draft, draftOf(saved));

  const onSave = () =>
    save.mutate(
      {
        siteId,
        body: { lease_role: role, lease_type: needsLeaseType(role) ? draft.type : null, floor_area_m2: draft.floor },
      },
      {
        onSuccess: () => {
          setEdit(null);
          toast({ title: "Lease details saved", tone: "good" });
        },
      },
    );

  return (
    <div className="space-y-4">
      <Select<RoleChoice> label="Lease" value={draft.role} options={roleOptions} onChange={(v) => v && set({ role: v, type: needsLeaseType(v === "none" ? null : v) ? draft.type : null })} />
      {needsLeaseType(role) && (
        <Select<LeaseType> label="Lease type" value={draft.type} options={TYPE_OPTIONS} onChange={(v) => set({ type: v })} placeholder="Choose the lease type" />
      )}
      <NumberField label="Floor area" unit="m²" value={draft.floor} onChange={(v) => set({ floor: v })} min={0} help="Used for floor-area methods in Categories 8 and 13." />
      {note && (
        <Callout tone="info" title={`Consolidation approach: ${CONSOLIDATION_LABEL[approach].toLowerCase()}`}>
          <span data-testid="lease-note">{note}</span>
        </Callout>
      )}
      {save.isError && (
        <p role="alert" className="text-sm text-bad">
          {errorMessage(save.error, "The lease details weren't saved. Try again.")}
        </p>
      )}
      {sites.data.can_edit && (
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setEdit(null)} disabled={!dirty || save.isPending}>
            Discard
          </Button>
          <Button variant="primary" onClick={onSave} loading={save.isPending} disabled={!dirty}>
            Save lease
          </Button>
        </div>
      )}
    </div>
  );
}
