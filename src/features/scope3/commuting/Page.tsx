import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Download } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { useClientContext } from "../../../lib/clientContext";
import { categoryLabel } from "../../../lib/scope3/contracts";
import { Button, Callout, EmptyState, FileDrop, type FileDropItem, NumberField, PageHeader, SegmentedControl, Select, YearPicker, cn, exportMatrix, focusRing, panel, useToast } from "../../../ui";
import { errorMessage, useCommitPlan, useCommutingSites, usePlanSurvey } from "./api";
import { ModePreview } from "./components/ModePreview";
import { PlanReview } from "./components/PlanReview";
import { SURVEY_HEADERS, TEMPLATE_ROWS, commitKey, parseSurvey, previewSurvey, type ParsedSurvey } from "./logic";

type YearType = "CY" | "FY";
const YEAR_TYPE_OPTIONS = [
  { value: "CY" as const, label: "Calendar year" },
  { value: "FY" as const, label: "Financial year" },
];

/** First sheet of a CSV or Excel file as rows of cells. xlsx is loaded only when needed. */
async function readTable(file: File): Promise<unknown[][]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array" });
  const first = wb.SheetNames[0];
  return first ? XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[first], { header: 1, blankrows: false, defval: "" }) : [];
}

/**
 * S3-9 `/settings/scope3/commuting`: the yearly commuting survey. A Manager
 * (or above) uploads the sample, sees the km by mode, and creates an import
 * plan with one Category 7 row per mode; the engine scales the sample to the
 * headcount and calculates each row. Answers are not stored.
 */
export default function CommutingPage() {
  const { role } = useAuth();
  const isStaff = role === "Superadmin";
  const { clientId } = useClientContext();
  const companyId = isStaff ? clientId : null;
  const ready = !isStaff || clientId !== null;
  const { toast } = useToast();
  const thisYear = new Date().getFullYear();

  // Site and year live in the URL so a link opens the same survey.
  const [params, setParams] = useSearchParams();
  const setParam = (key: string, value: string | null) =>
    setParams(
      (p) => {
        const next = new URLSearchParams([...p].filter(([k]) => k !== key));
        if (value) next.set(key, value);
        return next;
      },
      { replace: true },
    );
  const year = Number(params.get("year")) || thisYear - 1;
  const [yearType, setYearType] = useState<YearType>("CY");
  const [employees, setEmployees] = useState<number | null>(null);
  const [items, setItems] = useState<FileDropItem[]>([]);
  const [parsed, setParsed] = useState<ParsedSurvey | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);

  const sites = useCommutingSites(companyId, ready);
  const plan = usePlanSurvey(companyId);
  const commit = useCommitPlan();
  const siteOptions = (sites.data?.sites ?? []).map((s) => ({ value: s.site_id, label: s.name }));
  const siteParam = Number(params.get("site"));
  const siteId = siteOptions.some((o) => o.value === siteParam) ? siteParam : siteOptions.length === 1 ? siteOptions[0].value : null;

  const reset = () => {
    plan.reset();
    commit.reset();
  };

  const onFile = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    reset();
    setItems([{ id: `${file.name}-${file.size}`, file }]);
    setReadError(null);
    try {
      setParsed(parseSurvey(await readTable(file)));
    } catch {
      setParsed(null);
      setReadError("Couldn't read the file. Save it as CSV or Excel (.xlsx) and try again.");
    }
  };

  const responses = parsed && !parsed.missing.length && !parsed.errors.length ? parsed.responses : [];
  const preview = responses.length ? previewSurvey(responses) : null;
  const employeesError = employees !== null && preview && employees < preview.respondents ? "Total employees is lower than the number of people in the survey." : undefined;

  const onPlan = () => {
    setTried(true);
    if (siteId === null || !employees || !preview || employeesError) return;
    commit.reset();
    plan.mutate({ site_id: siteId, year, year_type: yearType, total_employees: employees, responses });
  };

  const p = plan.data?.plan ?? null;
  const onImport = () => {
    if (!p) return;
    commit.mutate(
      { planId: p.plan_id, version: p.version, key: commitKey(p.plan_id, p.version) },
      {
        onSuccess: (c) => {
          const n = c.committed?.inserted ?? p.counts.ready;
          toast({ title: `${n} ${n === 1 ? "row" : "rows"} imported as Pending`, tone: "good" });
          setItems([]);
          setParsed(null);
          reset();
        },
      },
    );
  };

  const header = (
    <PageHeader
      title="Commuting survey"
      description={`Upload this year's commuting survey. ESGLite scales the sample to your headcount and makes one ${categoryLabel(7)} row per mode for review.`}
      secondaryActions={[{ label: "Download template", icon: <Download size={16} aria-hidden />, onClick: () => void exportMatrix([[...SURVEY_HEADERS], ...TEMPLATE_ROWS], "commuting-survey-template", "csv") }]}
    />
  );

  if (!ready)
    return (
      <div className="space-y-6">
        {header}
        <Callout tone="warn" title="Pick a client first">
          Choose a client with the switcher at the top; surveys are imported per client.
        </Callout>
      </div>
    );

  if (sites.isSuccess && siteOptions.length === 0)
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          title={`No site has ${categoryLabel(7)}.`}
          description={
            <Link to="/settings/scope3" className={cn(focusRing, "rounded-control text-sm font-medium text-brand underline-offset-2 hover:underline")}>
              Check it on Scope 3 boundary
            </Link>
          }
        />
      </div>
    );

  return (
    <div className="space-y-6">
      {header}

      <section className={cn(panel, "grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4")} aria-label="Survey details">
        <Select<number>
          label="Site"
          value={siteId}
          options={siteOptions}
          onChange={(v) => {
            setParam("site", v ? String(v) : null);
            reset();
          }}
          placeholder="Choose a site"
          loading={sites.isLoading}
          required
          error={sites.isError ? errorMessage(sites.error, "Couldn't load your sites.") : tried && siteId === null ? "Choose the site the rows go to." : undefined}
        />
        <YearPicker
          label="Reporting year"
          value={year}
          onChange={(v) => {
            setParam("year", v ? String(v) : null);
            reset();
          }}
          yearType={yearType}
          from={2018}
          to={thisYear + 1}
          required
        />
        <SegmentedControl<YearType>
          label="Year type"
          options={YEAR_TYPE_OPTIONS}
          value={yearType}
          onChange={(v) => {
            setYearType(v);
            reset();
          }}
          size="sm"
          className="self-end"
        />
        <NumberField
          label="Total employees"
          help="Everyone the survey stands for."
          value={employees}
          onChange={(v) => {
            setEmployees(v);
            reset();
          }}
          min={1}
          step={1}
          required
          error={employeesError ?? (tried && !employees ? "Enter the headcount." : undefined)}
        />
      </section>

      <FileDrop
        label="Survey file"
        help="CSV or Excel with Ref, Mode, One-way km, Days per week and Weeks per year. Use a code for each person, never a name."
        accept={[".csv", ".xlsx", ".xls", "text/csv"]}
        maxSize={10 * 1024 * 1024}
        multiple={false}
        items={items}
        onAdd={(files) => void onFile(files)}
        onRemove={() => {
          setItems([]);
          setParsed(null);
          reset();
        }}
      />

      {readError && <Callout tone="warn">{readError}</Callout>}
      {parsed?.missing.length ? (
        <Callout tone="warn" title="The sheet is missing columns">
          Add {parsed.missing.join(", ")}, or start from the template.
        </Callout>
      ) : null}
      {parsed && parsed.errors.length > 0 && (
        <Callout tone="warn" title={`${parsed.errors.length} ${parsed.errors.length === 1 ? "problem" : "problems"} in the sheet`}>
          <ul className="list-disc pl-5">
            {parsed.errors.slice(0, 10).map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Callout>
      )}
      {parsed && !parsed.missing.length && !parsed.errors.length && !parsed.responses.length && <Callout tone="warn">The sheet has no responses.</Callout>}

      {preview && (
        <section className={cn(panel, "space-y-4 p-4")}>
          <ModePreview preview={preview} totalEmployees={employees} />
          {!plan.data && (
            <div className="flex justify-end">
              <Button variant="primary" onClick={onPlan} loading={plan.isPending}>
                Create import plan
              </Button>
            </div>
          )}
          {plan.isError && (
            <p role="alert" className="text-sm text-bad">
              Couldn't make the plan. {errorMessage(plan.error, "Try again.")}
            </p>
          )}
          {plan.data && (
            <PlanReview result={plan.data} importing={commit.isPending} importError={commit.isError ? errorMessage(commit.error, "The rows weren't imported. Try again.") : null} onImport={onImport} />
          )}
        </section>
      )}
    </div>
  );
}
