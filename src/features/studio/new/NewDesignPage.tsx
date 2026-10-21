import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Circle, FileText, Loader2, MinusCircle, Plus, Search, XCircle } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { BLANK_TEMPLATE, FRAMEWORKS_BY_KIND, type BuildStep, type FrameworkCode, type ReportKind, type ReportTemplate } from "../../../lib/studio/contracts";
import { periodLabel } from "../../../lib/studio/docData";
import { useDesignStudio, useStudioCompanyId } from "../../../lib/studio/switch";
import { getInputsPrefill } from "../../../services/studioService";
import { Badge, Button, Callout, EmptyState, PageHeader, SegmentedControl, Select, Skeleton, Stepper, TextField, Textarea, Toggle, cn, focusRing, panel } from "../../../ui";
import { useBrandKit } from "../brand-kit/api";
import { docErrorMessage, useDocBuild, useStartBuild, useTemplates } from "../docs/api";
import { FORMAT_ASPECT, formatLine } from "../home/logic";
import { ReportDetailsForm } from "../panels/ReportDetailsForm";
import { FRAMEWORK_LABELS, blankFormatFor, createBody, filterTemplates, initialState, yearOptions, type FormatFilter, type NewDesignState } from "./logic";
import { HelpMeChoose } from "./HelpMeChoose"; // AT-1
import type { ChooseMode } from "./suggestLogic"; // AT-1

const STEPS = [
  { id: "template", label: "Template" },
  { id: "scope", label: "Scope" },
  { id: "details", label: "Report details" },
  { id: "words", label: "Words" },
];

const KIND_TITLE: Record<ReportKind, string> = { ghg: "New GHG report", sustainability: "New sustainability report" };

type SiteLike = { site_id: number; name: string };

/** The sites the session knows (a Manager's or User's); Admins and Superadmins report company-wide. */
function useSessionSites(): SiteLike[] {
  const { user } = useAuth();
  return useMemo(() => {
    const u = (user ?? {}) as { sites?: SiteLike[]; site?: SiteLike | null };
    const list = u.sites?.length ? u.sites : u.site ? [u.site] : [];
    return list.filter((s) => Number.isInteger(s?.site_id));
  }, [user]);
}

/**
 * DS-5 · `/studio/new` (05-ux S2, mockup "Templates"): template → scope →
 * report details → words, then the build with its progress list, then the
 * editor. Starts from the URL (the home cards and the GHG report's "Design
 * this report" fill kind, format, year, year type, compare year and sites).
 */
export function NewDesignPage() {
  const [params] = useSearchParams();
  const [state, setState] = useState<NewDesignState>(() => initialState(params));
  const [step, setStep] = useState(0);
  const [buildId, setBuildId] = useState<number | null>(null);
  const { kinds, checking } = useDesignStudio();
  const set = (patch: Partial<NewDesignState>) => setState((s) => ({ ...s, ...patch }));
  const start = useStartBuild();
  const [error, setError] = useState<string | null>(null);

  // The studio switch itself is the route's gate (StudioGate); here only the sustainability kind's KPI switch.
  if (state.kind === "sustainability" && !kinds.sustainability && !checking) {
    return (
      <div className="space-y-6">
        <PageHeader title={KIND_TITLE[state.kind]} />
        <section className={panel}>
          <EmptyState title="Sustainability reports need KPI tracking." description="KPI tracking isn't turned on for your company. GHG reports work without it." action={<Link to="/studio/new?kind=ghg" className={cn("text-sm font-medium text-brand-text underline", focusRing)}>New GHG report</Link>} />
        </section>
      </div>
    );
  }

  if (buildId !== null) return <BuildView id={buildId} onRetry={() => (setBuildId(null), setStep(3))} />;

  const canNext = step === 0 ? state.templateId !== null : step === 1 ? state.frameworks.length > 0 : true;
  const onBuild = async () => {
    setError(null);
    try {
      const r = await start.mutateAsync(createBody(state));
      setBuildId(r.id);
    } catch (e) {
      setError(docErrorMessage(e, "The design couldn't be started. Try again."));
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <Link to="/studio" className={cn("inline-flex items-center gap-1 text-sm text-muted hover:text-ink", focusRing)}>
          <ArrowLeft aria-hidden className="size-4" /> Design Studio
        </Link>
      </div>
      <PageHeader title={KIND_TITLE[state.kind]} description={`${periodLabel(state.yearType, state.year)} · ${state.sites === "all" ? "All sites" : `${state.sites.length} site${state.sites.length === 1 ? "" : "s"}`}`} />
      <Stepper steps={STEPS} current={step} completed={STEPS.slice(0, step).map((s) => s.id)} onStepChange={setStep} />
      {error && (
        <Callout tone="warn" title="Not started" onDismiss={() => setError(null)}>
          {error}
        </Callout>
      )}
      {step === 0 && <TemplateStep state={state} set={set} kindsOn={kinds} onUse={(templateId) => (set({ templateId }), setStep(1))} /* AT-1 */ />}
      {step === 1 && <ScopeStep state={state} set={set} />}
      {step === 2 && <DetailsStep state={state} set={set} />}
      {step === 3 && <WordsStep state={state} set={set} />}
      <div className="flex flex-wrap justify-between gap-2 border-t border-line pt-4">
        {step === 0 ? (
          <Link to="/studio" className={cn("inline-flex h-9 items-center rounded-control border border-line bg-panel px-3.5 text-sm font-medium text-ink hover:bg-tint", focusRing)}>
            Cancel
          </Link>
        ) : (
          <Button onClick={() => setStep(step - 1)}>Back</Button>
        )}
        {step < 3 ? (
          <Button variant="primary" disabled={!canNext} onClick={() => setStep(step + 1)} data-testid="new-next">
            Next: {STEPS[step + 1].label.toLowerCase()} →
          </Button>
        ) : (
          <Button variant="primary" loading={start.isPending} onClick={() => void onBuild()} data-testid="new-build">
            Build design
          </Button>
        )}
      </div>
    </div>
  );
}

interface StepProps {
  state: NewDesignState;
  set: (patch: Partial<NewDesignState>) => void;
}

const FORMAT_FILTERS: { value: FormatFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "report", label: "A4 report" },
  { value: "deck", label: "16:9 deck" },
  { value: "summary", label: "One page" },
  { value: "social", label: "Social" },
];

function TemplateThumb({ format, title, kind }: { format: ReportTemplate["format"]; title: string; kind: ReportKind }) {
  const aspect = FORMAT_ASPECT[format];
  return (
    <div className="flex h-40 items-center justify-center rounded-t-card bg-tint" aria-hidden>
      <div className="flex flex-col justify-between rounded-chip border border-line bg-panel p-2 shadow-sm" style={{ height: aspect >= 1 ? `${Math.round(120 / aspect)}px` : "136px", width: aspect >= 1 ? "120px" : `${Math.round(136 * aspect)}px` }}>
        <FileText className="size-3.5 text-brand-text" />
        <span className="line-clamp-3 text-[9px] leading-tight font-semibold text-ink">{title}</span>
        <span className="text-[7px] text-muted">{kind === "ghg" ? "tCO₂e" : "KPIs"}</span>
      </div>
    </div>
  );
}

// AT-1: step 1 offers "Browse all | Help me choose"; a suggestion's "Use this" picks it and moves on.
function TemplateStep({ state, set, kindsOn, onUse }: StepProps & { kindsOn: Record<ReportKind, boolean>; onUse: (templateId: number) => void }) {
  const [mode, setMode] = useState<ChooseMode>("browse");
  const kindControl = (
    <SegmentedControl
      label="Report kind"
      value={state.kind}
      onChange={(kind) => set({ kind, templateId: null, frameworks: [FRAMEWORKS_BY_KIND[kind][0]], inputs: {} })}
      options={[
        { value: "ghg", label: "GHG report" },
        ...(kindsOn.sustainability ? [{ value: "sustainability" as const, label: "Sustainability report" }] : []),
      ]}
    />
  );
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <SegmentedControl
          label="How to pick"
          value={mode}
          onChange={setMode}
          options={[
            { value: "browse", label: "Browse all" },
            { value: "choose", label: "Help me choose" },
          ]}
        />
        {mode === "choose" && kindControl}
      </div>
      {mode === "choose" ? <HelpMeChoose key={state.kind} state={state} onUse={onUse} onBrowse={() => setMode("browse")} /> : <BrowseTemplates state={state} set={set} kindControl={kindControl} />}
    </div>
  );
}

function BrowseTemplates({ state, set, kindControl }: StepProps & { kindControl: ReactNode }) {
  const [q, setQ] = useState("");
  const templates = useTemplates({ kind: state.kind, ...(q.trim() ? { q: q.trim() } : {}) });
  const shown = useMemo(() => filterTemplates(templates.data ?? [], state.formatFilter), [templates.data, state.formatFilter]);
  const selected = shown.find((t) => t.id === state.templateId) ?? (templates.data ?? []).find((t) => t.id === state.templateId) ?? null;
  const blankFormat = blankFormatFor(state.formatFilter, state.blankFormat);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          {kindControl}
          <SegmentedControl label="Format" value={state.formatFilter} onChange={(formatFilter) => set({ formatFilter, templateId: null })} options={FORMAT_FILTERS} />
          <div className="relative min-w-48 flex-1">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              aria-label="Search templates"
              placeholder="Search templates"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className={cn("h-9 w-full rounded-control border border-line bg-panel pr-3 pl-8 text-sm text-ink placeholder:text-muted", focusRing)}
            />
          </div>
        </div>
        <p className="text-sm text-muted">Pick a template. Previews show the layout; your brand and approved data fill it when it's built.</p>
        {templates.isError ? (
          <EmptyState variant="error" title="Templates couldn't be loaded." description={docErrorMessage(templates.error, "Try again in a moment.")} action={<Button onClick={() => void templates.refetch()}>Try again</Button>} />
        ) : templates.isPending ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-56 w-full" />
            ))}
          </div>
        ) : (
          <ul role="radiogroup" aria-label="Templates" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="template-gallery">
            {shown.map((t) => {
              const on = state.templateId === t.id;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => set({ templateId: t.id })}
                    data-testid={`template-${t.id}`}
                    className={cn(panel, "block w-full text-left hover:border-brand", on && "border-brand ring-2 ring-brand", focusRing)}
                  >
                    <TemplateThumb format={t.format} title={t.name} kind={t.kind} />
                    <span className="block p-3">
                      <span className="flex items-center justify-between gap-2 font-medium text-ink">
                        {t.name}
                        {on && <Badge tone="brand">Selected</Badge>}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted">{formatLine(t.format, t.pageCount)}</span>
                    </span>
                  </button>
                </li>
              );
            })}
            {shown.length === 0 && (
              <li className="sm:col-span-2 xl:col-span-3">
                <p className="text-sm text-muted">No template matches. Start blank, or clear the search.</p>
              </li>
            )}
            <li>
              <button
                type="button"
                role="radio"
                aria-checked={state.templateId === BLANK_TEMPLATE}
                onClick={() => set({ templateId: BLANK_TEMPLATE, blankFormat })}
                data-testid="template-blank"
                className={cn(panel, "flex h-full min-h-56 w-full flex-col items-center justify-center gap-2 text-muted hover:border-brand", state.templateId === BLANK_TEMPLATE && "border-brand ring-2 ring-brand", focusRing)}
              >
                <Plus aria-hidden className="size-6" />
                <span className="font-medium text-ink">Blank {blankFormat === "slide_16_9" ? "16:9" : blankFormat === "square" ? "square" : "A4"}</span>
              </button>
            </li>
          </ul>
        )}
      </div>
      <aside className={cn(panel, "h-fit space-y-3 p-4")} aria-label="Selected template">
        {state.templateId === BLANK_TEMPLATE ? (
          <>
            <p className="font-medium text-ink">Blank design</p>
            <p className="text-sm text-muted">One empty page. Add pages, text and data in the editor.</p>
          </>
        ) : selected ? (
          <>
            <TemplateThumb format={selected.format} title={selected.name} kind={selected.kind} />
            <p className="font-medium text-ink">{selected.name}</p>
            <p className="text-sm text-muted">{formatLine(selected.format, selected.pageCount)}</p>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-muted">Data</dt>
                <dd className="text-ink">{state.kind === "ghg" ? "Approved emission entries" : "Approved KPI values"}, {periodLabel(state.yearType, state.year)}</dd>
              </div>
              {selected.tags.length > 0 && (
                <div>
                  <dt className="text-muted">Tags</dt>
                  <dd className="flex flex-wrap gap-1">{selected.tags.map((tag) => <Badge key={tag} tone="neutral">{tag}</Badge>)}</dd>
                </div>
              )}
            </dl>
          </>
        ) : (
          <p className="text-sm text-muted">Pick a template to see what it holds.</p>
        )}
        {state.kind === "ghg" && (
          <Callout tone="info">Market-based Scope 2 isn't recorded in ESGLite yet. The report will say “Not reported” and flag it for review.</Callout>
        )}
      </aside>
    </div>
  );
}

function ScopeStep({ state, set }: StepProps) {
  const sites = useSessionSites();
  const years = yearOptions(state.yearType);
  const yearList = years.includes(state.year) ? years : [state.year, ...years];
  const toggleSite = (id: number) => {
    const current = state.sites === "all" ? [] : state.sites;
    const next = current.includes(id) ? current.filter((s) => s !== id) : [...current, id];
    set({ sites: next.length ? next : "all" });
  };
  const toggleFramework = (f: FrameworkCode) => set({ frameworks: state.frameworks.includes(f) ? state.frameworks.filter((x) => x !== f) : [...state.frameworks, f] });
  return (
    <div className={cn(panel, "grid gap-6 p-4 md:grid-cols-2")}>
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-ink">Period</legend>
        <SegmentedControl
          label="Year type"
          value={state.yearType}
          onChange={(yearType) => set({ yearType })}
          options={[
            { value: "FY", label: "Financial year (Apr–Mar)" },
            { value: "CY", label: "Calendar year" },
          ]}
        />
        <Select label="Year" value={state.year} onChange={(year) => year !== null && set({ year, compareYear: state.compareYear !== null && state.compareYear >= year ? null : state.compareYear })} options={yearList.map((y) => ({ value: y, label: periodLabel(state.yearType, y) }))} />
        <Select
          label="Compare with"
          value={state.compareYear ?? 0}
          onChange={(v) => set({ compareYear: v ? Number(v) : null })}
          options={[{ value: 0, label: "The year before (default)" }, ...yearList.filter((y) => y < state.year).map((y) => ({ value: y, label: periodLabel(state.yearType, y) }))]}
        />
      </fieldset>
      <div className="space-y-5">
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-ink">Sites</legend>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="radio" name="sites" className="size-4 accent-accent" checked={state.sites === "all"} onChange={() => set({ sites: "all" })} />
            All sites
          </label>
          {sites.length > 1 &&
            sites.map((s) => (
              <label key={s.site_id} className="flex items-center gap-2 pl-6 text-sm text-ink">
                <input type="checkbox" className="size-4 accent-accent" checked={state.sites !== "all" && state.sites.includes(s.site_id)} onChange={() => toggleSite(s.site_id)} />
                {s.name}
              </label>
            ))}
          {state.sites !== "all" && sites.length <= 1 && <p className="pl-6 text-sm text-muted">{state.sites.length} site{state.sites.length === 1 ? "" : "s"} from the GHG report.</p>}
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold text-ink">Frameworks</legend>
          {FRAMEWORKS_BY_KIND[state.kind].map((f) => (
            <label key={f} className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" className="size-4 accent-accent" checked={state.frameworks.includes(f)} onChange={() => toggleFramework(f)} />
              {FRAMEWORK_LABELS[f]}
            </label>
          ))}
          {state.frameworks.length === 0 && <p className="text-sm text-bad">Pick at least one framework.</p>}
        </fieldset>
      </div>
    </div>
  );
}

function DetailsStep({ state, set }: StepProps) {
  const companyId = useStudioCompanyId();
  const scope = { kind: state.kind, year: state.year, yearType: state.yearType, sites: state.sites };
  const prefill = useQuery({ queryKey: ["studio", "inputs", "prefill", companyId, scope], queryFn: () => getInputsPrefill(scope, companyId), staleTime: 60_000 });
  return (
    <div className={cn(panel, "p-4")}>
      {prefill.isError && <Callout tone="warn">We couldn't read what your company settings already say. You can still type the details.</Callout>}
      <ReportDetailsForm kind={state.kind} stored={state.inputs} prefill={prefill.data?.prefill ?? {}} loading={prefill.isPending} onChange={(inputs) => set({ inputs })} />
    </div>
  );
}

function WordsStep({ state, set }: StepProps) {
  const kit = useBrandKit();
  const voice = kit.data?.voice?.trim();
  const leadership = (state.inputs.leadership_message?.value as string | undefined) ?? "";
  return (
    <div className={cn(panel, "space-y-5 p-4")}>
      <TextField label="Design name" help={`Leave empty for the template name and ${periodLabel(state.yearType, state.year)}.`} value={state.title} onChange={(title) => set({ title })} maxLength={200} />
      <Toggle label="Write text with AI" help="AI drafts the summaries in your brand voice. Every draft is a suggestion until someone accepts it." checked={state.ai} onChange={(ai) => set({ ai })} inlineLabel={state.ai ? "On" : "Off"} />
      <div className="rounded-control bg-tint p-3 text-sm">
        <p className="font-medium text-ink">Brand voice</p>
        <p className="mt-1 text-muted">{voice ? `“${voice.length > 240 ? `${voice.slice(0, 240)}…` : voice}”` : "Plain, factual, third person (the default). Managers can set a voice in the brand kit."}</p>
      </div>
      {state.kind === "sustainability" && (
        <Textarea
          label="Leadership message"
          help="The signatory confirms it before the final."
          rows={5}
          value={leadership}
          onChange={(v) =>
            set({
              inputs: v.trim()
                ? { ...state.inputs, leadership_message: { value: v, source: "typed", updatedBy: null, updatedAt: new Date().toISOString() } }
                : Object.fromEntries(Object.entries(state.inputs).filter(([k]) => k !== "leadership_message")),
            })
          }
        />
      )}
      <p className="text-sm text-muted">Add a cover photo from Uploads in the editor.</p>
    </div>
  );
}

const STEP_ICON: Record<BuildStep["state"], typeof Circle> = { pending: Circle, running: Loader2, done: CheckCircle2, skipped: MinusCircle, failed: XCircle };

/** The build: a progress list polled from GET /docs/:id?build=1, then the editor. */
function BuildView({ id, onRetry }: { id: number; onRetry: () => void }) {
  const navigate = useNavigate();
  const build = useDocBuild(id);
  const progress = build.data?.build ?? null;
  useEffect(() => {
    if (progress?.state === "done") navigate(`/studio/${id}`, { replace: true });
  }, [progress?.state, id, navigate]);
  return (
    <div className="mx-auto max-w-xl space-y-5 py-6">
      <PageHeader title="Building your design" description={build.data?.title} />
      <section className={cn(panel, "p-4")} aria-live="polite" aria-label="Build progress" data-testid="build-progress">
        {!progress ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <ol className="space-y-2">
            {progress.steps.map((s) => {
              const Icon = STEP_ICON[s.state];
              return (
                <li key={s.id} className="flex items-start gap-2 text-sm" data-state={s.state}>
                  <Icon aria-hidden className={cn("mt-0.5 size-4 shrink-0", s.state === "done" ? "text-good" : s.state === "failed" ? "text-bad" : s.state === "running" ? "animate-spin text-brand-text" : "text-muted")} />
                  <span>
                    <span className={cn(s.state === "pending" || s.state === "skipped" ? "text-muted" : "text-ink")}>
                      {s.label}
                      {s.state === "running" ? "…" : ""}
                    </span>
                    {s.note && <span className="block text-xs text-muted">{s.note}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
        {progress?.state === "failed" && (
          <Callout tone="warn" title="The design couldn't be built" action={<Button onClick={onRetry}>Back to the details</Button>}>
            {progress.error?.message ?? "Try again in a moment."}
          </Callout>
        )}
        {build.isError && <p className="text-sm text-bad">{docErrorMessage(build.error, "We lost track of the build. Open Design Studio to find the design.")}</p>}
      </section>
    </div>
  );
}
