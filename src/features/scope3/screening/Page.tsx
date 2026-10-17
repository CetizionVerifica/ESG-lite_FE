import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useClientContext } from "../../../lib/clientContext";
import type { YearType } from "../../../lib/scope3/contracts";
import { ESTIMATE_NOTE } from "../../../lib/scope3/screening";
import type { ScreeningCategory } from "../../../services/scope3ScreeningService";
import { Button, Callout, EmptyState, KpiStrip, formatEmissions, PageHeader, SegmentedControl, Select, SkeletonTableRows, cn, panel, useToast } from "../../../ui";
import { errorMessage, useScreening, useSetStatus } from "./api";
import { ApplyModal } from "./components/ApplyModal";
import { CategoryDrawer } from "./components/CategoryDrawer";
import { ExtrapolateModal } from "./components/ExtrapolateModal";
import { ScreeningTable } from "./components/ScreeningTable";
import { ofFifteen, toggleTick, yearFrom, yearOptions, yearTypeFrom } from "./logic";

/**
 * S3-12 `/settings/scope3/screening`: a rough size for all 15 categories
 * (recorded rows plus spend or headcount estimates that are never saved),
 * the Table II ticks, a suggested status to apply with an editable reason,
 * and "Extrapolate…" for known gaps. Admin and Superadmin edit; Managers read
 * (and may extrapolate for their own sites).
 */
export default function Scope3ScreeningPage() {
  const { role } = useAuth();
  const isStaff = role === "Superadmin";
  const { clientId } = useClientContext();
  const companyId = isStaff ? clientId : null;
  const ready = !isStaff || clientId !== null;
  const navigate = useNavigate();
  const { toast } = useToast();

  // Year and year type live in the URL so a link opens the same view.
  const [params, setParams] = useSearchParams();
  const year = yearFrom(params.get("year"));
  const yearType = yearTypeFrom(params.get("year_type"));
  const setParam = (key: string, value: string) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.set(key, value);
        return next;
      },
      { replace: true },
    );

  const screening = useScreening(companyId, year, yearType, ready);
  const setStatus = useSetStatus(companyId);
  const data = screening.data;
  // A tick shows at once; the saved relevance replaces it when the fresh screening arrives.
  const [ticks, setTicks] = useState<Record<number, Record<string, boolean>>>({});
  const categories = (data?.categories ?? []).map((c) => (ticks[c.n] ? { ...c, relevance: ticks[c.n] } : c));
  const editable = !!data?.can_edit;

  const [openN, setOpenN] = useState<number | null>(null);
  const [applyN, setApplyN] = useState<number | null>(null);
  const [extrapolateN, setExtrapolateN] = useState<number | null>(null);
  const [savingN, setSavingN] = useState<number | null>(null);
  const byN = (n: number | null) => (n === null ? undefined : categories.find((c) => c.n === n));
  const open = byN(openN);
  const applying = byN(applyN);
  const extrapolating = byN(extrapolateN);

  const onTick = (c: ScreeningCategory, key: string, on: boolean) => {
    const relevance = toggleTick(c.relevance, key, on);
    setSavingN(c.n);
    setTicks((t) => ({ ...t, [c.n]: relevance }));
    setStatus.mutate(
      { n: c.n, status: c.status, reason: c.reason, relevance },
      {
        onError: (e) => toast({ title: errorMessage(e, "The tick wasn't saved. Try again."), tone: "bad" }),
        onSettled: () => {
          setSavingN(null);
          setTicks(({ [c.n]: _done, ...rest }) => rest);
        },
      },
    );
  };

  const header = (
    <PageHeader
      title="Scope 3 screening"
      description="A rough size for every category from what you've recorded and cheap estimates, so you know which to include and refine first."
      secondaryActions={[{ label: "Scope 3 boundary", onClick: () => navigate("/settings/scope3") }]}
    />
  );

  if (!ready)
    return (
      <div className="space-y-6">
        {header}
        <Callout tone="warn" title="Pick a client first">
          Choose a client with the switcher at the top; screening is done per client.
        </Callout>
      </div>
    );

  const totals = data?.totals;
  return (
    <div className="space-y-6">
      {header}

      <section className={cn(panel, "flex flex-wrap items-end gap-4 p-4")} aria-label="Screening year">
        <Select<number>
          className="w-36"
          label="Year"
          value={year}
          options={yearOptions(year).map((y) => ({ value: y, label: String(y) }))}
          onChange={(v) => v && setParam("year", String(v))}
        />
        <SegmentedControl<YearType>
          label="Year type"
          value={yearType}
          options={[
            { value: "CY", label: "Calendar" },
            { value: "FY", label: "Financial (Apr–Mar)" },
          ]}
          onChange={(v) => setParam("year_type", v)}
        />
        <p className="max-w-md text-sm text-muted">Suggestions follow the guidance's screening steps but set no fixed threshold. Nothing changes until you apply it.</p>
      </section>

      <KpiStrip
        loading={screening.isLoading}
        error={screening.isError ? errorMessage(screening.error, "Couldn't load the screening.") : null}
        onRetry={() => screening.refetch()}
        items={[
          {
            label: "Recorded",
            value: totals?.recorded_tco2e,
            format: "emissions",
            primary: true,
            hint: totals && totals.pending_tco2e > 0 ? `Includes ${formatEmissions(totals.pending_tco2e)} pending` : "Approved and pending rows",
          },
          { label: "Estimated", value: totals?.estimate_tco2e, format: "emissions", hint: ESTIMATE_NOTE },
          { label: "Included categories", value: totals?.included, unit: "/ 15", hint: totals ? ofFifteen(totals.included) : undefined },
          { label: "Categories with a reason", value: totals?.with_reason, unit: "/ 15", hint: "Included, or excluded with a reason" },
        ]}
      />

      {data && !editable && (
        <Callout tone="info">You can read the screening. An Admin or Superadmin changes the figures, ticks and statuses.</Callout>
      )}

      {screening.isError ? (
        <EmptyState
          variant="error"
          title="Couldn't load the screening."
          description={errorMessage(screening.error, "Check your connection and try again.")}
          action={<Button onClick={() => screening.refetch()}>Try again</Button>}
        />
      ) : data ? (
        <>
          {totals && totals.recorded_tco2e === 0 && totals.estimate_tco2e === 0 && (
            <Callout tone="info" title={`Nothing recorded or estimated for ${yearType} ${year} yet`}>
              Open a category and add a spend figure to estimate it.
            </Callout>
          )}
          <ScreeningTable categories={categories} editable={editable} savingN={savingN} onTick={onTick} onApply={(c) => setApplyN(c.n)} onOpen={(c) => setOpenN(c.n)} />
        </>
      ) : (
        <div className={panel}>
          <SkeletonTableRows rows={8} columns={7} />
        </div>
      )}

      {open && (
        <CategoryDrawer
          key={`${open.n}-${year}-${yearType}`}
          category={open}
          companyId={companyId}
          year={year}
          yearType={yearType}
          editable={editable}
          canExtrapolate={!!data?.can_extrapolate}
          onClose={() => setOpenN(null)}
          onExtrapolate={() => {
            setExtrapolateN(open.n);
            setOpenN(null);
          }}
          onSaved={(m) => toast({ title: m, tone: "good" })}
        />
      )}
      {applying && (
        <ApplyModal
          key={applying.n}
          category={applying}
          companyId={companyId}
          onClose={() => setApplyN(null)}
          onApplied={(m) => {
            toast({ title: m, tone: "good" });
            setApplyN(null);
          }}
        />
      )}
      {extrapolating && data && (
        <ExtrapolateModal
          key={extrapolating.n}
          category={extrapolating}
          companyId={companyId}
          year={year}
          yearType={yearType}
          sites={data.sites}
          onClose={() => setExtrapolateN(null)}
          onCreated={(m) => {
            toast({ title: m, tone: "good" });
            setExtrapolateN(null);
          }}
        />
      )}
    </div>
  );
}
