import { useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { FileDown } from "lucide-react";
import {
  Button,
  Callout,
  EmptyState,
  Modal,
  PageHeader,
  Select,
  SkeletonText,
  formatDateTime,
  useToast,
} from "../../ui";
import type { Look } from "../../theme";
import { SaveError, fetchReportPdf, useClientBrand, useOwnBrand, useSaveBrand } from "./api";
import { Editor } from "./components/Editor";
import { PreviewPane } from "./components/PreviewPane";
import { useObjectUrl } from "./hooks/useObjectUrl";
import { useUnsavedGuard } from "./hooks/useUnsavedGuard";
import {
  type BrandDraft,
  LOOKS,
  SCREENS,
  type SavedBrand,
  type Screen,
  contrastGate,
  draftFromBrand,
  isDirty,
  lookTokens,
  previewPack,
  reportYears,
  resetToDefaults,
  validate,
} from "./logic";

/** Superadmin: `/clients/:clientId/brand`, edit a client's theme. */
export default function BrandThemesPage() {
  const { clientId } = useParams();
  const id = Number(clientId);
  const valid = Number.isInteger(id) && id > 0;
  const query = useClientBrand(valid ? id : null);
  if (!valid) return <EmptyState variant="error" title="This client doesn't exist" description="Pick a client in the switcher above." />;
  return <Loaded query={query} companyId={id} mode="edit" />;
}

/** Company Admin: `/brand`, their own theme, view only. */
export function BrandViewPage() {
  const query = useOwnBrand(true);
  return <Loaded query={query} companyId={query.data?.companyId ?? 0} mode="view" />;
}

type Query = ReturnType<typeof useClientBrand>;

function Loaded({ query, companyId, mode }: { query: Query; companyId: number; mode: "edit" | "view" }) {
  if (query.isPending) {
    return (
      <div className="space-y-4">
        <PageHeader title="Brand theme" loading />
        <SkeletonText lines={8} />
      </div>
    );
  }
  if (query.isError || !query.data) {
    return (
      <EmptyState
        variant="error"
        title="The brand theme couldn't be loaded"
        action={<Button onClick={() => void query.refetch()}>Try again</Button>}
      />
    );
  }
  // Remount per client so a draft never carries over to another client.
  return <BrandThemeEditor key={companyId} companyId={companyId} saved={query.data} readOnly={mode === "view"} />;
}

/** Cache-buster for the fixed R2 logo URL, so a replaced logo shows at once. */
function busted(url: string | null | undefined, version: string | undefined): string | null {
  if (!url) return null;
  return version ? `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(version)}` : url;
}

function BrandThemeEditor({ companyId, saved, readOnly }: { companyId: number; saved: SavedBrand; readOnly: boolean }) {
  const { toast } = useToast();
  const savedDraft = useMemo(() => draftFromBrand(saved), [saved]);
  const [draft, setDraft] = useState<BrandDraft>(savedDraft);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const save = useSaveBrand(companyId);

  const [params, setParams] = useSearchParams();
  const look = (LOOKS as string[]).includes(params.get("look") ?? "") ? (params.get("look") as Look) : draft.defaultLook;
  const screen = SCREENS.some((s) => s.value === params.get("screen")) ? (params.get("screen") as Screen) : "overview";
  const setParam = (key: string, value: string) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.set(key, value);
        return next;
      },
      { replace: true },
    );

  const dirty = !readOnly && isDirty(draft, savedDraft);
  const blocker = useUnsavedGuard(dirty && !save.isPending);

  const savedLogos = {
    logoUrl: busted(saved.logoUrl, saved.updatedAt),
    logoOnDarkUrl: busted(saved.logoOnDarkUrl, saved.updatedAt),
  };
  const staged = { logoUrl: useObjectUrl(draft.logoFile), logoOnDarkUrl: useObjectUrl(draft.darkLogoFile) };
  const pack = useMemo(
    () =>
      previewPack(companyId, draft, {
        logoUrl: staged.logoUrl ?? savedLogos.logoUrl,
        logoOnDarkUrl: staged.logoOnDarkUrl ?? (draft.removeDarkLogo ? null : savedLogos.logoOnDarkUrl),
      }),
    [companyId, draft, staged.logoUrl, staged.logoOnDarkUrl, savedLogos.logoUrl, savedLogos.logoOnDarkUrl],
  );
  const errors = validate(draft);
  const hasErrors = Object.keys(errors).length > 0;
  const gate = useMemo(() => contrastGate(pack, "light"), [pack]);
  const blocked = gate.failing.length > 0;
  const [darkTile, lightTile] = useMemo(() => {
    const classic = lookTokens(pack, "classic");
    return [
      { background: classic.chrome, color: classic["chrome-fg"] },
      { background: classic.panel, color: classic.muted },
    ];
  }, [pack]);
  const lightAdjusted = gate.adjustments.filter((a) => a.look === "light");

  const onChange = (patch: Partial<BrandDraft>) => {
    setSaveError(null);
    setDraft((d) => ({ ...d, ...patch }));
  };

  const onSave = async () => {
    setSaveError(null);
    try {
      await save.mutateAsync(draft);
      setDraft((d) => ({ ...d, logoFile: null, darkLogoFile: null, removeDarkLogo: false }));
      toast({ title: "Theme saved", description: "Client users see it the next time they open ESGLite.", tone: "good" });
    } catch (e) {
      const err = e instanceof SaveError ? e : null;
      if (err?.logosSaved) setDraft((d) => ({ ...d, logoFile: null, darkLogoFile: null }));
      setSaveError(err?.message ?? "The theme couldn't be saved.");
    }
  };

  const [reportYear, setReportYear] = useState(() => reportYears(new Date())[0]);
  const [opening, setOpening] = useState(false);
  const openReport = async () => {
    // Open the tab now (inside the click) so popup blockers allow it.
    const tab = window.open("", "_blank");
    setOpening(true);
    try {
      const pdf = await fetchReportPdf(companyId, reportYear);
      const url = URL.createObjectURL(pdf);
      if (tab) tab.location.href = url;
      else window.location.assign(url);
    } catch {
      tab?.close();
      toast({ title: "The report couldn't be generated", description: `There may be no data for ${reportYear}.`, tone: "bad" });
    } finally {
      setOpening(false);
    }
  };

  const name = saved.name || "Client";
  const status = dirty
    ? "Unsaved changes"
    : saved.updatedAt
      ? `Last saved ${formatDateTime(saved.updatedAt)}`
      : "Not saved yet; showing the defaults";

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Brand theme · ${name}`}
        description={<span data-testid="save-status">{status}</span>}
        primaryAction={
          readOnly
            ? undefined
            : { label: "Save theme", onClick: () => void onSave(), loading: save.isPending, disabled: !dirty || hasErrors || blocked }
        }
        secondaryActions={
          readOnly
            ? []
            : [
                ...(dirty ? [{ label: "Discard changes", onClick: () => setDraft(savedDraft) }] : []),
                { label: "Reset to PlanetPulse", onClick: () => setResetOpen(true) },
              ]
        }
      />
      {saveError && (
        <Callout tone="warn" title="Not saved" onDismiss={() => setSaveError(null)}>
          {saveError}
        </Callout>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        <Editor
          draft={draft}
          onChange={onChange}
          errors={errors}
          saved={savedLogos}
          staged={staged}
          readOnly={readOnly}
          darkTile={darkTile}
          lightTile={lightTile}
          notes={{
            primary: lightAdjusted.some((a) => a.text.startsWith("Primary"))
              ? "Darkened a little on buttons so their text reads"
              : "Passes AA for button text",
            accent: gate.fillOnlyAccent ? "Fills only: too light for text on white" : "Passes AA as text",
          }}
        />
        <div className="min-w-0 space-y-4">
          <PreviewPane
            pack={pack}
            look={look}
            onLook={(l) => setParam("look", l)}
            screen={screen}
            onScreen={(s) => setParam("screen", s)}
            reportYear={reportYear}
          />
          {!readOnly && (
            <section aria-labelledby="report-heading" className="flex flex-wrap items-end gap-3 rounded-card border border-line bg-panel p-4">
              <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
                <h2 id="report-heading" className="text-sm font-semibold text-ink">
                  Branded report
                </h2>
                <p className="text-xs text-muted">
                  {dirty ? "Uses the saved theme. Save first to see these changes in the PDF." : "The GHG report PDF as the client gets it."}
                </p>
              </div>
              <Select<number>
                label="Year"
                className="w-28"
                value={reportYear}
                onChange={(y) => y && setReportYear(y)}
                options={reportYears(new Date()).map((y) => ({ value: y, label: `CY${y}` }))}
              />
              <Button icon={<FileDown aria-hidden className="size-4" />} loading={opening} onClick={() => void openReport()}>
                Open PDF
              </Button>
            </section>
          )}
        </div>
      </div>

      <Modal
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        title="Reset to PlanetPulse colours?"
        description="Colours, cover and default look go back to PlanetPulse. The name and logos stay. Nothing is saved until you press Save theme."
        primaryAction={{
          label: "Reset colours",
          onClick: () => {
            setDraft((d) => resetToDefaults(d));
            setResetOpen(false);
          },
        }}
      />
      <Modal
        open={blocker.state === "blocked"}
        onClose={() => blocker.reset?.()}
        title="Leave without saving?"
        description="Your changes to this theme will be lost."
        tone="destructive"
        cancelLabel="Stay"
        primaryAction={{ label: "Leave", onClick: () => blocker.proceed?.() }}
      />
    </div>
  );
}
