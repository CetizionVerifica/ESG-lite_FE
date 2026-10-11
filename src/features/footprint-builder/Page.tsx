import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CloudOff, Loader2, Package } from "lucide-react";
import { Button, Callout, EmptyState, Modal, PageHeader, Skeleton, Stepper, serializePeriod, useToast, useUnsavedGuard, withoutParams, type Step } from "../../ui";
import { useAuth } from "../../context/AuthContext";
import { errorMessage, useAllocationPreview, useCalculate, useFreightFactors, useMaterialFactors, useSaveInputs, useSaveScope, useStudy, useSubmit } from "./api";
import { EnergyStep, type KeyValues } from "./components/EnergyStep";
import { PackagingStep } from "./components/PackagingStep";
import { ReviewStep } from "./components/ReviewStep";
import { LineDrawer } from "./components/LineDrawer";
import { MaterialsStep } from "./components/MaterialsStep";
import { TransportStep } from "./components/TransportStep";
import { ScopeStep } from "./components/ScopeStep";
import { TotalRail } from "./components/TotalRail";
import { type SaveState, useAutosave } from "./hooks/useAutosave";
import {
  type CalcResult,
  type FactorBook,
  type InputStage,
  type Line,
  type PickerFactor,
  type ScopeFields,
  type Study,
  canCalculate,
  checklist,
  emptyKeyValues,
  applyYield,
  linkedPayloads,
  blankLine,
  lineProblem,
  periodText,
  periodYear,
  runningTotal,
  savableInputs,
  syncPayloads,
  toLines,
} from "./logic";

type SiteWithCategories = { site_id: number; categories?: { category_id: number; scope?: string | null }[] };

/** Scope 3 categories of the study's site: where its freight (tonne.km) factors live. */
function useScope3Categories(siteId: number | null): number[] {
  const { user } = useAuth();
  return useMemo(() => {
    const sites = ((user?.sites as SiteWithCategories[] | undefined) ?? []).concat(user?.site ? [user.site as SiteWithCategories] : []);
    const site = sites.find((x) => x.site_id === siteId);
    return (site?.categories ?? []).filter((c) => /3/.test(c.scope ?? "")).map((c) => c.category_id);
  }, [user, siteId]);
}

const STEPS: Step[] = [
  { id: "scope", label: "Scope" },
  { id: "materials", label: "Materials (A1)" },
  { id: "transport", label: "Inbound transport (A2)" },
  { id: "energy", label: "Plant energy (A3)" },
  { id: "packaging", label: "Packaging and waste" },
  { id: "review", label: "Review" },
];

const STATUS_WORD: Record<Study["status"], string> = {
  draft: "a draft",
  in_review: "in review",
  approved: "approved",
  published: "published",
  superseded: "superseded",
};

/**
 * C02 `/products/:productId/footprints/:studyId/edit`: build one footprint
 * step by step, with a running total and autosave of the draft.
 */
export default function FootprintBuilderPage() {
  const navigate = useNavigate();
  const studyId = Number(useParams().studyId) || 0;
  const study = useStudy(studyId);

  const header = (description?: string) => (
    <PageHeader
      title={study.data?.product ? `${study.data.product.name} footprint` : "Footprint builder"}
      description={description}
      secondaryActions={[{ label: "All footprints", icon: <ArrowLeft aria-hidden className="size-4" />, onClick: () => navigate("/products") }]}
    />
  );

  if (study.isPending)
    return (
      <div className="space-y-4" aria-busy>
        {header()}
        <Skeleton className="h-10 w-full" />
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
          <Skeleton className="h-80" />
          <Skeleton className="h-80" />
        </div>
      </div>
    );

  if (!study.data) {
    const missing = (study.error as { response?: { status?: number } })?.response?.status === 404;
    return (
      <div className="space-y-4">
        {header()}
        <EmptyState
          icon={Package}
          title={missing ? "This footprint doesn't exist or isn't on your sites." : "Couldn't load the footprint."}
          description={missing ? undefined : errorMessage(study.error, "Check your connection and try again.")}
          variant={missing ? "empty" : "error"}
          action={missing ? <Button onClick={() => navigate("/products")}>All footprints</Button> : <Button onClick={() => void study.refetch()}>Try again</Button>}
        />
      </div>
    );
  }

  const s = study.data;
  const desc = `Version ${s.version} · ${s.site?.name ?? "Site"} · ${periodText(s.year_type, periodYear(s))}`;
  if (s.status !== "draft")
    return (
      <div className="space-y-4">
        {header(desc)}
        <Callout
          tone="info"
          title={`This footprint is ${STATUS_WORD[s.status]}, so it can't be edited.`}
          action={
            <Button size="sm" onClick={() => navigate(`/products/${s.pcf_study_id}`)}>
              Open the result
            </Button>
          }
        >
          To change it, start a new version from the result page.
        </Callout>
      </div>
    );

  // Keyed by study so a different study starts with fresh editor state.
  // A failed background refetch keeps the editor and says so above it.
  const refreshError = study.error && (
    <Callout tone="warn" title="Couldn't refresh the footprint." action={<Button size="sm" onClick={() => void study.refetch()}>Try again</Button>}>
      {errorMessage(study.error, "You can keep editing; changes still save.")}
    </Callout>
  );
  return (
    <Builder
      key={s.pcf_study_id}
      study={s}
      header={
        <>
          {header(desc)}
          {refreshError}
        </>
      }
    />
  );
}

function SaveIndicator({ state, error, onRetry, incomplete }: { state: SaveState; error: unknown; onRetry: () => void; incomplete: number }) {
  if (state === "error")
    return (
      <span className="flex items-center gap-2 text-sm text-bad" role="status">
        <CloudOff aria-hidden className="size-4" /> {errorMessage(error, "Couldn't save")}
        <Button size="sm" variant="ghost" onClick={onRetry}>
          Retry
        </Button>
      </span>
    );
  const text = state === "saving" ? "Saving…" : state === "pending" ? "Unsaved changes" : incomplete ? `Saved; ${incomplete} unfinished line${incomplete === 1 ? "" : "s"} not saved yet` : "All changes saved";
  return (
    <span className="flex items-center gap-2 text-sm text-muted" role="status">
      {state === "saving" && <Loader2 aria-hidden className="size-4 animate-spin" />}
      {text}
    </span>
  );
}

function Builder({ study, header }: { study: Study; header: React.ReactNode }) {
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const stepIndex = Math.max(0, STEPS.findIndex((st) => st.id === params.get("step")));
  const goTo = (i: number) =>
    setParams(
      (p) => {
        const next = withoutParams(p, ["step"]);
        if (i > 0) next.set("step", STEPS[i].id);
        return next;
      },
      { replace: true },
    );

  const initialScope = useMemo<ScopeFields>(
    () => ({ reference_start: study.reference_start, reference_end: study.reference_end, year_type: study.year_type, pcr_tag: study.pcr_tag, notes: study.notes, allocation_key: study.allocation_key }),
    // The editor owns these from now on; refetches don't overwrite typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const initialLines = useMemo(() => toLines(study.inputs), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [scope, setScope] = useState<ScopeFields>(initialScope);
  const [lines, setLinesRaw] = useState<Line[]>(initialLines);
  const setLines = useCallback((fn: (ls: Line[]) => Line[]) => setLinesRaw((ls) => syncPayloads(fn(ls))), []);
  const [detailKey, setDetailKey] = useState<string | null>(null);

  const saveScope = useSaveScope(study.pcf_study_id);
  const saveInputs = useSaveInputs(study.pcf_study_id);
  const scopeSave = useAutosave(scope, initialScope, (v) => saveScope.mutateAsync(v));
  // Last finished version of each line, so a line being edited isn't deleted by PUT /inputs.
  const initialSavable = useMemo(() => savableInputs(initialLines), [initialLines]);
  const lastFinished = useRef(initialSavable.finished);
  const savable = useMemo(() => {
    const next = savableInputs(lines, lastFinished.current);
    lastFinished.current = next.finished;
    return next.rows;
  }, [lines]);
  const linesSave = useAutosave(savable, initialSavable.rows, (v) => saveInputs.mutateAsync(v));

  const factors = useMaterialFactors();
  const freight = useFreightFactors(study.site?.site_id ?? null, useScope3Categories(study.site?.site_id ?? null));
  const materialPicker = useMemo<PickerFactor[]>(
    () =>
      (factors.data ?? []).map((f) => ({
        id: f.material_factor_id,
        name: f.name,
        geography: f.geography,
        unit: f.unit,
        value: f.value_kgco2e,
        source: f.source,
        year: f.source_year,
        recycled: f.recycled_variant,
      })),
    [factors.data],
  );
  const tonneKmLibrary = useMemo(() => materialPicker.filter((f) => f.unit.trim().toLowerCase() === "tonne.km"), [materialPicker]);
  const linked = useMemo(() => linkedPayloads(lines), [lines]);
  const book = useMemo<FactorBook>(
    () => ({
      material: new Map(materialPicker.map((f) => [f.id, { unit: f.unit, value: f.value }])),
      transport: new Map((freight.data ?? []).map((f) => [f.id, { unit: f.unit, value: f.value }])),
    }),
    [materialPicker, freight.data],
  );

  const changeLine = useCallback((key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l))), [setLines]);
  const addLine = (stage: InputStage) => setLines((ls) => [...ls, blankLine(stage)]);
  const removeLine = (line: Line) => {
    const at = lines.findIndex((l) => l.key === line.key);
    setLines((ls) => ls.filter((l) => l.key !== line.key));
    toast({
      title: `Removed ${line.name || "the line"}.`,
      action: { label: "Undo", onClick: () => setLines((ls) => [...ls.slice(0, at), line, ...ls.slice(at)]) },
    });
  };
  const byStage = (...stages: InputStage[]) => lines.filter((l) => stages.includes(l.stage));
  const [kv, setKv] = useState<KeyValues>(() => emptyKeyValues(scope.allocation_key));
  // Mass is read from approved production; the other keys need both values typed.
  const sentKv = scope.allocation_key === "mass" ? {} : scope.allocation_key === "manual" ? { ...kv, key_value_site_total: 100 } : kv;
  const preview = useAllocationPreview(study.pcf_study_id, sentKv);
  const total = useMemo(() => runningTotal(lines, book, preview.data?.a3_energy_kg_per_unit ?? null), [lines, book, preview.data]);
  const items = useMemo(() => checklist(study, lines, book, preview.data ?? null), [study, lines, book, preview.data]);

  const incomplete = lines.filter((l) => lineProblem(l) !== null).length;
  const states = [scopeSave.state, linesSave.state];
  const saveError = scopeSave.state === "error" ? scopeSave.error : linesSave.error;
  const saveState: SaveState = states.includes("error") ? "error" : states.includes("saving") ? "saving" : states.includes("pending") ? "pending" : "saved";
  const retry = () => {
    scopeSave.retry();
    linesSave.retry();
  };
  const blocker = useUnsavedGuard(scopeSave.dirty || linesSave.dirty || incomplete > 0);

  // What a calculation saw; Submit needs the current state to match it (the server checks too).
  const fingerprint = JSON.stringify([savable, scope, sentKv]);
  const [calcPrint, setCalcPrint] = useState<string | null>(() => (study.result ? JSON.stringify([initialSavable.rows, initialScope, {}]) : null));
  const calculate = useCalculate(study.pcf_study_id);
  const onCalculate = () => {
    const at = fingerprint;
    calculate.mutate(sentKv, {
      onSuccess: () => {
        setCalcPrint(at);
        toast({ tone: "good", title: "Calculated. The draft result is saved." });
      },
      onError: (e) => toast({ tone: "bad", title: errorMessage(e, "Couldn't calculate the footprint.") }),
    });
  };
  const navigate = useNavigate();
  const submit = useSubmit(study.pcf_study_id);
  const onSubmit = () =>
    submit.mutate(undefined, {
      onSuccess: () => {
        toast({ tone: "good", title: "Sent for review." });
        navigate("/products");
      },
      onError: (e) => toast({ tone: "bad", title: errorMessage(e, "Couldn't send the footprint for review.") }),
    });
  const waitReason = saveState === "saved" ? null : saveState === "error" ? "Save your changes first." : "Saving your changes…";
  const productionLink = `/data/production?${new URLSearchParams({
    site: String(study.site?.site_id ?? ""),
    period: serializePeriod(scope.year_type === "CY" ? { kind: "cy", year: periodYear(scope) } : { kind: "fy", startYear: periodYear(scope) }),
    status: "approved",
  }).toString()}`;

  const p = study.product;
  const unitLabel = p?.declared_unit ? `${p.declared_unit_qty ?? 1} ${p.declared_unit}` : "declared unit";
  const completed = [
    ...(p?.declared_unit ? ["scope"] : []),
    ...(lines.some((l) => l.stage === "A1") ? ["materials"] : []),
    ...(lines.some((l) => l.stage === "A2") ? ["transport"] : []),
    ...(preview.data && !preview.data.blockers.length ? ["energy"] : []),
    ...(lines.some((l) => l.stage === "A3_packaging" || l.stage === "A3_waste") ? ["packaging"] : []),
  ];

  const step = STEPS[stepIndex];
  return (
    <div className="space-y-4">
      {header}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Stepper steps={STEPS} current={stepIndex} completed={completed} canJump={() => true} onStepChange={goTo} label="Footprint steps" />
        <SaveIndicator state={saveState} error={saveError} onRetry={retry} incomplete={incomplete} />
      </div>

      {preview.data && preview.data.blockers.length > 0 && step.id !== "energy" && (
        <Callout tone="warn" title="Plant energy can't be allocated yet." action={<Button size="sm" onClick={() => goTo(3)}>Open plant energy</Button>}>
          {preview.data.blockers[0]}
        </Callout>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-4">
          {step.id === "scope" ? (
            <ScopeStep study={study} scope={scope} onChange={(patch) => setScope((s) => ({ ...s, ...patch }))} />
          ) : step.id === "materials" ? (
            <MaterialsStep
              lines={byStage("A1")}
              factors={materialPicker}
              factorsLoading={factors.isPending}
              factorsError={factors.isError}
              book={book}
              unitLabel={unitLabel}
              onAdd={() => addLine("A1")}
              onChange={changeLine}
              onRemove={removeLine}
              onDetails={(l) => setDetailKey(l.key)}
              onApplyYield={(pct) => {
                setLines((ls) => applyYield(ls, pct));
                toast({ title: `Scaled the materials for a ${pct}% yield.` });
              }}
            />
          ) : step.id === "transport" ? (
            <TransportStep
              legs={byStage("A2")}
              materials={byStage("A1")}
              factors={freight.data ?? []}
              libraryFactors={tonneKmLibrary}
              linked={linked}
              factorsLoading={freight.isPending}
              factorsError={freight.isError}
              book={book}
              siteName={study.site?.name ?? "the plant"}
              onAdd={() => addLine("A2")}
              onChange={changeLine}
              onRemove={removeLine}
            />
          ) : step.id === "energy" ? (
            <EnergyStep
              allocationKey={scope.allocation_key}
              onKeyChange={(k) => {
                setScope((x) => ({ ...x, allocation_key: k }));
                // Values typed for one key mean nothing for another (a site total of 5000 h isn't 100%).
                setKv(emptyKeyValues(k));
              }}
              keyValues={kv}
              onKeyValues={setKv}
              preview={preview.data}
              loading={preview.isFetching}
              error={preview.error ? errorMessage(preview.error, "Check your connection and try again.") : null}
              saving={scopeSave.state === "saving"}
              unitLabel={unitLabel}
              productionLink={productionLink}
            />
          ) : step.id === "packaging" ? (
            <PackagingStep
              packaging={byStage("A3_packaging")}
              waste={byStage("A3_waste")}
              factors={materialPicker}
              factorsLoading={factors.isPending}
              book={book}
              unitLabel={unitLabel}
              onAdd={addLine}
              onChange={changeLine}
              onRemove={removeLine}
              onDetails={(l) => setDetailKey(l.key)}
            />
          ) : (
            <ReviewStep
              total={total}
              lines={lines}
              unitLabel={unitLabel}
              plantBlockers={preview.data?.blockers ?? []}
              calc={calculate.data as CalcResult | undefined}
              summary={study.result}
              current={calcPrint === fingerprint}
              canCalculate={canCalculate(items)}
              waitReason={waitReason}
              calculating={calculate.isPending}
              submitting={submit.isPending}
              onCalculate={onCalculate}
              onSubmit={onSubmit}
            />
          )}
          <div className="flex justify-between gap-2">
            <Button icon={<ArrowLeft aria-hidden className="size-4" />} onClick={() => goTo(stepIndex - 1)} disabled={stepIndex === 0}>
              Back
            </Button>
            {stepIndex < STEPS.length - 1 && (
              <Button variant="primary" onClick={() => goTo(stepIndex + 1)}>
                Next: {STEPS[stepIndex + 1].label}
                <ArrowRight aria-hidden className="size-4" />
              </Button>
            )}
          </div>
        </div>
        <TotalRail
          total={total}
          unitLabel={unitLabel}
          items={items}
          canCalculate={canCalculate(items)}
          calculating={calculate.isPending}
          waitReason={waitReason}
          onCalculate={onCalculate}
        />
      </div>

      <LineDrawer line={lines.find((l) => l.key === detailKey) ?? null} factors={materialPicker} onChange={changeLine} onClose={() => setDetailKey(null)} />

      <Modal
        open={blocker.state === "blocked"}
        onClose={() => blocker.reset?.()}
        title="Leave with changes not saved?"
        description={incomplete ? "Unfinished lines aren't saved until they have a name, quantity and factor." : "Your latest changes haven't reached the server yet."}
        tone="destructive"
        cancelLabel="Stay"
        primaryAction={{ label: "Leave", onClick: () => blocker.proceed?.() }}
      />
    </div>
  );
}
