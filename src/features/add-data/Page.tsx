import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useCalcDetailForSite } from "../../lib/useCalcDetail";
import { Button, Callout, EmptyState, Loading, Modal, PageHeader, Skeleton, Stepper, useUnsavedGuard } from "../../ui";
import { useEntrySetup, useExistingEntries, usePeriodTotals, useSiteCountry, useThreshold } from "./api";
import { useReviewWorkflow } from "../../lib/reviewWorkflow";
import { LiveChecks, type LiveCheckRow } from "./components/LiveChecks";
import { useLiveChecks } from "./hooks/useLiveChecks";
import { type LiveCheckCandidate, checkRowBodies, serverIssueOf } from "./logic/liveChecks";
import { useEmissionCalc } from "./hooks/useEmissionCalc";
import { useSpendRates } from "../../lib/scope3/useSpendRates";
import type { EmissionFactor } from "./types";
import { rowHasInput, useEntryRows } from "./hooks/useEntryRows";
import { useRowEvidence } from "./hooks/useRowEvidence";
import { billGroups, billOf } from "./logic/bill";
import { buildPayload, comparison, entryDate, entryFactorYear, entryPeriodLabel, formatEntryPeriodParam, parseEntryPeriod, previousPeriod, rowIssue, type EntryPeriod } from "./logic/entry";
import { formColumns, toFormModel } from "./logic/form";
import { entryCategories, feraCategoryOf, sitesOf, userIdOf } from "./logic/sites";
import { entryDraftKey } from "../../lib/entryDrafts";
import { ChooseContext } from "./steps/ChooseContext";
import { EnterRows } from "./steps/EnterRows";
import { Review } from "./steps/Review";
import type { RowComparison } from "./components/EntryRow";
import { ExistingEntries } from "./components/ExistingEntries";
import { editOf, fixTarget, rowFromEntry, savedExcludingEdits } from "./logic/existing";
import { isScope2, splitFeraFactors, upstreamSubFor } from "../../lib/scope3/fera";
import type { Cat3Calc } from "./components/EntryRow";

const STEPS = [
  { id: "context", label: "What are you reporting?" },
  { id: "values", label: "Enter values" },
  { id: "review", label: "Review & submit" },
];

const num = (v: string | null) => (v && /^\d+$/.test(v) ? Number(v) : null);
const NO_FACTORS: EmissionFactor[] = [];

/** P03 Add data: choose the context, type the rows, review and send for approval. */
export default function AddDataPage() {
  const { user } = useAuth();
  const sites = useMemo(() => sitesOf(user), [user]);
  const [params, setParams] = useSearchParams();
  const siteId = num(params.get("site")) ?? (sites.length === 1 ? sites[0].site_id : null);
  const categoryId = num(params.get("category"));
  // SE-1 · simple-entry §8: a contributor never picks a method or reads data quality; the form decides.
  const calcDetail = useCalcDetailForSite(siteId);
  const period = parseEntryPeriod(params.get("period"));
  const site = sites.find((s) => s.site_id === siteId);
  const categories = entryCategories(site);
  const category = categories.find((c) => c.category_id === categoryId) ?? null;
  const contextReady = !!site && !!category && !!period;
  // A deep link with the full context (from My month) starts at step 2.
  const [step, setStep] = useState(contextReady ? 1 : 0);
  // S3-15 part 2, with the company's review workflow on: rows are saved as drafts,
  // "Save and submit" sends them, and a Fix link (`?fix=<id>`) opens that saved row.
  const workflow = useReviewWorkflow(null, siteId);
  const fixId = workflow ? num(params.get("fix")) : null;

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
  // S3-3: the data quality preview scores a factor for the site's own country best; Scope 3 only.
  const siteCountry = useSiteCountry(site?.site_id ?? null, contextReady && category?.ghg_category != null);
  // Rows the server refused for their method (METHOD_NOT_ALLOWED), shown on the row's method cards.
  const [methodErrors, setMethodErrors] = useState<Record<number, { method: string; message: string }>>({});
  // Per user: a draft survives a reload, so the next person signing in on this tab mustn't get it.
  const draftKey = contextReady ? entryDraftKey(userIdOf(user), site.site_id, category.category_id, formatEntryPeriodParam(period)) : null;
  const { rows, sent, dispatch, clearDraft, markSent } = useEntryRows(model, draftKey);
  const evidence = useRowEvidence(draftKey);

  // S3-15 Fix: once the form and the saved entries are in, load the entry `?fix=` names, once.
  const existing = useExistingEntries(fixId !== null && contextReady ? site.site_id : null, category?.category_id ?? null, period);
  const target = fixTarget(existing.data?.entries ?? [], fixId);
  const [fixing, setFixing] = useState<{ id: number; reason: string | null } | null>(null);
  // `period` and `model` are rebuilt on renders; load each fix id once.
  const loadedFix = useRef<number | null>(null);
  useEffect(() => {
    if (!target || !model || !period || loadedFix.current === target.pk_id) return;
    loadedFix.current = target.pk_id;
    dispatch({ type: "load", row: rowFromEntry(target, model, 0, period) });
    setFixing({ id: target.pk_id, reason: target.status === "rejected" ? (target.review_comment ?? null) : null });
    setStep(1);
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("fix"); // data-loss-reviewed: URL param, not data; the row is in the form now
        return next;
      },
      { replace: true },
    );
  }, [target, model, period, dispatch, setParams]);
  // Rows sent: nothing is left to lose (the draft is cleared). New rows for the
  // same context after "Add another category" are unsent again.
  const unsaved = !!draftKey && !sent && rows.some(rowHasInput);
  // The draft survives in-app navigation, but evidence files don't, and a half-entered form is easy to forget.
  const blocker = useUnsavedGuard(unsaved);

  const calcInput = useMemo(() => ({ targetYear: factorYear ?? undefined, columns: model?.columns }), [factorYear, model?.columns]);
  const reportingDate = period ? entryDate(period) : null;
  const factors = setup.data?.factors ?? NO_FACTORS;
  const reportingPeriod = period?.mode;
  // S3-5: exchange rates for rows calculated from the amount spent; a failed lookup shows a note, not a spinner.
  const spendLookup = useMemo(
    () => ({ ...calcInput, emissionFactors: factors, calculationSpec: model?.spec, reportingPeriod }),
    [calcInput, factors, model?.spec, reportingPeriod],
  );
  const spend = useSpendRates(rows, spendLookup, reportingDate);
  const calc = useEmissionCalc({
    ...calcInput,
    emissionFactors: factors,
    calculationSpec: model?.spec,
    spendRates: spend.rates,
    spendRateErrors: spend.failed,
    reportingDate,
    reportingPeriod,
  });
  // FERA preview: same row against the FERA factors, raw value when no conversion exists.
  // S3-7: td_loss factors make a second, T&D-loss row for Scope 2 categories only.
  // Only the factor year's FERA factors count: the backend never falls back to another year for a twin.
  const feraSplit = useMemo(() => splitFeraFactors(setup.data?.feraFactors ?? [], factorYear), [setup.data, factorYear]);
  const upstreamCalc = useEmissionCalc({ ...calcInput, emissionFactors: feraSplit.upstream, fallbackToRaw: true });
  const tdLossCalc = useEmissionCalc({ ...calcInput, emissionFactors: isScope2(category?.scope) ? feraSplit.tdLoss : [], fallbackToRaw: true });
  const feraCalc: Cat3Calc | null =
    feraSplit.upstream.length || (isScope2(category?.scope) && feraSplit.tdLoss.length)
      ? { upstream: feraSplit.upstream.length ? upstreamCalc : null, tdLoss: isScope2(category?.scope) && feraSplit.tdLoss.length ? tdLossCalc : null, upstreamSub: upstreamSubFor(category?.scope) }
      : null;

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

  // S3-15 live checks, with the review workflow on: complete rows as Save would send them.
  const candidates: LiveCheckCandidate[] =
    workflow && contextReady && period
      ? rows.flatMap((r, i) =>
          sendable(r) && rowHasInput(r) && !issues[i]
            ? [
                {
                  rowId: r.id,
                  payload: buildPayload(r, { siteId: site.site_id, categoryId: category.category_id, period }),
                  editOf: editOf(r),
                  hasEvidence: evidence.filesOf(r.id).length > 0 || billOf(r)?.invoiceId != null,
                },
              ]
            : [],
        )
      : [];
  const live = useLiveChecks(checkRowBodies(candidates), workflow && step === 1);
  const liveRows: LiveCheckRow[] = candidates.map((c) => {
    const i = rows.findIndex((r) => r.id === c.rowId);
    return { ref: String(c.rowId), label: `Row ${i + 1} · ${rows[i]?.emission_category || category?.category_name || ""}` };
  });
  const serverIssues = rows.map((r) => (workflow ? serverIssueOf(live.results?.get(String(r.id)), calcDetail) : null));
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
  // Rows without their own date are filed in the month the period ends, as here.
  const bulkUploadHref =
    contextReady && period
      ? `/capture/upload?${new URLSearchParams({ site: String(site.site_id), category: String(category.category_id), period: entryDate(period).slice(0, 7) })}`
      : "/capture/upload";

  const renderReview = (s: NonNullable<typeof site>, c: NonNullable<typeof category>, p: EntryPeriod) => (
    <Review
      rows={activeRows}
      // The row's method stays in activity_data["@method"] too: S3-5 and S3-9 read it there on edits and recalculations.
      payloads={activeRows.map((r) => buildPayload(r, { siteId: s.site_id, categoryId: c.category_id, period: p }))}
      calc={calc}
      evidenceFiles={evidence.filesOf}
      periodLabel={periodLabel}
      onBack={() => setStep(1)}
      onFixMethod={(refused, sentIds) => {
        // Rows already sent leave the form, so going back can't send them twice.
        for (const id of sentIds) dispatch({ type: "remove", id });
        setMethodErrors(Object.fromEntries(refused.map((r) => [r.rowId, { method: r.method, message: r.message }])));
        setStep(1);
      }}
      onFinished={markSent}
      workflow={workflow}
      onAnother={() => {
        clearDraft();
        setContext({ category: null });
        setStep(0);
      }}
    />
  );

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
  } else if (step === 2 && sent) {
    // The success screen stays even if the form is refetched or fails to load in the background.
    body = renderReview(site, category, period);
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
      <>
      {fixing && (
        <Callout tone={fixing.reason ? "warn" : "info"} title={fixing.reason ? "Sent back to you" : "Changing a saved entry"} onDismiss={() => setFixing(null)}>
          {fixing.reason ? (
            <>
              <q className="text-ink">{fixing.reason}</q> Fix the row below, then save and submit it again.
            </>
          ) : (
            "Change the row below, then save it again."
          )}
        </Callout>
      )}
      <EnterRows
        rows={rows}
        dispatch={dispatch}
        model={model}
        setup={setup.data}
        calc={calc}
        feraCalc={feraCalc}
        issues={issues}
        serverIssues={serverIssues}
        unconfirmedBills={unconfirmedBills}
        siteId={site.site_id}
        categoryId={category.category_id}
        ghgCategory={category.ghg_category}
        userId={userIdOf(user)}
        period={period}
        draftKey={draftKey}
        comparisons={comparisons}
        factorYear={factorYear as number}
        reportingYear={(factorYear as number) + 1}
        bulkUploadHref={bulkUploadHref}
        evidence={evidence}
        siteCountry={siteCountry.data ?? null}
        methodErrors={methodErrors}
        showCalcDetail={calcDetail}
        onBack={() => setStep(0)}
        onNext={() => setStep(2)}
      />
      <LiveChecks
        rows={liveRows}
        results={live.results}
        checking={live.checking}
        error={live.error}
        showCalcDetail={calcDetail}
        factorYear={factorYear}
        thresholdPct={threshold.data ?? null}
      />
      </>
    );
  } else {
    body = renderReview(site, category, period);
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
        // Once the rows are sent there is nothing to go back to: start again with Add another category.
        canJump={(i) => i < step && !sent}
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
