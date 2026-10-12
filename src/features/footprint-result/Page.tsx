import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, Package } from "lucide-react";
import {
  Button,
  Callout,
  EmptyState,
  KpiStrip,
  Modal,
  PageHeader,
  RejectReasonModal,
  Skeleton,
  TabPanel,
  Tabs,
  cn,
  formatDateTime,
  useToast,
  type HeaderAction,
  type Kpi,
} from "../../ui";
import { errorMessage, isNotFound, useMove, useNewVersion, useResult, useStudy, useVersions } from "./api";
import { AllocationTab } from "./components/AllocationTab";
import { AuditTab } from "./components/AuditTab";
import { DataQualityTab } from "./components/DataQualityTab";
import { Hotspots } from "./components/Hotspots";
import { InputsTab } from "./components/InputsTab";
import { StageWaterfall } from "./components/StageWaterfall";
import { VersionsTab } from "./components/VersionsTab";
import {
  ACTION_LABEL,
  STATUS_LABEL,
  actionsFor,
  dqrWord,
  hotspots,
  latestVersion,
  perUnitText,
  periodLabel,
  periodParam,
  previousVersion,
  waterfall,
  type ActionId,
  type Study,
} from "./logic";

type Tab = "inputs" | "allocation" | "quality" | "versions" | "audit";
const TABS: { value: Tab; label: string }[] = [
  { value: "inputs", label: "Inputs" },
  { value: "allocation", label: "Plant energy allocation" },
  { value: "quality", label: "Data quality" },
  { value: "versions", label: "Versions" },
  { value: "audit", label: "Audit" },
];
const asTab = (v: string | null): Tab => (TABS.some((t) => t.value === v) ? (v as Tab) : "inputs");

const PILL: Record<Study["status"], string> = {
  draft: "bg-tint text-muted",
  in_review: "bg-info-soft text-info",
  approved: "bg-good-soft text-good",
  published: "bg-good-soft text-good",
  superseded: "bg-tint text-muted",
};

/**
 * C03 `/products/:productId` (the version to show) and
 * `/products/:productId/footprints/:studyId`: what the footprint is, where it
 * comes from, how good the data is and what would reduce it.
 */
export default function FootprintResultPage() {
  const params = useParams();
  const productId = Math.max(0, Math.trunc(Number(params.productId) || 0));
  const pinned = Number(params.studyId) || null;
  const versions = useVersions(productId);
  const chosen = pinned ?? (versions.data ? latestVersion(versions.data)?.pcf_study_id ?? null : null);
  const study = useStudy(chosen);
  const navigate = useNavigate();

  const back: HeaderAction = { label: "All footprints", icon: <ArrowLeft aria-hidden className="size-4" />, onClick: () => navigate("/products") };
  const shell = (body: React.ReactNode, title = "Footprint") => (
    <div className="space-y-4">
      <PageHeader title={title} secondaryActions={[back]} />
      {body}
    </div>
  );

  if ((!pinned && versions.isPending) || (chosen && study.isPending))
    return shell(
      <div className="space-y-4" aria-busy>
        <Skeleton className="h-24" />
        <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>,
    );

  if (!pinned && versions.error)
    return shell(
      <EmptyState
        variant="error"
        title="Couldn't load the footprints."
        description={errorMessage(versions.error, "Check your connection and try again.")}
        action={<Button onClick={() => void versions.refetch()}>Try again</Button>}
      />,
    );

  if (productId <= 0)
    return shell(
      <EmptyState
        icon={Package}
        title="This footprint doesn't exist or isn't on your sites."
        action={<Button onClick={() => navigate("/products")}>All footprints</Button>}
      />,
    );

  if (!chosen)
    return shell(
      <EmptyState
        icon={Package}
        title="This product has no footprint yet."
        action={
          <Button variant="primary" onClick={() => navigate(`/products/new?product=${productId}`)}>
            Start footprint
          </Button>
        }
      />,
    );

  if (!study.data) {
    const missing = isNotFound(study.error);
    return shell(
      <EmptyState
        icon={Package}
        variant={missing ? "empty" : "error"}
        title={missing ? "This footprint doesn't exist or isn't on your sites." : "Couldn't load the footprint."}
        description={missing ? undefined : errorMessage(study.error, "Check your connection and try again.")}
        action={missing ? <Button onClick={() => navigate("/products")}>All footprints</Button> : <Button onClick={() => void study.refetch()}>Try again</Button>}
      />,
    );
  }

  return <Result study={study.data} versions={versions.data ?? []} back={back} />;
}

function Result({ study, versions, back }: { study: Study; versions: Study[]; back: HeaderAction }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [search, setSearch] = useSearchParams();
  const tab = asTab(search.get("tab"));
  const setTab = (t: Tab) =>
    setSearch(
      (p) => {
        const next = new URLSearchParams(p);
        next.set("tab", t);
        return next;
      },
      { replace: true },
    );

  const result = useResult(study.pcf_study_id, !!study.result);
  const move = useMove(study);
  const newVersion = useNewVersion();
  const [rejecting, setRejecting] = useState(false);
  const [confirming, setConfirming] = useState<"approve" | "publish" | null>(null);

  const productId = study.product?.product_id ?? 0;
  const unitText = perUnitText(study.product);
  const prev = previousVersion(versions, study);
  const nextVersion = Math.max(study.version, ...versions.map((v) => v.version)) + 1;
  const editLink = study.status === "draft" ? `/products/${productId}/footprints/${study.pcf_study_id}/edit` : null;
  const r = result.data;

  const steps = useMemo(() => (r ? waterfall(r.total_kg_per_unit, r.by_stage, r.hidden_stages) : []), [r]);
  const spots = useMemo(() => (r ? hotspots(r.lines, unitText) : []), [r, unitText]);
  const hiddenLines = r ? r.lines.filter((l) => l.value_hidden).length : 0;

  const startNewVersion = () =>
    newVersion.mutate(study.pcf_study_id, {
      onSuccess: (s) => navigate(`/products/${productId}/footprints/${s.pcf_study_id}/edit`),
      onError: (e) => toast({ tone: "bad", title: errorMessage(e, "Couldn't start a new version.") }),
    });
  // Approve and Publish are confirmed in a Modal (Esc closes it); the error
  // of a refused move stays in the dialog so the reason is read in place.
  const run = (kind: "approve" | "publish") =>
    move.mutate(
      { kind },
      {
        onSuccess: () => {
          setConfirming(null);
          toast({ tone: "good", title: kind === "approve" ? "Footprint approved." : "Footprint published." });
        },
      },
    );
  const confirmCopy = {
    approve: {
      title: "Approve this footprint?",
      description: `v${study.version} becomes the approved footprint of ${study.product?.name ?? "this product"} and can be published and exported.`,
      label: "Approve",
      fallback: "Couldn't approve the footprint.",
    },
    publish: {
      title: "Publish this footprint?",
      description: `v${study.version} becomes the published footprint of ${study.product?.name ?? "this product"}. Later changes need a new version.`,
      label: "Publish",
      fallback: "Couldn't publish the footprint.",
    },
  } as const;

  const act: Record<ActionId, () => void> = {
    edit: () => editLink && navigate(editLink),
    approve: () => setConfirming("approve"),
    reject: () => setRejecting(true),
    publish: () => setConfirming("publish"),
    "new-version": startNewVersion,
    export: () => navigate(`/products/${study.pcf_study_id}/export`),
  };
  const busy = (id: ActionId) => (id === "new-version" ? newVersion.isPending : (id === "approve" || id === "publish") && move.isPending && move.variables?.kind === id);
  const toAction = (id: ActionId): HeaderAction => ({ label: ACTION_LABEL[id], onClick: act[id], loading: busy(id), disabled: id === "export" && !study.result });
  const { primary, secondary } = actionsFor(study);

  const kpis: Kpi[] = r
    ? [
        {
          label: `Footprint, ${unitText}`,
          value: r.total_kg_per_unit,
          format: "number",
          decimals: 3,
          unit: unitText,
          primary: true,
          previous: prev?.result?.total_kg_per_unit ?? null,
          compareLabel: prev ? `vs v${prev.version}` : undefined,
        },
        { label: "Primary data", value: r.primary_data_share_pct, format: "percent", decimals: 0, hint: r.primary_data_share_pct == null ? "Hidden (licensed data)" : undefined },
        {
          label: "DQR",
          value: r.dqr?.overall ?? null,
          format: "number",
          decimals: 1,
          hint: r.dqr ? `${dqrWord(r.dqr.overall)}, 1 best to 3` : "Hidden (licensed data)",
        },
        { label: "Recycled input", value: r.recycled_input_pct, format: "percent", decimals: 0, hint: r.recycled_input_pct == null ? "No materials by mass" : undefined },
      ]
    : [];

  const site = study.site?.site_id ?? 0;
  const period = periodParam(study);
  const emissionsLink = (categoryId: number | null) =>
    `/data/ledger?${new URLSearchParams({ site: String(site), period, status: "approved", ...(categoryId ? { category: String(categoryId) } : {}) }).toString()}`;
  const productionLink = `/data/production?${new URLSearchParams({ site: String(site), period, status: "approved" }).toString()}`;

  return (
    <div className="space-y-4">
      <PageHeader
        title={study.product?.name ?? "Footprint"}
        description={`${study.site?.name ?? "Site"} · ${study.boundary === "cradle_to_gate" ? "Cradle to gate" : study.boundary}${study.pcr_tag ? ` · ${study.pcr_tag}` : ""}`}
        context={
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", PILL[study.status])}>{STATUS_LABEL[study.status]}</span>
            {study.stale && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-xs font-medium text-warn">
                <AlertTriangle aria-hidden className="size-3.5" />
                Out of date
              </span>
            )}
            <span className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">
              v{study.version} · {periodLabel(study)}
            </span>
          </div>
        }
        primaryAction={toAction(primary)}
        secondaryActions={[...secondary.map(toAction), back]}
      />

      {study.stale && (
        <Callout
          tone="warn"
          title={`New approved data since this was calculated. Recalculate as v${nextVersion}.`}
          action={
            <Button size="sm" onClick={startNewVersion} loading={newVersion.isPending}>
              New version
            </Button>
          }
        >
          The figures below stay as they were calculated.
        </Callout>
      )}
      {study.status === "in_review" && <Callout tone="info" title="Waiting for review. Someone other than whoever created or calculated it approves it." />}
      {study.status === "draft" && study.review_comment && (
        <Callout tone="warn" title="Sent back for changes">
          {study.review_comment}
        </Callout>
      )}

      {!study.result ? (
        <EmptyState
          icon={Package}
          title="This footprint hasn't been calculated yet."
          action={editLink && <Button variant="primary" onClick={() => navigate(editLink)}>Continue editing</Button>}
        />
      ) : result.isPending ? (
        <div className="space-y-4" aria-busy>
          <KpiStrip items={[]} loading />
          <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
            <Skeleton className="h-72" />
            <Skeleton className="h-72" />
          </div>
        </div>
      ) : !r ? (
        <EmptyState
          variant="error"
          title="Couldn't load the result."
          description={errorMessage(result.error, "Check your connection and try again.")}
          action={<Button onClick={() => void result.refetch()}>Try again</Button>}
        />
      ) : (
        <>
          {r.is_draft && <p className="text-sm text-muted">Draft result, calculated {formatDateTime(r.calculated_at)}{r.calculated_by ? ` by ${r.calculated_by.name}` : ""}. It isn't final until approved.</p>}
          <KpiStrip items={kpis} />
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <StageWaterfall steps={steps} unitText={unitText} exportName={`footprint-v${study.version}`} hiddenNote={r.hidden_stages.length > 0} />
            <Hotspots items={spots} hiddenCount={hiddenLines} onOpenInputs={() => setTab("inputs")} />
          </div>
          {r.warnings.length > 0 && (
            <Callout tone="info" title="Notes from the calculation">
              <ul className="list-disc pl-4">
                {r.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </Callout>
          )}
          <section className="space-y-3">
            <Tabs label="Footprint details" idBase="result" items={TABS} value={tab} onChange={setTab} />
            <TabPanel idBase="result" value="inputs" current={tab}>
              <InputsTab lines={r.lines} unitText={unitText} editLink={editLink} />
            </TabPanel>
            <TabPanel idBase="result" value="allocation" current={tab}>
              <AllocationTab result={r} unitText={unitText} emissionsLink={emissionsLink} productionLink={productionLink} />
            </TabPanel>
            <TabPanel idBase="result" value="quality" current={tab}>
              <DataQualityTab result={r} unitText={unitText} />
            </TabPanel>
            <TabPanel idBase="result" value="versions" current={tab}>
              <VersionsTab study={study} versions={versions} productId={productId} unitText={unitText} />
            </TabPanel>
            <TabPanel idBase="result" value="audit" current={tab}>
              <AuditTab studyId={study.pcf_study_id} active={tab === "audit"} />
            </TabPanel>
          </section>
        </>
      )}

      {(["approve", "publish"] as const).map((kind) => (
        <Modal
          key={kind}
          open={confirming === kind}
          onClose={() => setConfirming(null)}
          title={confirmCopy[kind].title}
          description={confirmCopy[kind].description}
          primaryAction={{ label: confirmCopy[kind].label, onClick: () => run(kind), loading: move.isPending && move.variables?.kind === kind }}
          error={move.isError && move.variables?.kind === kind ? errorMessage(move.error, confirmCopy[kind].fallback) : null}
        />
      ))}

      <RejectReasonModal
        open={rejecting}
        count={1}
        noun={["footprint", "footprints"]}
        busy={move.isPending && move.variables?.kind === "reject"}
        error={move.isError && move.variables?.kind === "reject" ? errorMessage(move.error, "Couldn't send it back.") : null}
        onClose={() => setRejecting(false)}
        onConfirm={(comment) =>
          move.mutate(
            { kind: "reject", comment },
            {
              onSuccess: () => {
                setRejecting(false);
                toast({ title: "Sent back to draft." });
              },
            },
          )
        }
      />
    </div>
  );
}
