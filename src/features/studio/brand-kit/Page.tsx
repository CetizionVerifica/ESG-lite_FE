import { useEffect, useMemo, useState } from "react";
import { Palette, Plus } from "lucide-react";
import { Button, Callout, EmptyState, Loading, Modal, PageHeader, Skeleton, formatDateTime, useToast, useUnsavedGuard } from "../../../ui";
import { useAuth } from "../../../context/AuthContext";
import { useClientContext } from "../../../lib/clientContext";
import { draftErrors, draftFromKit, draftsEqual, move, updateFromDraft, type BrandKitDraft } from "../../../lib/studio/brandKit";
import { PALETTES_MAX } from "../../../lib/studio/contracts";
import { brandKitErrorMessage, useBrandKit, useSaveBrandKit } from "./api";
import { FontsSection } from "./components/FontsSection";
import { BrandFontsSection } from "./components/BrandFontsSection"; // PE-2
import { LogosSection } from "./components/LogosSection";
import { PaletteCard } from "./components/PaletteCard";
import { VoiceSection } from "./components/VoiceSection";

let nextKey = 0;
const newKey = () => `new-${++nextKey}`;

/**
 * DS-3 · `/studio/brand-kit` (05-ux S5): logos (read from the brand), palettes
 * with a contrast badge per colour pair, heading and body fonts from the OFL
 * set, and the brand voice. Managers (and Superadmins) edit and save; Admins
 * read. Every design's Brand drawer and Styles read this kit.
 */
export function BrandKitPage() {
  const kit = useBrandKit();
  const save = useSaveBrandKit();
  const { toast } = useToast();
  const { role } = useAuth();
  const { clientId } = useClientContext();
  const saved = useMemo(() => (kit.data ? draftFromKit(kit.data) : null), [kit.data]);
  const [draft, setDraft] = useState<BrandKitDraft | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => {
    if (saved) setDraft(saved);
  }, [saved]);

  const dirty = !!draft && !!saved && !draftsEqual(draft, saved);
  const blocker = useUnsavedGuard(dirty && !save.isPending);

  if (kit.isError) {
    return <EmptyState variant="error" title="The brand kit couldn't be loaded." description={brandKitErrorMessage(kit.error, "Try again in a moment.")} action={<Button onClick={() => void kit.refetch()}>Try again</Button>} />;
  }
  if (kit.isPending || !draft || !kit.data) {
    return (
      <Loading label="Loading the brand kit" className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </Loading>
    );
  }

  const data = kit.data;
  const readOnly = !data.canEdit;
  const errors = draftErrors(draft);
  const hasErrors = Object.keys(errors).length > 0;
  const update = (patch: Partial<BrandKitDraft>) => setDraft((d) => (d ? { ...d, ...patch } : d));

  const onSave = async () => {
    setSaveError(null);
    try {
      await save.mutateAsync(updateFromDraft(draft));
      toast({ title: "Brand kit saved", description: "New designs and Styles use it now.", tone: "good" });
    } catch (e) {
      setSaveError(brandKitErrorMessage(e));
    }
  };

  const status = dirty ? "Unsaved changes" : data.updatedAt ? `Last saved ${formatDateTime(data.updatedAt)}` : "Logos, colours, fonts and voice for every design.";

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Brand kit · ${data.name}`}
        description={<span data-testid="bk-status">{status}</span>}
        primaryAction={readOnly ? undefined : { label: "Save brand kit", onClick: () => void onSave(), loading: save.isPending, disabled: !dirty || hasErrors }}
        secondaryActions={readOnly || !dirty ? [] : [{ label: "Discard changes", onClick: () => setDraft(saved) }]}
      />
      {readOnly && <Callout tone="info">Only Managers can change the brand kit. You can use it in every design.</Callout>}
      {saveError && (
        <Callout tone="warn" title="Not saved" onDismiss={() => setSaveError(null)}>
          {saveError}
        </Callout>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="space-y-5">
          <LogosSection kit={data} superadminClientId={role === "Superadmin" ? clientId : null} />
          <FontsSection heading={draft.heading} body={draft.body} readOnly={readOnly} onChange={(f) => update(f)} />
          <BrandFontsSection /> {/* PE-2: uploaded fonts, saved on their own (not with "Save brand kit") */}
          <VoiceSection value={draft.voice} readOnly={readOnly} error={errors.voice} onChange={(voice) => update({ voice })} />
        </div>

        <section aria-labelledby="bk-palettes" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 id="bk-palettes" className="text-sm font-semibold text-ink">
              Palettes
            </h2>
            {!readOnly && draft.palettes.length < PALETTES_MAX && (
              <Button
                size="sm"
                icon={<Plus aria-hidden className="size-4" />}
                onClick={() => update({ palettes: [...draft.palettes, { key: newKey(), name: draft.palettes.length ? `Palette ${draft.palettes.length + 1}` : "Primary", colors: [data.colors.primary, data.colors.accent] }] })}
              >
                Add palette
              </Button>
            )}
          </div>
          <p className="text-xs text-muted">The first palette is your primary palette: Styles build from it. Brand colours from Brand themes: {data.colors.primary.toUpperCase()} and {data.colors.accent.toUpperCase()}.</p>
          {errors.palettes && <Callout tone="warn">{errors.palettes}</Callout>}
          {draft.palettes.length === 0 ? (
            <div className="rounded-card border border-line bg-panel">
              <EmptyState icon={Palette} compact title="No palettes yet." description={readOnly ? "A Manager can add your brand palettes." : "Add your brand colours so every design can use them."} />
            </div>
          ) : (
            <ul className="space-y-3">
              {draft.palettes.map((p, i) => (
                <PaletteCard
                  key={p.key}
                  palette={p}
                  index={i}
                  count={draft.palettes.length}
                  readOnly={readOnly}
                  errors={errors}
                  onChange={(next) => update({ palettes: draft.palettes.map((q, j) => (j === i ? next : q)) })}
                  onMove={(to) => update({ palettes: move(draft.palettes, i, to) })}
                  onRemove={() => update({ palettes: draft.palettes.filter((_, j) => j !== i) })}
                />
              ))}
            </ul>
          )}
        </section>
      </div>

      <Modal
        open={blocker.state === "blocked"}
        onClose={() => blocker.reset?.()}
        title="Leave without saving?"
        description="Your changes to the brand kit will be lost."
        tone="destructive"
        cancelLabel="Stay"
        primaryAction={{ label: "Leave", onClick: () => blocker.proceed?.() }}
      />
    </div>
  );
}
