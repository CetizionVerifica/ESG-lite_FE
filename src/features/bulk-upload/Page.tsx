import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { Callout, type HeaderAction, PageHeader, Stepper, exportMatrix, useToast } from "../../ui";
import { type PreviewArgs, errorMessage, useCompanySites, useFormConfig, useImportRows, usePreview, useSheetCategories, useSites, useUploadFile } from "./api";
import { HistoricalImport } from "./components/HistoricalImport";
import { ImportStep, type ImportState } from "./components/ImportStep";
import { MapStep } from "./components/MapStep";
import { PreviewStep } from "./components/PreviewStep";
import { UploadStep } from "./components/UploadStep";
import { SmartImportFlow } from "./components/smart/SmartImportFlow";
import { useUploadContext } from "./hooks/useUploadContext";
import { smartImportEnabled } from "./smart/logic";
import { type ImportResult, type MapField, STEPS, autoMap, buildFields, contributorSites, fileProblem, mappingsFor, monthEndDate, sessionCompany, setHeader, skippedMatrix, toggleSkip, withClientSites } from "./logic";
import { useCalcDetailForSite } from "../../lib/useCalcDetail";

type Sheet = { documentId: number; headers: string[]; fileName: string };

const rowsText = (n: number) => `${n} ${n === 1 ? "row" : "rows"}`;

type Mode = "smart" | "manual" | "historical";

/**
 * P27 `/capture/upload`: upload a sheet, map its columns, preview the
 * calculation and import the rows as pending entries. A Superadmin picks any
 * client's site and also has the historical import (`?mode=historical`); a
 * contributor, coming from Add data, uploads for their own sites only.
 *
 * Smart import (XI4, `?mode=smart`): Managers, Admins and Superadmins drop any
 * workbook for one site and confirm what the app worked out. It is the default
 * when the client's switch (`company.ai_import_enabled`) is on; `?mode=manual`
 * keeps the column mapper. Users keep the contributor path.
 */
export default function BulkUploadPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user, role } = useAuth();
  const contributor = role !== "Superadmin";
  // Set while a historical import is saving: leaving the screen then would lose its result.
  const [historicalBusy, setHistoricalBusy] = useState(false);
  const [ctx, setCtx] = useUploadContext();

  const allSites = useSites(!contributor);
  const sessionSites = useMemo(() => contributorSites(user), [user]);
  // An Admin may import into every site of their client; the session user carries only their own site.
  const companySites = useCompanySites(role === "Admin");
  const ownSites = useMemo(() => withClientSites(sessionSites, companySites.data, sessionCompany(user)), [sessionSites, companySites.data, user]);
  const siteList = contributor
    ? { data: ownSites, loading: false, error: null, retry: () => undefined }
    : { data: allSites.data ?? [], loading: allSites.isLoading, error: allSites.error ? errorMessage(allSites.error, "Try again in a moment.") : null, retry: () => void allSites.refetch() };

  // Smart import: never for a User; for a Manager or Admin only when their client's switch is on;
  // a Superadmin always has the mode, and it is the default once a client with the switch on is chosen.
  const smartOffered = role === "Superadmin" || ((role === "Manager" || role === "Admin") && smartImportEnabled(ownSites));
  const smartOff = (role === "Manager" || role === "Admin") && !smartImportEnabled(ownSites);
  const clientEnabled = contributor || ctx.clientId === null ? null : smartImportEnabled((allSites.data ?? []).filter((s) => s.company?.company_id === ctx.clientId));
  const smartDefault = smartOffered && (contributor || clientEnabled === true);
  const requested = ctx.mode;
  const mode: Mode =
    requested === "historical" && !contributor ? "historical" : requested === "smart" && smartOffered ? "smart" : requested === "manual" || !smartDefault ? "manual" : "smart";
  const historical = mode === "historical";
  // Set while a smart import runs or has finished: switching mode then would lose its result.
  const [smartLocked, setSmartLocked] = useState(false);

  // A manager with one site doesn't need to pick it.
  useEffect(() => {
    const smartSites = ownSites.filter((s) => s.company?.ai_import_enabled === true);
    if (mode === "smart" && contributor && ctx.siteId === null && smartSites.length === 1) setCtx({ siteId: smartSites[0].site_id, clientId: smartSites[0].company?.company_id ?? null });
    // ctx and setCtx read the URL; the first render after it settles is enough.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, contributor, ownSites.length]);
  const form = useFormConfig(ctx.siteId, ctx.categoryId, contributor);
  // SE-1: a User's manual upload shows entered values and tCO₂e only.
  const detail = useCalcDetailForSite(ctx.siteId);
  const upload = useUploadFile();

  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [fields, setFields] = useState<MapField[]>([]);
  // Categories the user unticked; everything else in the sheet is imported.
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [previewArgs, setPreviewArgs] = useState<PreviewArgs | null>(null);
  const [importState, setImportState] = useState<ImportState | null>(null);
  const backgrounded = useRef(false);
  // The plan of the last preview of this upload, cancelled when a new preview is made.
  const lastPlan = useRef<string | null>(null);

  const mappings = useMemo(() => mappingsFor(fields), [fields]);
  const sheetCategories = useSheetCategories(sheet?.documentId ?? null, mappings);
  const categoryList = sheetCategories.data?.unique_categories ?? null;
  const selected = useMemo(() => new Set((categoryList ?? []).filter((c) => !excluded.has(c))), [categoryList, excluded]);
  const preview = usePreview(previewArgs, lastPlan);

  const onDone = (result: ImportResult) => {
    // Committed: nothing to cancel if the user previews again.
    lastPlan.current = null;
    setImportState({ status: "done", result });
    if (backgrounded.current) {
      toast({
        title: "Bulk upload finished",
        description: `Imported ${rowsText(result.inserted)}${result.skipped ? `, skipped ${result.skipped}` : ""}. They're waiting for approval.`,
        tone: "good",
      });
    }
  };
  const onFail = (message: string, planChanged: boolean) => {
    setImportState({ status: "error", message, planChanged });
    if (backgrounded.current) toast({ title: "Bulk upload didn't finish", description: message, tone: "bad" });
  };
  const importRows = useImportRows(onDone, onFail);

  const changeContext = (patch: Parameters<typeof setCtx>[0]) => {
    setCtx(patch);
    // A new site or category means a different form: the sheet is mapped again.
    if ("siteId" in patch || "categoryId" in patch || "clientId" in patch) setSheet(null);
  };

  const chooseFile = (next: File | null) => {
    upload.reset();
    setSheet(null);
    setFile(next);
    setFileError(next ? fileProblem(next) : null);
  };

  const uploadSheet = () => {
    if (!file || fileError) return;
    upload.mutate(file, {
      onSuccess: (res) => {
        setSheet({ documentId: res.document_id, headers: res.headers ?? [], fileName: file.name });
        setFields(autoMap(buildFields(form.data ?? null), res.headers ?? []));
        setExcluded(new Set());
        setStep(1);
      },
    });
  };

  const toPreview = () => {
    if (!sheet || ctx.siteId === null || ctx.categoryId === null) return;
    const all = !categoryList || categoryList.every((c) => selected.has(c));
    setPreviewArgs({
      documentId: sheet.documentId,
      mappings,
      // An empty list means every category, which also covers rows whose category cell is blank.
      categories: all ? [] : [...selected],
      siteId: ctx.siteId,
      categoryId: ctx.categoryId,
      date: monthEndDate(ctx.month),
    });
    setStep(2);
  };

  const runImport = () => {
    const plan = preview.data?.plan;
    if (!previewArgs || !plan?.plan_id) return;
    backgrounded.current = false;
    setImportState({ status: "running" });
    setStep(3);
    importRows.mutate({ args: previewArgs, plan: { plan_id: plan.plan_id, version: plan.version } });
  };

  // After a failed import the plan may have changed (rows re-checked): preview afresh.
  const backToPreview = () => {
    setImportState(null);
    setStep(2);
    void preview.refetch();
  };

  const startAgain = () => {
    setStep(0);
    setFile(null);
    setFileError(null);
    setSheet(null);
    setFields([]);
    setExcluded(new Set());
    setPreviewArgs(null);
    setImportState(null);
    lastPlan.current = null;
    upload.reset();
    importRows.reset();
  };

  const toggleCategory = (name: string) =>
    setExcluded((prev) => (prev.has(name) ? new Set([...prev].filter((c) => c !== name)) : new Set([...prev, name])));
  const toggleAll = () => setExcluded(categoryList && selected.size === categoryList.length ? new Set(categoryList) : new Set());

  const result = importState?.status === "done" ? importState.result : null;
  const skipped = result ? skippedMatrix(result, preview.data?.rows ?? []) : null;
  const downloadSkipped = () => {
    if (skipped) void exportMatrix(skipped.matrix, `skipped-rows-${sheet?.fileName.replace(/\.[^.]+$/, "") ?? "upload"}`, "csv");
  };

  const completed = STEPS.slice(0, step).map((s) => s.id);
  const locked = importState !== null;

  // The mode is written out in full, so it sticks when the client changes.
  const switchMode = (to: Mode) => setCtx({ mode: to, categoryId: null });

  const headerActions: HeaderAction[] = [];
  if (!locked && !smartLocked && !historicalBusy) {
    if (smartOffered && mode !== "smart") headerActions.push({ label: "Smart import", onClick: () => switchMode("smart") });
    if (smartOffered && mode === "smart") headerActions.push({ label: "Manual upload", onClick: () => switchMode("manual") });
    if (!contributor) headerActions.push({ label: historical ? "Back to bulk upload" : "Historical import", onClick: () => switchMode(historical ? (smartDefault ? "smart" : "manual") : "historical") });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={historical ? "Historical import" : mode === "smart" ? "Smart import" : "Bulk upload"}
        description={
          historical
            ? "Import a sheet in the old year and month format for one site and category. Rows are saved as Pending."
            : mode === "smart"
              ? "Drop any workbook for one site. The app works out the sheets, columns, periods and activities; you confirm, review the rows and import them as Pending."
              : "Import a sheet of emission rows for one site and category. Rows are saved as Pending for the site's manager to approve."
        }
        secondaryActions={headerActions}
      />
      {mode === "smart" ? (
        <SmartImportFlow
          ctx={ctx}
          onContext={(p) => setCtx(!contributor && "clientId" in p ? { ...p, mode: "smart" } : p)}
          sites={siteList}
          contributor={contributor}
          clientEnabled={clientEnabled}
          canReview={role === "Manager"}
          onUseManual={() => switchMode("manual")}
          onLocked={setSmartLocked}
        />
      ) : historical ? (
        <section aria-label="Historical import" className="rounded-card border border-line bg-panel p-4 sm:p-5">
          <HistoricalImport ctx={ctx} onContext={setCtx} sites={siteList} onBusy={setHistoricalBusy} />
        </section>
      ) : (
        <>
      {smartOff && (
        <Callout tone="info" title="Smart import is off for your organisation">
          With it on, you can drop any workbook and the app works out the mapping. ESGLite staff turn it on per client.
        </Callout>
      )}
      <Stepper
        label="Bulk upload steps"
        steps={STEPS.map((s) => ({ id: s.id, label: s.label }))}
        current={step}
        completed={importState?.status === "done" ? STEPS.map((s) => s.id) : completed}
        canJump={(i) => !locked && i < step}
        onStepChange={setStep}
      />

      <section aria-label={STEPS[step].label} className="rounded-card border border-line bg-panel p-4 sm:p-5">
        {step === 0 && (
          <UploadStep
            ctx={ctx}
            onContext={changeContext}
            sites={siteList}
            contributor={contributor}
            form={{ data: form.data, loading: form.isLoading, error: form.error ? errorMessage(form.error, "Try again in a moment.") : null }}
            file={file}
            onFile={chooseFile}
            uploading={upload.isPending}
            error={fileError ?? (upload.error ? errorMessage(upload.error, "The file couldn't be uploaded. Try again.") : null)}
            onNext={uploadSheet}
            detail={detail}
          />
        )}
        {step === 1 && sheet && (
          <MapStep
            fileName={sheet.fileName}
            headers={sheet.headers}
            fields={fields}
            onHeader={(key, header) => setFields((f) => setHeader(f, key, header))}
            onSkip={(key) => setFields((f) => toggleSkip(f, key))}
            categories={{
              list: categoryList,
              totalRows: sheetCategories.data?.total_rows ?? null,
              loading: sheetCategories.isFetching,
              error: sheetCategories.error ? errorMessage(sheetCategories.error, "Try again in a moment.") : null,
              retry: () => void sheetCategories.refetch(),
            }}
            selected={selected}
            onToggleCategory={toggleCategory}
            onToggleAll={toggleAll}
            onBack={() => setStep(0)}
            onNext={toPreview}
            detail={detail}
          />
        )}
        {step === 2 && (
          <PreviewStep
            plan={preview.data?.plan ?? null}
            rows={preview.data?.rows ?? null}
            total={preview.data?.total ?? null}
            loading={preview.isFetching}
            error={preview.error ? errorMessage(preview.error, "The preview didn't load. Try again.") : null}
            onRetry={() => void preview.refetch()}
            onBack={() => setStep(1)}
            onImport={runImport}
            detail={detail}
          />
        )}
        {step === 3 && importState && (
          <ImportStep
            detail={detail}
            state={importState}
            total={preview.data?.plan.counts.ready ?? 0}
            skippedFile={skipped ? { partial: skipped.partial } : null}
            onDownloadSkipped={downloadSkipped}
            onBackground={() => {
              backgrounded.current = true;
              toast({ title: "Import running in the background", description: "You'll get a message here when it's done." });
              navigate("/");
            }}
            onRetry={runImport}
            onBack={backToPreview}
            onAnother={startAgain}
          />
        )}
      </section>
        </>
      )}
    </div>
  );
}
