import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CloudOff, Loader2, Package } from "lucide-react";
import { Button, Callout, EmptyState, Modal, PageHeader, Skeleton, Stepper, panel, useToast, useUnsavedGuard, type Step } from "../../ui";
import { errorMessage, useAllocationPreview, useCalculate, useMaterialFactors, useSaveInputs, useSaveScope, useStudy } from "./api";
import { ScopeStep } from "./components/ScopeStep";
import { TotalRail } from "./components/TotalRail";
import { type SaveState, useAutosave } from "./hooks/useAutosave";
import {
  type FactorBook,
  type Line,
  type ScopeFields,
  type Study,
  canCalculate,
  checklist,
  lineProblem,
  periodText,
  periodYear,
  runningTotal,
  savableInputs,
  toLines,
} from "./logic";

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

  if (study.error || !study.data) {
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
  return <Builder key={s.pcf_study_id} study={s} header={header(desc)} />;
}

function SaveIndicator({ state, onRetry, incomplete }: { state: SaveState; onRetry: () => void; incomplete: number }) {
  if (state === "error")
    return (
      <span className="flex items-center gap-2 text-sm text-bad" role="status">
        <CloudOff aria-hidden className="size-4" /> Couldn't save
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
        const next = new URLSearchParams(p);
        if (i === 0) next.delete("step");
        else next.set("step", STEPS[i].id);
        return next;
      },
      { replace: true },
    );

  const initialScope = useMemo<ScopeFields>(
    () => ({ reference_start: study.reference_start, reference_end: study.reference_end, year_type: study.year_type, pcr_tag: study.pcr_tag, notes: study.notes }),
    // The editor owns these from now on; refetches don't overwrite typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const initialLines = useMemo(() => toLines(study.inputs), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [scope, setScope] = useState<ScopeFields>(initialScope);
  const [lines] = useState<Line[]>(initialLines);

  const saveScope = useSaveScope(study.pcf_study_id);
  const saveInputs = useSaveInputs(study.pcf_study_id);
  const scopeSave = useAutosave(scope, initialScope, (v) => saveScope.mutateAsync(v));
  const savable = useMemo(() => savableInputs(lines), [lines]);
  const initialSavable = useMemo(() => savableInputs(initialLines), [initialLines]);
  const linesSave = useAutosave(savable, initialSavable, (v) => saveInputs.mutateAsync(v));

  const factors = useMaterialFactors();
  const book = useMemo<FactorBook>(
    () => ({
      material: new Map((factors.data ?? []).map((f) => [f.material_factor_id, { unit: f.unit, value: f.value_kgco2e }])),
      transport: new Map(),
    }),
    [factors.data],
  );
  const preview = useAllocationPreview(study.pcf_study_id, {});
  const total = useMemo(() => runningTotal(lines, book, preview.data?.a3_energy_kg_per_unit ?? null), [lines, book, preview.data]);
  const items = useMemo(() => checklist(study, lines, book, preview.data ?? null), [study, lines, book, preview.data]);

  const incomplete = lines.filter((l) => lineProblem(l) !== null).length;
  const states = [scopeSave.state, linesSave.state];
  const saveState: SaveState = states.includes("error") ? "error" : states.includes("saving") ? "saving" : states.includes("pending") ? "pending" : "saved";
  const retry = () => {
    scopeSave.retry();
    linesSave.retry();
  };
  const blocker = useUnsavedGuard(scopeSave.dirty || linesSave.dirty || incomplete > 0);

  const calculate = useCalculate(study.pcf_study_id);
  const onCalculate = () =>
    calculate.mutate(
      {},
      {
        onSuccess: () => toast({ tone: "good", title: "Calculated. The draft result is saved." }),
        onError: (e) => toast({ tone: "bad", title: errorMessage(e, "Couldn't calculate the footprint.") }),
      },
    );

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
        <SaveIndicator state={saveState} onRetry={retry} incomplete={incomplete} />
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
          ) : (
            <section className={`${panel} p-6`} aria-labelledby="step-title">
              <h2 id="step-title" className="text-base font-semibold text-ink">
                {step.label}
              </h2>
              <p className="mt-2 text-sm text-muted">This step is being built and arrives in the next update of the builder.</p>
            </section>
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
          waitReason={saveState === "saved" ? null : saveState === "error" ? "Save your changes first." : "Saving your changes…"}
          onCalculate={onCalculate}
        />
      </div>

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
