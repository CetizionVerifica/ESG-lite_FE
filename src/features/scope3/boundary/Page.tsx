import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom"; // S3-12
import { useAuth } from "../../../context/AuthContext";
import { useClientContext } from "../../../lib/clientContext";
import { CONSOLIDATION_APPROACHES, CONSOLIDATION_LABEL, type ConsolidationApproach } from "../../../lib/scope3/boundary";
import { Button, Callout, EmptyState, PageHeader, Select, SkeletonTableRows, cn, panel, useToast } from "../../../ui";
import { errorMessage, useBoundary, useCategoryMap, useConfirmMap, useSaveBoundary, useSaveConsolidation } from "./api";
import { BoundaryTable } from "./components/BoundaryTable";
import { UnmappedPanel } from "./components/UnmappedPanel";
import { type RowDraft, countStatuses, draftFrom, isRowDirty, rowError, summaryLine } from "./logic";
import { LEASE_ROLE_LABEL } from "../../../lib/scope3/assets"; // S3-11
import { categoryLabel } from "../../../lib/scope3/contracts"; // S3-11
import { BaseYearSection } from "../baseYear/BaseYearSection"; // S3-14

const APPROACH_OPTIONS = CONSOLIDATION_APPROACHES.map((a) => ({ value: a, label: CONSOLIDATION_LABEL[a] }));

/**
 * S3-1 `/settings/scope3`: the client's Scope 3 boundary. All 15 GHG Protocol
 * categories as Included, Excluded, Not relevant or Screening with the
 * reason, the consolidation approach, and the categories still Unmapped.
 * Admin and Superadmin edit; Managers read.
 */
export default function Scope3BoundaryPage() {
  const { role } = useAuth();
  const isStaff = role === "Superadmin";
  const { clientId } = useClientContext();
  const companyId = isStaff ? clientId : null;
  const ready = !isStaff || clientId !== null;

  const { toast } = useToast();
  const navigate = useNavigate(); // S3-12
  const boundary = useBoundary(companyId, ready);
  const map = useCategoryMap(companyId, ready);
  const save = useSaveBoundary(companyId);
  const saveApproach = useSaveConsolidation(companyId);
  const confirm = useConfirmMap(companyId);
  // S3-11 (D10): confirming a default saves the row as it is, with the person's name.
  const confirmDefault = useSaveBoundary(companyId);
  const [confirmingN, setConfirmingN] = useState<number | null>(null);

  // Edits per category number; a row missing here shows its saved values.
  const [edits, setEdits] = useState<Record<number, RowDraft>>({});
  const [triedSave, setTriedSave] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [confirmErr, setConfirmErr] = useState<string | null>(null);

  // Unsaved edits belong to one client: drop them when a Superadmin switches.
  const [editsFor, setEditsFor] = useState(companyId);
  if (editsFor !== companyId) {
    setEditsFor(companyId);
    setEdits({});
    setTriedSave(false);
    setSaveErr(null);
    setConfirmErr(null);
  }

  const categories = useMemo(() => boundary.data?.categories ?? [], [boundary.data]);
  const drafts = useMemo(() => {
    const out: Record<number, RowDraft> = {};
    for (const c of categories) out[c.n] = edits[c.n] ?? draftFrom(c);
    return out;
  }, [categories, edits]);
  const dirty = categories.filter((c) => isRowDirty(drafts[c.n], c));
  const invalid = dirty.filter((c) => rowError(drafts[c.n]));
  const editable = !!boundary.data?.can_edit;
  const counts = countStatuses(categories.map((c) => drafts[c.n].status));

  const onChange = (n: number, patch: Partial<RowDraft>) => {
    setSaveErr(null);
    setEdits((e) => ({ ...e, [n]: { ...drafts[n], ...patch } }));
  };
  const discard = () => {
    setEdits({});
    setTriedSave(false);
    setSaveErr(null);
  };
  const onSave = () => {
    setTriedSave(true);
    if (invalid.length || !dirty.length) return;
    save.mutate(
      dirty.map((c) => ({ n: c.n, draft: drafts[c.n] })),
      {
        onSuccess: () => {
          toast({ title: `Scope 3 boundary saved (${dirty.length} ${dirty.length === 1 ? "category" : "categories"})`, tone: "good" });
          discard();
        },
        onError: (e) => setSaveErr(errorMessage(e, "Some changes weren't saved. Try again.")),
      },
    );
  };

  const onApproach = (value: ConsolidationApproach | null) => {
    if (!value || !boundary.data || value === boundary.data.consolidation_approach) return;
    saveApproach.mutate(
      { id: boundary.data.company_id, value },
      {
        onSuccess: () => toast({ title: `Consolidation approach set to ${CONSOLIDATION_LABEL[value].toLowerCase()}`, tone: "good" }),
        onError: (e) => toast({ title: errorMessage(e, "The consolidation approach wasn't saved."), tone: "bad" }),
      },
    );
  };

  const onConfirm = (items: { category_id: number; ghg_category: number }[], onDone?: () => void) => {
    setConfirmErr(null);
    confirm.mutate(items, {
      onSuccess: () => {
        toast({ title: `${items.length} ${items.length === 1 ? "category" : "categories"} confirmed`, tone: "good" });
        onDone?.();
      },
      onError: (e) => setConfirmErr(errorMessage(e, "Try again.")),
    });
  };

  const onConfirmDefault = (n: number) => {
    const c = categories.find((x) => x.n === n);
    if (!c) return;
    setConfirmingN(n);
    confirmDefault.mutate([{ n, draft: draftFrom(c) }], {
      onSuccess: () => toast({ title: `${categoryLabel(c.n)} confirmed as not relevant`, tone: "good" }),
      onError: (e) => toast({ title: errorMessage(e, "The category wasn't confirmed. Try again."), tone: "bad" }),
      onSettled: () => setConfirmingN(null),
    });
  };
  const leaseSites = boundary.data?.lease_sites ?? [];

  const header = (
    <PageHeader
      title="Scope 3 boundary"
      description="Every GHG Protocol Scope 3 category is included, excluded or not relevant, with the reason. Reports list exclusions with these reasons."
      secondaryActions={[{ label: "Screening", onClick: () => navigate("/settings/scope3/screening") }]} // S3-12
    />
  );

  if (!ready)
    return (
      <div className="space-y-6">
        {header}
        <Callout tone="warn" title="Pick a client first">
          Choose a client with the switcher at the top; the boundary is set per client.
        </Callout>
      </div>
    );

  if (boundary.isError)
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          variant="error"
          title="Couldn't load the Scope 3 boundary."
          description={errorMessage(boundary.error, "Check your connection and try again.")}
          action={<Button onClick={() => boundary.refetch()}>Try again</Button>}
        />
      </div>
    );

  return (
    <div className="space-y-6 pb-20">
      {header}

      <section className={cn(panel, "flex flex-wrap items-end justify-between gap-4 p-4")} aria-label="Boundary settings">
        <div className="w-full max-w-xs">
          {boundary.data ? (
            <Select<ConsolidationApproach>
              label="Consolidation approach"
              help="Decides what counts in Categories 8, 13, 14 and 15."
              value={boundary.data.consolidation_approach}
              options={APPROACH_OPTIONS}
              onChange={onApproach}
              disabled={!editable || saveApproach.isPending}
              loading={saveApproach.isPending}
            />
          ) : (
            <SkeletonTableRows rows={1} columns={1} />
          )}
        </div>
        <p className="text-sm text-muted" aria-live="polite" data-testid="boundary-summary">
          {boundary.data ? summaryLine(counts) : " "}
        </p>
      </section>

      {!editable && boundary.data && (
        <Callout tone="info">You can read the boundary. An Admin or Superadmin changes it.</Callout>
      )}

      {map.isError ? (
        <EmptyState
          compact
          variant="error"
          title="Couldn't load the unmapped categories."
          action={<Button onClick={() => map.refetch()}>Try again</Button>}
        />
      ) : map.data && map.data.unmapped.length > 0 ? (
        <UnmappedPanel
          unmapped={map.data.unmapped}
          canConfirm={!!boundary.data?.can_confirm_map}
          busy={confirm.isPending}
          error={confirmErr}
          onConfirm={onConfirm}
        />
      ) : null}

      {boundary.data ? (
        <BoundaryTable
          categories={categories}
          drafts={drafts}
          editable={editable}
          showErrors={triedSave}
          onChange={onChange}
          onConfirmDefault={onConfirmDefault}
          confirming={confirmingN}
        />
      ) : (
        <div className={panel}>
          <SkeletonTableRows rows={8} columns={5} />
        </div>
      )}

      {/* S3-11: where each leased or franchise site's energy belongs under the approach above. */}
      {leaseSites.length > 0 && (
        <section className={cn(panel, "space-y-2 p-4")} aria-label="Leased and franchise sites" data-testid="lease-sites">
          <h2 className="text-sm font-medium text-ink">Leased and franchise sites</h2>
          <ul className="space-y-1.5 text-sm">
            {leaseSites.map((s) => (
              <li key={s.site_id}>
                <span className="font-medium text-ink">{s.name}</span>
                <span className="text-muted"> · {s.lease_role ? LEASE_ROLE_LABEL[s.lease_role] : ""}</span>
                {s.note && <p className="text-xs text-muted">{s.note}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* S3-14: base year and recalculations (#base-year). */}
      <BaseYearSection companyId={companyId} ready={ready} />

      {editable && dirty.length > 0 && (
        <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-end gap-3 border-t border-line bg-page px-4 py-3">
          {saveErr && (
            <p role="alert" className="mr-auto text-sm text-bad">
              {saveErr}
            </p>
          )}
          {triedSave && invalid.length > 0 && (
            <p role="alert" className="mr-auto text-sm text-bad">
              Add a reason for {invalid.length === 1 ? "1 category" : `${invalid.length} categories`} before saving.
            </p>
          )}
          <span className="text-sm text-muted">
            {dirty.length} unsaved {dirty.length === 1 ? "change" : "changes"}
          </span>
          <Button variant="ghost" onClick={discard} disabled={save.isPending}>
            Discard
          </Button>
          <Button variant="primary" onClick={onSave} loading={save.isPending}>
            Save changes
          </Button>
        </div>
      )}
    </div>
  );
}
