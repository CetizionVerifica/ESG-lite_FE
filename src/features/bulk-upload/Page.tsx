import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { PageHeader, Stepper, exportMatrix, useToast } from "../../ui";
import { type PreviewArgs, errorMessage, useFormConfig, useImportRows, usePreview, useSheetCategories, useSites, useUploadFile } from "./api";
import { ImportStep, type ImportState } from "./components/ImportStep";
import { MapStep } from "./components/MapStep";
import { PreviewStep } from "./components/PreviewStep";
import { UploadStep } from "./components/UploadStep";
import { useUploadContext } from "./hooks/useUploadContext";
import { type ImportResult, type MapField, STEPS, autoMap, buildFields, fileProblem, mappingsFor, monthEndDate, setHeader, skippedMatrix, toggleSkip } from "./logic";

type Sheet = { documentId: number; headers: string[]; fileName: string };

const rowsText = (n: number) => `${n} ${n === 1 ? "row" : "rows"}`;

/** P27 `/capture/upload`: upload a sheet, map its columns, preview the calculation and import the rows as pending entries. */
export default function BulkUploadPage() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [ctx, setCtx] = useUploadContext();

  const sites = useSites();
  const form = useFormConfig(ctx.siteId, ctx.categoryId);
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

  const mappings = useMemo(() => mappingsFor(fields), [fields]);
  const sheetCategories = useSheetCategories(sheet?.documentId ?? null, mappings);
  const categoryList = sheetCategories.data?.unique_categories ?? null;
  const selected = useMemo(() => new Set((categoryList ?? []).filter((c) => !excluded.has(c))), [categoryList, excluded]);
  const preview = usePreview(previewArgs);

  const onDone = (result: ImportResult) => {
    setImportState({ status: "done", result });
    if (backgrounded.current) {
      toast({
        title: "Bulk upload finished",
        description: `Imported ${rowsText(result.inserted)}${result.skipped ? `, skipped ${result.skipped}` : ""}. They're waiting for approval.`,
        tone: "good",
      });
    }
  };
  const onFail = (message: string) => {
    setImportState({ status: "error", message });
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
    if (!previewArgs) return;
    backgrounded.current = false;
    setImportState({ status: "running" });
    setStep(3);
    importRows.mutate({ args: previewArgs, userId: user?.user_id });
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

  return (
    <div className="space-y-5">
      <PageHeader title="Bulk upload" description="Import a sheet of emission rows for one site and category. Rows are saved as Pending for the site's manager to approve." />
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
            sites={{ data: sites.data ?? [], loading: sites.isLoading, error: sites.error ? errorMessage(sites.error, "Try again in a moment.") : null, retry: () => void sites.refetch() }}
            form={{ data: form.data, loading: form.isLoading, error: form.error ? errorMessage(form.error, "Try again in a moment.") : null }}
            file={file}
            onFile={chooseFile}
            uploading={upload.isPending}
            error={fileError ?? (upload.error ? errorMessage(upload.error, "The file couldn't be uploaded. Try again.") : null)}
            onNext={uploadSheet}
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
          />
        )}
        {step === 2 && (
          <PreviewStep
            rows={preview.data?.rows ?? null}
            total={preview.data?.total ?? null}
            loading={preview.isFetching}
            error={preview.error ? errorMessage(preview.error, "The preview didn't load. Try again.") : null}
            onRetry={() => void preview.refetch()}
            onBack={() => setStep(1)}
            onImport={runImport}
          />
        )}
        {step === 3 && importState && (
          <ImportStep
            state={importState}
            total={preview.data?.total ?? 0}
            skippedFile={skipped ? { partial: skipped.partial } : null}
            onDownloadSkipped={downloadSkipped}
            onBackground={() => {
              backgrounded.current = true;
              toast({ title: "Import running in the background", description: "You'll get a message here when it's done." });
              navigate("/");
            }}
            onRetry={runImport}
            onBack={() => {
              setImportState(null);
              setStep(2);
            }}
            onAnother={startAgain}
          />
        )}
      </section>
    </div>
  );
}
