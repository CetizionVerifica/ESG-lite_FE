import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Callout, Stepper, exportMatrix, useToast } from "../../../../ui";
import { type Site, errorMessage, useUploadFile } from "../../api";
import type { UploadContext } from "../../hooks/useUploadContext";
import { type ImportResult, fileProblem, selectedSite, skippedMatrix } from "../../logic";
import { type SmartPreviewArgs, usePatchPlan, usePropose, useSkipIssue, useSmartImport, useSmartPreview } from "../../smart/api";
import { SMART_STEPS, reviewRowsLink, rowsText, smartErrorMessage, smartUnavailable } from "../../smart/logic";
import type { MappingProposal } from "../../smart/types";
import { ImportStep, type ImportState } from "../ImportStep";
import { ConfirmMappingStep } from "./ConfirmMappingStep";
import type { RowEdit } from "./RowEditModal";
import { SmartReviewStep } from "./SmartReviewStep";
import { SmartUploadStep } from "./SmartUploadStep";

type Workbook = { documentId: number; headers: string[]; fileName: string };

/**
 * The four smart import screens (XI4): Upload → Confirm mapping → Review rows
 * → Import. Owns the upload, the proposal the user edits, the plan ESG-lite
 * made from it and the commit; the page around it decides when this flow is
 * shown.
 */
export function SmartImportFlow(props: {
  ctx: UploadContext;
  onContext: (patch: Partial<UploadContext>) => void;
  sites: { data: Site[]; loading: boolean; error: string | null; retry: () => void };
  contributor: boolean;
  clientEnabled: boolean | null;
  /** The mapper couldn't be reached: offer the manual mapper instead. */
  onUseManual: () => void;
  onLocked: (locked: boolean) => void;
}) {
  const { ctx, sites, contributor } = props;
  const { toast } = useToast();
  const navigate = useNavigate();
  const site = selectedSite(sites.data, ctx, contributor);
  const categories = useMemo(() => (site?.categories ?? []).map((c) => ({ value: c.category_id, label: c.category_name })).sort((a, b) => a.label.localeCompare(b.label)), [site]);

  const upload = useUploadFile();
  const propose = usePropose();
  const patch = usePatchPlan();
  const skipIssue = useSkipIssue();

  const [step, setStep] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [workbook, setWorkbook] = useState<Workbook | null>(null);
  const [proposal, setProposal] = useState<MappingProposal | null>(null);
  const [previewArgs, setPreviewArgs] = useState<SmartPreviewArgs | null>(null);
  const [importState, setImportState] = useState<ImportState | null>(null);
  const backgrounded = useRef(false);
  const lastPlan = useRef<string | null>(null);

  const onPlanned = useCallback((planId: string) => setPreviewArgs((a) => (a && a.planId === null ? { ...a, planId } : a)), []);
  const preview = useSmartPreview(previewArgs, lastPlan, onPlanned);
  const plan = preview.data?.plan ?? null;

  const onDone = (result: ImportResult) => {
    lastPlan.current = null;
    setImportState({ status: "done", result });
    props.onLocked(true);
    if (backgrounded.current) {
      toast({ title: "Smart import finished", description: `Imported ${rowsText(result.inserted)}${result.skipped ? `, skipped ${result.skipped}` : ""}. They're waiting for approval.`, tone: "good" });
    }
  };
  const onFail = (message: string) => {
    setImportState({ status: "error", message });
    if (backgrounded.current) toast({ title: "Smart import didn't finish", description: message, tone: "bad" });
  };
  const commit = useSmartImport(onDone, onFail);

  const chooseFile = (next: File | null) => {
    upload.reset();
    propose.reset();
    setWorkbook(null);
    setFile(next);
    setFileError(next ? fileProblem(next) : null);
  };

  const uploadAndPropose = () => {
    if (!file || fileError || ctx.siteId === null) return;
    const siteId = ctx.siteId;
    upload.mutate(file, {
      onSuccess: (res) => {
        setWorkbook({ documentId: res.document_id, headers: res.headers ?? [], fileName: file.name });
        propose.mutate(
          { documentId: res.document_id, siteId },
          {
            onSuccess: (p) => {
              setProposal(p);
              setStep(1);
            },
          },
        );
      },
    });
  };

  const toReview = () => {
    if (!proposal) return;
    setPreviewArgs({ proposal, planId: null, code: null, page: 0 });
    setStep(2);
  };

  const backToConfirm = () => {
    // The proposal may change: the next Continue plans afresh and cancels this plan.
    setPreviewArgs(null);
    setStep(1);
  };

  const patchRows = (changes: { row_ref: string; set?: Record<string, unknown>; skip?: boolean }[]) => {
    if (!plan?.plan_id) return;
    patch.mutate({ planId: plan.plan_id, body: { version: plan.version, changes } });
  };

  const runImport = () => {
    if (!proposal || !plan?.plan_id) return;
    backgrounded.current = false;
    setImportState({ status: "running" });
    props.onLocked(true);
    setStep(3);
    commit.mutate({ proposal, plan: { plan_id: plan.plan_id, version: plan.version } });
  };

  const backToReview = () => {
    setImportState(null);
    props.onLocked(false);
    setStep(2);
    void preview.refetch();
  };

  const startAgain = () => {
    setStep(0);
    setFile(null);
    setFileError(null);
    setWorkbook(null);
    setProposal(null);
    setPreviewArgs(null);
    setImportState(null);
    lastPlan.current = null;
    upload.reset();
    propose.reset();
    commit.reset();
    props.onLocked(false);
  };

  const result = importState?.status === "done" ? importState.result : null;
  const skipped = result ? skippedMatrix(result, preview.data?.rows ?? []) : null;
  const downloadSkipped = () => {
    if (skipped) void exportMatrix(skipped.matrix, `skipped-rows-${workbook?.fileName.replace(/\.[^.]+$/, "") ?? "upload"}`, "csv");
  };

  const locked = importState !== null;
  const completed = SMART_STEPS.slice(0, step).map((s) => s.id);
  const proposeError = propose.error ? smartErrorMessage(propose.error, "The mapper couldn't read the workbook. Try again.") : null;
  const busy = upload.isPending || propose.isPending;

  return (
    <>
      <Stepper
        label="Smart import steps"
        steps={SMART_STEPS.map((s) => ({ id: s.id, label: s.label }))}
        current={step}
        completed={importState?.status === "done" ? SMART_STEPS.map((s) => s.id) : completed}
        canJump={(i) => !locked && i < step}
        onStepChange={(i) => (i === 1 && step === 2 ? backToConfirm() : setStep(i))}
      />
      <section aria-label={SMART_STEPS[step].label} className="rounded-card border border-line bg-panel p-4 sm:p-5">
        {step === 0 && (
          <div className="space-y-4">
            {propose.error && smartUnavailable(propose.error) && (
              <Callout tone="info" title="The mapper isn't available right now" action={<Button size="sm" variant="ghost" onClick={props.onUseManual}>Map the columns yourself</Button>}>
                You can still upload this file and map its columns by hand.
              </Callout>
            )}
            <SmartUploadStep
              ctx={ctx}
              onContext={(p) => {
                props.onContext(p);
                if ("siteId" in p || "clientId" in p) chooseFile(file);
              }}
              sites={sites}
              contributor={contributor}
              clientEnabled={props.clientEnabled}
              file={file}
              onFile={chooseFile}
              busy={busy}
              error={fileError ?? (upload.error ? errorMessage(upload.error, "The file couldn't be uploaded. Try again.") : proposeError && !smartUnavailable(propose.error) ? proposeError : null)}
              onNext={uploadAndPropose}
            />
          </div>
        )}
        {step === 1 && proposal && workbook && (
          <ConfirmMappingStep
            fileName={workbook.fileName}
            proposal={proposal}
            onChange={setProposal}
            siteName={site?.name ?? "this site"}
            headers={workbook.headers}
            categories={categories}
            onBack={() => setStep(0)}
            onNext={toReview}
          />
        )}
        {step === 2 && (
          <SmartReviewStep
            plan={plan}
            rows={preview.data?.rows ?? null}
            total={preview.data?.total ?? null}
            page={previewArgs?.page ?? 0}
            onPage={(page) => setPreviewArgs((a) => (a ? { ...a, page } : a))}
            code={previewArgs?.code ?? null}
            onCode={(code) => setPreviewArgs((a) => (a ? { ...a, code, page: 0 } : a))}
            loading={preview.isFetching}
            error={preview.error ? smartErrorMessage(preview.error, "The rows didn't load. Try again.") : null}
            onRetry={() => void preview.refetch()}
            onSkip={(ref, skip) => patchRows([{ row_ref: ref, skip }])}
            onEdit={(ref, edit: RowEdit) => patchRows([{ row_ref: ref, set: { activity_name: edit.activity_name, activity_value: edit.activity_value, activity_unit: edit.activity_unit } }])}
            onSkipIssue={(code) => plan?.plan_id && skipIssue.mutate({ planId: plan.plan_id, version: plan.version, code })}
            busy={patch.isPending || skipIssue.isPending}
            patchError={patch.error ? smartErrorMessage(patch.error, "The row couldn't be changed.") : skipIssue.error ? smartErrorMessage(skipIssue.error, "The rows couldn't be skipped.") : null}
            onBack={backToConfirm}
            onImport={runImport}
          />
        )}
        {step === 3 && importState && (
          <ImportStep
            state={importState}
            total={plan?.counts.ready ?? 0}
            skippedFile={skipped ? { partial: skipped.partial } : null}
            onDownloadSkipped={downloadSkipped}
            reviewLink={result?.upload_batch_id && ctx.siteId !== null ? reviewRowsLink(ctx.siteId, result.upload_batch_id) : null}
            onBackground={() => {
              backgrounded.current = true;
              toast({ title: "Import running in the background", description: "You'll get a message here when it's done." });
              navigate("/");
            }}
            onRetry={runImport}
            onBack={backToReview}
            onAnother={startAgain}
          />
        )}
      </section>
    </>
  );
}
