import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, ChevronRight } from "lucide-react";
import { Button, Callout, Modal, PageHeader, Stepper, cn, focusRing, useToast, useUnsavedGuard } from "../../ui";
import { type OnboardResult, errorMessage, useOnboard, useReportingCalendar } from "./api";
import { AccessStep, AdminStep, BrandStep, CompanyStep, ReviewStep } from "./components/OnboardSteps";
import { EMPTY_ONBOARD, type OnboardDraft, type OnboardField, STEPS, firstInvalidStep, isOnboardDirty, skipBrand, validateStep } from "./onboarding";

/** P17 `/clients/new`: onboard a client in four steps plus a review. */
export default function OnboardPage() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const calendar = useReportingCalendar();
  const onboard = useOnboard();
  const [draft, setDraft] = useState<OnboardDraft>(EMPTY_ONBOARD);
  const [current, setCurrent] = useState(0);
  const [completed, setCompleted] = useState<string[]>([]);
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<OnboardResult | null>(null);
  const headingRef = useRef<HTMLDivElement>(null);

  const blocker = useUnsavedGuard(isOnboardDirty(draft) && !result && !onboard.isPending);
  const step = STEPS[current];
  const errors = validateStep(step.id, draft);
  const set = <K extends OnboardField>(k: K, v: OnboardDraft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const error = (k: OnboardField) => (touched.has(step.id) ? errors[k] : undefined);

  const go = (i: number) => {
    setCurrent(i);
    headingRef.current?.focus();
  };
  const next = () => {
    setTouched((t) => new Set(t).add(step.id));
    if (Object.keys(errors).length) return;
    setCompleted((c) => (c.includes(step.id) ? c : [...c, step.id]));
    go(current + 1);
  };
  const create = () => {
    const bad = firstInvalidStep(draft);
    if (bad) {
      setTouched((t) => new Set(t).add(bad));
      go(STEPS.findIndex((s) => s.id === bad));
      return;
    }
    onboard.mutate(draft, {
      onSuccess: (r) => {
        setResult(r);
        toast({ title: `${r.companyName} onboarded`, tone: "good" });
      },
    });
  };

  if (result) return <Success result={result} />;

  const isReview = step.id === "review";
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Onboard client" description="Company, its admin user, access and brand. You can change any of it later." />
      <Stepper label="Onboarding steps" steps={[...STEPS]} current={current} completed={completed} onStepChange={go} />
      <div ref={headingRef} tabIndex={-1} className="focus:outline-none">
        <h2 className="text-lg font-semibold text-ink">{isReview ? "Review and create" : step.label}</h2>
      </div>
      {onboard.error && (
        <Callout tone="warn" title="The client wasn't created">
          {errorMessage(onboard.error, "Nothing was saved. Try again.")}
        </Callout>
      )}
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (isReview) create();
          else next();
        }}
        className="space-y-6"
      >
        {step.id === "company" && <CompanyStep draft={draft} set={set} error={error} />}
        {step.id === "admin" && <AdminStep draft={draft} set={set} error={error} />}
        {step.id === "access" && <AccessStep draft={draft} set={set} error={error} calendar={{ rule: calendar.data?.fiscalYearRule ?? null, loading: calendar.isPending }} />}
        {step.id === "brand" && <BrandStep draft={draft} set={set} error={error} onSkip={() => setDraft(skipBrand)} />}
        {isReview && <ReviewStep draft={draft} onEdit={go} />}
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <Button onClick={() => navigate("/clients")} disabled={onboard.isPending}>
            Cancel
          </Button>
          <div className="ml-auto flex gap-2">
            {current > 0 && (
              <Button onClick={() => go(current - 1)} disabled={onboard.isPending}>
                Back
              </Button>
            )}
            <Button type="submit" variant="primary" loading={onboard.isPending}>
              {isReview ? "Create client" : "Continue"}
            </Button>
          </div>
        </div>
      </form>
      <Modal
        open={blocker.state === "blocked"}
        onClose={() => blocker.reset?.()}
        title="Leave without creating the client?"
        description="What you've entered will be lost."
        tone="destructive"
        cancelLabel="Stay"
        primaryAction={{ label: "Leave", onClick: () => blocker.proceed?.() }}
      />
    </div>
  );
}

function Success({ result }: { result: OnboardResult }) {
  const id = result.companyId;
  const steps = [
    { label: "Add sites", detail: "A main site was created; add the others.", to: `/setup/sites?client=${id}&open=new` },
    { label: "Assign categories", detail: "Pick what each site reports.", to: `/setup/sites?client=${id}` },
    { label: "Configure capture", detail: "Set up the columns people fill in.", to: "/capture/forms" },
    { label: "Load factors", detail: "Add the emission factors the sites need.", to: "/factors" },
  ];
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-start gap-3">
        <CheckCircle2 aria-hidden className="mt-1 size-6 shrink-0 text-good" />
        <div>
          <h1 className="text-xl font-semibold text-ink">{result.companyName} is onboarded</h1>
          <p className="text-sm text-muted">Its company admin can sign in now. Next steps:</p>
        </div>
      </div>
      {result.warnings.length > 0 && (
        <Callout tone="warn" title="Some brand details weren't saved">
          <ul className="list-disc pl-5">
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Callout>
      )}
      <ol className="divide-y divide-line rounded-control border border-line">
        {steps.map((s, i) => (
          <li key={s.label}>
            <Link to={s.to} className={cn("flex items-center gap-3 px-4 py-3 hover:bg-tint", focusRing)}>
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-tint text-xs font-semibold text-brand-text">{i + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-ink">{s.label}</span>
                <span className="block text-xs text-muted">{s.detail}</span>
              </span>
              <ChevronRight aria-hidden className="size-4 text-muted" />
            </Link>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Link to={`/clients/${id}`} className={cn("inline-flex h-9 items-center rounded-control bg-brand px-3.5 text-sm font-medium text-on-brand hover:opacity-90", focusRing)}>
          Open client
        </Link>
        <Link to="/clients" className={cn("inline-flex h-9 items-center rounded-control border border-line bg-panel px-3.5 text-sm font-medium text-ink hover:bg-tint", focusRing)}>
          Back to clients
        </Link>
      </div>
    </div>
  );
}
