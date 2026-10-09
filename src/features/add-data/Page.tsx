import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Button, EmptyState, Loading, Modal, PageHeader, Skeleton, Stepper, useUnsavedGuard } from "../../ui";
import { useEntrySetup, usePeriodTotals, useThreshold } from "./api";
import { useEmissionCalc } from "./hooks/useEmissionCalc";
import { rowHasInput, useEntryRows } from "./hooks/useEntryRows";
import { useRowEvidence } from "./hooks/useRowEvidence";
import { billGroups, billOf } from "./logic/bill";
import { buildPayload, comparison, entryFactorYear, entryPeriodLabel, formatEntryPeriodParam, parseEntryPeriod, previousPeriod, rowIssue, type EntryPeriod } from "./logic/entry";
import { formColumns, toFormModel } from "./logic/form";
import { entryCategories, feraCategoryOf, sitesOf, userIdOf } from "./logic/sites";
import { ChooseContext } from "./steps/ChooseContext";
import { EnterRows } from "./steps/EnterRows";
import { Review } from "./steps/Review";
import type { RowComparison } from "./components/EntryRow";
import { ExistingEntries } from "./components/ExistingEntries";
import { rowFromEntry, savedExcludingEdits } from "./logic/existing";

const STEPS = [
  { id: "context", label: "What are you reporting?" },
  { id: "values", label: "Enter values" },
  { id: "review", label: "Review & submit" },
];

const num = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : null);

/** P03 Add data: choose the context, type the rows, review and send for approval. */
export default function AddDataPage() {
  const { user } = useAuth();
  const sites = useMemo(() => sitesOf(user), [user]);
  const [params, setParams] = useSearchParams();
  const siteId = num(params.get("site")) ?? (sites.length === 1 ? sites[0].site_id : null);
  const categoryId = num(params.get("category"));
  const period = parseEntryPeriod(params.get("period"));
  const site = sites.find((s) => s.site_id === siteId);
  const categories = entryCategories(site);
  const category = categories.find((c) => c.category_id === categoryId) ?? null;
  const contextReady = !!site && !!category && !!period;
  // A deep link with the full context (from My month) starts at step 2.
  const [step, setStep] = useState(contextReady ? 1 : 0);

  const setContext = (patch: { site?: number | null; category?: number | null; period?: EntryPeriod | null }) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        const put = (k: string, v: string | null) => (v === null ? next.delete(k) : next.set(k, v)); // data-loss-reviewed: URL params, not data
        if ("site" in patch) {
          put("site", patch.site == null ? null : String(patch.site));
          put("category", null);
        }
        if ("category" in patch) put("category", patch.category == null ? null : String(patch.category));
        if ("period" in patch) put("period", patch.period ? formatEntryPeriodParam(patch.period) : null);
        return next;
      },
      { replace: true },
    );

  const factorYear = period ? entryFactorYear(period) : null;
  const fera = feraCategoryOf(site);
  const setup = useEntrySetup({
    siteId: contextReady ? site.site_id : null,
    categoryId: contextReady ? category.category_id : null,
    factorYear,
    companyId: site?.company_id ?? null,
    feraCategoryId: fera?.category_id ?? null,
  });
  const threshold = useThreshold(site?.company_id ?? null);
  const model = useMemo(() => (setup.data ? toFormModel(setup.data.config) : null), [setup.data]);
  const draftKey = contextReady ? `add-data:${site.site_id}:${category.category_id}:${formatEntryPeriodParam(period)}` : null;
  const { rows, dispatch, clearDraft } = useEntryRows(model, draftKey);
  const evidence = useRowEvidence(draftKey);
  // Rows sent: nothing is left to lose (and the draft is cleared).
  const [sentKey, setSentKey] = useState<string | null>(null);
  const unsaved = !!draftKey && sentKey !== draftKey && rows.some(rowHasInput);
  // The draft survives in-app navigation, but evidence files don't, and a half-entered form is easy to forget.
  const blocker = useUnsavedGuard(unsaved);

  const calcInput = {
    targetYear: factorYear ?? undefined,
    columns: model?.columns,
    emissionCategoryMapping: model?.mapping,
  };
  const calc = useEmissionCalc({ ...calcInput, emissionFactors: setup.data?.factors ?? [], calculationSpec: model?.spec });
  // FERA preview: same row against the FERA factors, raw value when no conversion exists.
  const feraCalc = useEmissionCalc({ ...calcInput, emissionFactors: setup.data?.feraFactors ?? [], fallbackToRaw: true });

  // Rows that will be sent: bill rows, and typed rows with something in them
  // (all typed rows when there is nothing else, so an empty form still says what's missing).
  const hasBills = rows.some((r) => billOf(r));
  // Bill rows only once their bill is confirmed: nothing AI-filled is sent unchecked.
  const sendable = (r: (typeof rows)[number]) => {
    const bill = billOf(r);
    return bill ? bill.confirmed : rowHasInput(r) || !hasBills;
  };
  const activeRows = rows.filter(sendable);
  const issues = rows.map((r) => (billOf(r) || sendable(r) ? rowIssue(r, calc) : null));
  const unconfirmedBills = billGroups(rows).filter((g) => !g.bill.confirmed).length;
  const emissionCategories = [...new Set(rows.map((r) => r.emission_category).filter(Boolean) as string[])];
  const totals = usePeriodTotals({ siteId: site?.site_id ?? null, categoryId, period, emissionCategories });
  const comparisons: RowComparison[] = rows.map((row, i) => {
    const name = row.emission_category;
    // Once per category, on its first row; both sides are category totals.
    if (!name || rows.findIndex((r) => r.emission_category === name) !== i || !period) return null;
    const inForm = rows.filter((r) => r.emission_category === name).reduce((s, r) => s + (calc.calculateEmission(r).value ?? 0), 0);
    const t = totals[name];
    const c = inForm > 0 ? comparison(t?.saved == null ? null : inForm + savedExcludingEdits(rows, name, t.saved), t?.previous ?? null, threshold.data ?? 5) : null;
    if (!c) return null;
    const arrow = c.pct > 0 ? "▲" : c.pct < 0 ? "▼" : "";
    return { text: `${arrow} ${Math.abs(c.pct).toFixed(1)}%`.trim(), overThreshold: c.overThreshold, threshold: threshold.data ?? 5, previousLabel: entryPeriodLabel(previousPeriod(period)) };
  });

  const periodLabel = period ? entryPeriodLabel(period) : "";
  const classicHref = `/data/new/classic${params.toString() ? `?${params.toString()}` : ""}`;

  let body;
  if (sites.length === 0) {
    body = <EmptyState title="No site is assigned to you yet" description="Ask your manager to add you to a site." />;
  } else if (step === 0 || !contextReady) {
    body = (
      <ChooseContext
        sites={sites}
        siteId={site?.site_id ?? null}
        categories={categories}
        categoryId={category?.category_id ?? null}
        period={period}
        onSite={(id) => setContext({ site: id })}
        onCategory={(id) => setContext({ category: id })}
        onPeriod={(p) => setContext({ period: p })}
        onNext={() => setStep(1)}
      />
    );
  } else if (setup.isPending) {
    body = (
      <Loading label="Loading the form" className="space-y-3">
        <Skeleton className="h-48 w-full rounded-card" />
        <Skeleton className="h-10 w-40 rounded-control" />
      </Loading>
    );
  } else if (setup.isError || !setup.data || !model) {
    body = (
      <EmptyState
        variant="error"
        title="Couldn't load the form for this category"
        description="Check your connection and try again."
        action={<Button variant="secondary" onClick={() => void setup.refetch()}>Retry</Button>}
      />
    );
  } else if (formColumns(model).length === 0) {
    body = <EmptyState title="This category isn't set up for data entry yet" description="Ask your admin to set up its form." />;
  } else if (step === 1) {
    body = (
      <EnterRows
        rows={rows}
        dispatch={dispatch}
        model={model}
        setup={setup.data}
        calc={calc}
        feraCalc={setup.data.feraFactors.length > 0 ? feraCalc : null}
        issues={issues}
        unconfirmedBills={unconfirmedBills}
        siteId={site.site_id}
        categoryId={category.category_id}
        userId={userIdOf(user)}
        period={period}
        draftKey={draftKey}
        comparisons={comparisons}
        factorYear={factorYear as number}
        reportingYear={(factorYear as number) + 1}
        classicHref={classicHref}
        evidence={evidence}
        onBack={() => setStep(0)}
        onNext={() => setStep(2)}
      />
    );
  } else {
    body = (
      <Review
        rows={activeRows}
        payloads={activeRows.map((r) => buildPayload(r, { siteId: site.site_id, categoryId: category.category_id, period }))}
        calc={calc}
        evidenceFiles={evidence.filesOf}
        periodLabel={periodLabel}
        onBack={() => setStep(1)}
        onFinished={() => {
          clearDraft();
          setSentKey(draftKey);
        }}
        onAnother={() => {
          clearDraft();
          setContext({ category: null });
          setStep(0);
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <PageHeader
        title="Add data"
        description={contextReady ? `${site.name} · ${category.category_name} · ${periodLabel}` : "Record your numbers and send them for approval."}
      />
      <Stepper
        steps={STEPS}
        current={step}
        completed={STEPS.slice(0, step).map((s) => s.id)}
        canJump={(i) => i < step}
        onStepChange={setStep}
      />
      {body}
      {contextReady && step > 0 && model && setup.data && (
        <ExistingEntries
          siteId={site.site_id}
          categoryId={category.category_id}
          period={period}
          periodLabel={periodLabel}
          onLoad={step === 1 ? (entry) => dispatch({ type: "load", row: rowFromEntry(entry, model, 0, period) }) : undefined}
        />
      )}
      <Modal
        open={blocker.state === "blocked"}
        onClose={() => blocker.reset?.()}
        title="Leave with rows not sent?"
        description="Typed rows stay as a draft on this device for this site, category and period; evidence files you picked are dropped."
        cancelLabel="Stay"
        primaryAction={{ label: "Leave", onClick: () => blocker.proceed?.() }}
      />
    </div>
  );
}
