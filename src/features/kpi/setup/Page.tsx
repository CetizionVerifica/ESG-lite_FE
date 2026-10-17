import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle2, Send } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { ESRS_TOPICS, type KpiCatalogue, type KpiDefinition, type KpiSetup } from "../../../lib/kpi/contracts";
import { KpiNotAvailable } from "../../../lib/kpi/KpiNotAvailable";
import { FRAMEWORK_LABEL, ESRS_TOPIC_LABEL } from "../../../lib/kpi/labels";
import { isKpiTrackingOff } from "../../../lib/kpi/switch";
import { Button, Callout, EmptyState, PageHeader, SkeletonText, Stepper, TabPanel, Tabs, cn, panel, useToast } from "../../../ui";
import { kpiErrorMessage, recommendedIds, useInviteOwners, useSaveSetup, useSetup, useSetupPeople } from "./api";
import { CustomKpiDrawer } from "./components/CustomKpiDrawer";
import { FrameworksStep, type YearSettings } from "./components/FrameworksStep";
import { KpisStep } from "./components/KpisStep";
import { MaterialityStep } from "./components/MaterialityStep";
import { OwnersStep } from "./components/OwnersStep";
import {
  type KpiChoice,
  type MaterialState,
  STEPS,
  type StepId,
  applyToAllSites,
  assignmentsPayload,
  codesOf,
  countSelected,
  initialChoices,
  initialFrameworkIds,
  initialMaterial,
  initialOwners,
  isStep,
  kpisPayload,
  materialErrors,
  materialPayload,
  missingReasons,
  ownedKpis,
  recommendationFor,
  resumeStep,
  unownedCells,
  usesFor,
} from "./logic";

const sameIds = (a: number[], b: number[]) => a.length === b.length && a.every((x) => b.includes(x));

/**
 * KPI-3 `/kpi/setup` (05-ux S2): an Admin turns "we report GRI, BRSR and
 * CSRD" into the KPIs their people owe, in four short steps, each saved on
 * Next and resumable. Once finished, the same steps are tabs for changes.
 */
export default function SetupPage() {
  const { setup, catalogue, companyId } = useSetup();
  const { role } = useAuth();
  const staff = role === "Superadmin";
  const error = setup.error ?? catalogue.error;

  if (error && isKpiTrackingOff(error)) return <KpiNotAvailable staff={staff} home={staff ? "/clients" : "/"} />;
  return (
    <div className="space-y-6 py-6">
      <PageHeader title="KPI setup" description="Choose what your company reports and who enters it. You can change this later." />
      {error ? (
        <section className={panel}>
          <EmptyState
            variant="error"
            title={kpiErrorMessage(error, "Couldn't load KPI setup.")}
            action={
              <Button onClick={() => void Promise.all([setup.refetch(), catalogue.refetch()])} variant="primary">
                Try again
              </Button>
            }
          />
        </section>
      ) : !setup.data || !catalogue.data ? (
        <section className={cn(panel, "p-5")}>
          <SkeletonText lines={8} />
        </section>
      ) : (
        <Wizard key={companyId ?? "own"} setup={setup.data} catalogue={catalogue.data} />
      )}
    </div>
  );
}

function Wizard({ setup, catalogue }: { setup: KpiSetup; catalogue: KpiCatalogue }) {
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const save = useSaveSetup();
  const invite = useInviteOwners();
  const people = useSetupPeople(setup);
  const completed = !!setup.settings.setup_completed_at;

  const frameworks = catalogue.frameworks;
  const defs = useMemo(() => catalogue.definitions.filter((d) => d.active !== false), [catalogue.definitions]);
  const [frameworkIds, setFrameworkIds] = useState<number[]>(() => initialFrameworkIds(setup, frameworks));
  const [year, setYear] = useState<YearSettings>(() => ({ yearType: setup.settings.year_type, firstYear: setup.settings.first_year, dueDay: setup.settings.due_day }));
  const [material, setMaterial] = useState<MaterialState>(() => initialMaterial(setup));
  const [choiceEdits, setChoiceEdits] = useState<Map<number, KpiChoice>>(new Map());
  const [ownerEdits, setOwnerEdits] = useState<Map<string, number | null>>(new Map());
  const [addOwn, setAddOwn] = useState(false);
  const [finished, setFinished] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [tried, setTried] = useState<StepId | null>(null);

  const codes = codesOf(frameworkIds, frameworks);
  const esrs = codes.includes("ESRS");
  const stepParam = params.get("step");
  const step: StepId = isStep(stepParam) ? stepParam : completed ? "frameworks" : resumeStep(setup, frameworks);
  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const goTo = (s: StepId) => {
    setProblem(null);
    setTried(null);
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.set("step", s);
        return next;
      },
      { replace: true },
    );
  };

  // Recommendation: the server's list while frameworks and topics are as saved, else the same rule here.
  const local = useMemo(() => recommendationFor(catalogue, frameworkIds, material), [catalogue, frameworkIds, material]);
  const server = useMemo(() => recommendedIds(setup), [setup]);
  const savedTopics = JSON.stringify(materialPayload(initialMaterial(setup)));
  const asSaved = sameIds(frameworkIds, setup.frameworks.map((f) => f.framework_id)) && JSON.stringify(materialPayload(material)) === savedTopics;
  const rec = useMemo(() => (server && asSaved ? { ...local, ids: server } : local), [server, asSaved, local]);

  const base = useMemo(() => initialChoices(setup, defs, rec.ids), [setup, defs, rec.ids]);
  const choices = useMemo(() => {
    const m = new Map(base);
    for (const [id, c] of choiceEdits) m.set(id, c);
    return m;
  }, [base, choiceEdits]);
  const uses = useMemo(() => usesFor(catalogue, frameworkIds), [catalogue, frameworkIds]);
  const owned = useMemo(() => ownedKpis(defs, choices), [defs, choices]);
  const sites = useMemo(() => people.data?.sites ?? [], [people.data]);
  const persons = useMemo(() => people.data?.people ?? [], [people.data]);
  const owners = useMemo(() => {
    const m = initialOwners(setup, owned, sites, persons);
    for (const [k, v] of ownerEdits) if (m.has(k)) m.set(k, v);
    return m;
  }, [setup, owned, sites, persons, ownerEdits]);

  const counts = countSelected(defs, choices);
  const topicErrors = tried === "topics" ? materialErrors(material) : null;
  const reasonsMissing = tried === "kpis" ? missingReasons(choices, rec.ids) : null;
  const ownersMissing = tried === "owners" ? unownedCells(owners) : null;

  const materialNames = ESRS_TOPICS.filter((t) => material[t].material).map((t) => ESRS_TOPIC_LABEL[t].toLowerCase());
  const context = [
    frameworkIds
      .map((id) => frameworks.find((f) => f.id === id))
      .filter((f): f is NonNullable<typeof f> => !!f)
      .map((f) => (f.version.startsWith(FRAMEWORK_LABEL[f.code]) ? f.version : `${FRAMEWORK_LABEL[f.code]} ${f.version}`))
      .join(" · "),
    esrs && materialNames.length ? `${materialNames.join(", ")} ${materialNames.length === 1 ? "is" : "are"} material` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const run = async (body: Parameters<typeof save.mutateAsync>[0], done: string) => {
    setProblem(null);
    try {
      await save.mutateAsync(body);
      if (completed) toast({ title: done, tone: "good" });
      return true;
    } catch (e) {
      setProblem(kpiErrorMessage(e, "Couldn't save this step. Try again."));
      return false;
    }
  };

  /** Saves the current step; true when it saved. */
  const saveStep = async (s: StepId): Promise<boolean> => {
    setTried(s);
    if (s === "frameworks") {
      if (!frameworkIds.length) {
        setProblem("Pick at least one framework.");
        return false;
      }
      return run({ settings: { year_type: year.yearType, first_year: year.firstYear, due_day: year.dueDay }, framework_ids: frameworkIds }, "Frameworks saved.");
    }
    if (s === "topics") {
      if (!esrs) return true;
      if (Object.keys(materialErrors(material)).length) {
        setProblem("Answer every topic. A topic that doesn't matter needs a one-line reason.");
        return false;
      }
      return run({ material_topics: materialPayload(material) }, "Topics saved.");
    }
    if (s === "kpis") {
      if (!counts.total) {
        setProblem("Pick at least one KPI.");
        return false;
      }
      if (missingReasons(choices, rec.ids).length) {
        setProblem("Some required KPIs are left out without a reason. Add one, or tick them again.");
        return false;
      }
      return run({ kpis: kpisPayload(choices, rec.ids) }, "KPIs saved.");
    }
    if (unownedCells(owners).length) {
      setProblem("Choose who enters each KPI.");
      return false;
    }
    return run({ assignments: assignmentsPayload(owners), settings: { complete: true } }, "Owners saved.");
  };

  const nextOf = (s: StepId): StepId | null => {
    if (s === "frameworks") return esrs ? "topics" : "kpis";
    if (s === "topics") return "kpis";
    if (s === "kpis") return "owners";
    return null;
  };
  const prevOf = (s: StepId): StepId | null => {
    if (s === "owners") return "kpis";
    if (s === "kpis") return esrs ? "topics" : "frameworks";
    if (s === "topics") return "frameworks";
    return null;
  };

  const next = async () => {
    if (!(await saveStep(step))) return;
    const n = nextOf(step);
    if (n) goTo(n);
    else {
      setFinished(true);
      setParams((p) => {
        const nx = new URLSearchParams(p);
        nx.delete("step");
        return nx;
      });
    }
  };

  const applyAll = (kpiId: number) => {
    const first = sites[0] ? owners.get(`${kpiId}:${sites[0].site_id}`) : null;
    if (!first) {
      toast({ title: "Choose a person for the first site first." });
      return;
    }
    const res = applyToAllSites(owners, kpiId, first, sites, persons);
    setOwnerEdits((m) => {
      const nx = new Map(m);
      for (const s of sites) nx.set(`${kpiId}:${s.site_id}`, res.owners.get(`${kpiId}:${s.site_id}`) ?? null);
      return nx;
    });
    const who = persons.find((p) => p.user_id === first)?.name ?? "They";
    toast({ title: res.skipped.length ? `Applied where ${who} works.` : "Applied to all sites.", description: res.skipped.length ? `${who} doesn't work at ${res.skipped.join(", ")}; those keep their person.` : undefined });
  };

  const body = (s: StepId) => {
    if (s === "frameworks") return <FrameworksStep frameworks={frameworks} ids={frameworkIds} onIds={setFrameworkIds} year={year} onYear={setYear} />;
    if (s === "topics")
      return esrs ? (
        <MaterialityStep value={material} onChange={setMaterial} errors={topicErrors} />
      ) : (
        <EmptyState title="Only needed for CSRD (ESRS)." description="You didn't pick CSRD (ESRS), so there's nothing to answer here." compact />
      );
    if (s === "kpis")
      return (
        <KpisStep
          defs={defs}
          choices={choices}
          onChoice={(id, c) => setChoiceEdits((m) => new Map(m).set(id, c))}
          rec={rec}
          uses={uses}
          context={context}
          onAddOwn={() => setAddOwn(true)}
          missing={reasonsMissing}
        />
      );
    if (people.isLoading) return <SkeletonText lines={6} />;
    if (people.error) return <EmptyState variant="error" title={kpiErrorMessage(people.error, "Couldn't load your sites and people.")} action={<Button onClick={() => void people.refetch()}>Try again</Button>} />;
    if (!sites.length && owned.some((d) => d.level === "site")) return <EmptyState title="Add a site first." description="Site KPIs are entered per site. Add your sites under Sites, then come back." />;
    return (
      <OwnersStep defs={owned} sites={sites} people={persons} owners={owners} onOwner={(k, v) => setOwnerEdits((m) => new Map(m).set(k, v))} onApplyAll={applyAll} missing={ownersMissing} />
    );
  };

  const problemBox = problem && (
    <Callout tone="warn" title={problem} onDismiss={() => setProblem(null)}>
      {null}
    </Callout>
  );

  // Finished: the summary, with "Invite your team".
  const summary = (
    <section aria-label="Setup summary" className={cn(panel, "space-y-4 p-5")}>
      <div className="flex items-start gap-3">
        <CheckCircle2 aria-hidden className="mt-0.5 size-6 shrink-0 text-good" />
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-ink">KPI setup is done</h2>
          <p className="text-sm text-muted">
            {codes.map((c) => (c === "ESRS" ? "CSRD (ESRS)" : c)).join(", ")} · {counts.total} KPIs: {counts.auto} filled from your data, {counts.formula} calculated, {counts.manual} to enter
            {sites.length ? ` across ${sites.length} ${sites.length === 1 ? "site" : "sites"}` : ""}.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="primary"
          loading={invite.isPending}
          onClick={async () => {
            try {
              const r = await invite.mutateAsync();
              toast({ title: r.notified ? `${r.notified} ${r.notified === 1 ? "person was" : "people were"} told what they enter.` : "Everyone already knows what they enter.", tone: "good" });
            } catch (e) {
              toast({ title: "Couldn't send the invitations.", description: kpiErrorMessage(e, "Try again in a moment."), tone: "bad" });
            }
          }}
        >
          <Send aria-hidden className="size-4" />
          Invite your team to enter KPIs
        </Button>
        <Button variant="secondary" onClick={() => setFinished(false)}>
          Change setup
        </Button>
      </div>
    </section>
  );

  const ownDrawer = (
    <CustomKpiDrawer
      open={addOwn}
      onClose={() => setAddOwn(false)}
      onCreated={(def: KpiDefinition) => {
        setAddOwn(false);
        setChoiceEdits((m) => new Map(m).set(def.id, { selected: true, reason: "", frequency: null }));
        toast({ title: `${def.name} added and ticked.`, tone: "good" });
      }}
    />
  );

  if (finished) return summary;

  if (completed) {
    // Settings → KPI setup: the same steps as tabs, each saved on its own.
    return (
      <div className="space-y-4">
        <Tabs<StepId> label="KPI setup" idBase="kpi-setup" value={step} onChange={goTo} items={STEPS.map((s) => ({ value: s.id, label: s.label }))} />
        {problemBox}
        {STEPS.map((s) => (
          <TabPanel key={s.id} idBase="kpi-setup" value={s.id} current={step}>
            <div className="space-y-4">
              {body(s.id)}
              {(s.id !== "topics" || esrs) && (
                <div className="flex justify-end">
                  <Button variant="primary" loading={save.isPending} onClick={() => void saveStep(s.id)}>
                    Save changes
                  </Button>
                </div>
              )}
            </div>
          </TabPanel>
        ))}
        {ownDrawer}
      </div>
    );
  }

  const prev = prevOf(step);
  const nextStep = nextOf(step);
  return (
    <div className="space-y-5">
      <Stepper
        label="KPI setup steps"
        steps={STEPS.map((s) => (s.id === "topics" && !esrs ? { ...s, description: "Not needed without ESRS" } : { ...s }))}
        current={stepIndex}
        completed={STEPS.slice(0, stepIndex).map((s) => s.id)}
        canJump={(i) => i < stepIndex}
        onStepChange={(i) => goTo(STEPS[i].id)}
      />
      {problemBox}
      <section aria-label={STEPS[stepIndex].label}>{body(step)}</section>
      <div className="flex flex-wrap justify-between gap-2">
        <span>
          {prev && (
            <Button variant="secondary" onClick={() => goTo(prev)}>
              <ArrowLeft aria-hidden className="size-4" />
              Back
            </Button>
          )}
        </span>
        <Button variant="primary" loading={save.isPending} onClick={() => void next()}>
          {nextStep ? `Next: ${STEPS.find((s) => s.id === nextStep)?.label.toLowerCase()}` : "Finish setup"}
          {nextStep && <ArrowRight aria-hidden className="size-4" />}
        </Button>
      </div>
      {ownDrawer}
    </div>
  );
}
