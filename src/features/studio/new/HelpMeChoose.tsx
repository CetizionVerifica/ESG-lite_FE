// AT-1 · "Help me choose" on /studio/new step 1 (mockup AiTemplates): the
// brief, then up to three suggestion cards from POST /studio/templates/suggest
// with a brand-rendered cover, the AI's reasons, readiness badges (counts from
// approved data), "Preview with my data" and "Use this". The rules shortlist;
// the AI only orders the shortlist and writes the reasons.
import { useMemo, useState } from "react";
import { CheckCircle2, AlertTriangle, Sparkles, XCircle } from "lucide-react";
import { BRIEF_AUDIENCES, BRIEF_LENGTHS, BRIEF_NOTE_MAX, BRIEF_TONES, FRAMEWORKS_BY_KIND, type FreeformPage, type ReportTemplate, type TemplateBrief, type TemplateSuggestion, type TemplateSuggestResponse } from "../../../lib/studio/contracts";
import { periodLabel } from "../../../lib/studio/docData";
import { AiChip, Badge, Button, Callout, EmptyState, SegmentedControl, Select, Skeleton, Textarea, cn, focusRing, panel } from "../../../ui";
import { formatLine } from "../home/logic";
import { useTemplate } from "../panels/library/api";
import { previewDoc, useRenderBrand } from "../panels/library/preview";
import { SheetThumb } from "../panels/library/SheetThumb";
import { FRAMEWORK_LABELS, type NewDesignState } from "./logic";
import { templateSuggestErrorMessage, useTemplateSuggest } from "./suggestApi";
import { SuggestPreview } from "./SuggestPreview";
import { AUDIENCE_LABELS, BADGE_TONE, LENGTH_LABELS, LEVEL_TEXT, PURPOSE_LABELS, PURPOSES_BY_KIND, TONE_LABELS, defaultBrief, kindNoun, layoutName, pageNames, suggestBody } from "./suggestLogic";

const LOOK_LABEL: Record<string, string> = { classic: "Classic look", light: "Light look", night: "Night look" };
const BADGE_ICON = { ok: CheckCircle2, partial: AlertTriangle, missing: XCircle } as const;

/** The template's cover drawn by the renderer in the client's brand (as the Templates drawer). */
function SuggestCover({ template }: { template: ReportTemplate }) {
  const detail = useTemplate(template.id);
  const brand = useRenderBrand();
  const cover = detail.data?.doc.pages.find((p): p is FreeformPage => p.kind === "freeform");
  return (
    <div className="flex h-44 items-center justify-center rounded-t-card bg-tint p-3">
      {template.thumbnailUrl ? (
        <img src={template.thumbnailUrl} alt="" className="max-h-full rounded-chip border border-line" />
      ) : detail.data && cover ? (
        <SheetThumb doc={previewDoc(detail.data.doc, cover)} page={cover} width={template.format === "slide_16_9" ? 200 : 112} maxHeight={150} brand={brand} className="rounded-chip border border-line shadow-sm" label={`${template.name} cover`} />
      ) : (
        <Skeleton className="h-36 w-28" />
      )}
    </div>
  );
}

function SuggestCard({ s, onPreview, onUse }: { s: TemplateSuggestion; onPreview: () => void; onUse: () => void }) {
  const detail = useTemplate(s.templateId);
  const drop = pageNames(detail.data?.doc, s.pagesToDrop);
  const level = LEVEL_TEXT[s.readiness.level];
  return (
    <li className={cn(panel, "flex flex-col", s.rank === 1 && "border-brand")} data-testid={`suggestion-${s.templateId}`}>
      <SuggestCover template={s.template} />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {s.rank === 1 && <Badge tone="brand">Best fit</Badge>}
            <Badge tone={level.tone}>{level.label}</Badge>
          </div>
          <p className="mt-1.5 font-medium text-ink">{s.template.name}</p>
          <p className="text-xs text-muted">
            {formatLine(s.template.format, s.template.pageCount)}
            {s.template.look ? ` · ${LOOK_LABEL[s.template.look] ?? s.template.look}` : ""}
          </p>
        </div>
        {s.reasons.length > 0 && (
          <ul className="list-disc space-y-1 pl-4 text-sm text-ink" aria-label="Why it fits">
            {s.reasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        )}
        {s.readiness.badges.length > 0 && (
          <ul className="space-y-1.5" aria-label="Data readiness">
            {s.readiness.badges.map((b) => {
              const Icon = BADGE_ICON[b.status];
              return (
                <li key={`${b.key}-${b.framework ?? ""}`} className="flex items-start gap-1.5 text-xs" data-status={b.status}>
                  <Icon aria-hidden className={cn("mt-0.5 size-3.5 shrink-0", b.status === "ok" ? "text-good" : b.status === "partial" ? "text-warn" : "text-bad")} />
                  <span className="text-ink">{b.label}</span>
                  <span className="sr-only"> ({BADGE_TONE[b.status] === "good" ? "ready" : b.status})</span>
                </li>
              );
            })}
          </ul>
        )}
        {s.readiness.badges.length === 0 && (
          <p className="flex items-center gap-1.5 text-xs text-ink">
            <CheckCircle2 aria-hidden className="size-3.5 text-good" /> All data pages have approved data
          </p>
        )}
        {(drop.length > 0 || s.pagesToAdd.length > 0) && (
          <div className="rounded-control bg-tint p-2 text-xs text-muted">
            {drop.length > 0 && <p>Could leave out: {drop.join(", ")}</p>}
            {s.pagesToAdd.length > 0 && <p>Could add: {s.pagesToAdd.map(layoutName).join(", ")}</p>}
          </div>
        )}
        <div className="mt-auto flex flex-wrap gap-2 pt-1">
          <Button onClick={onPreview} data-testid={`suggestion-preview-${s.templateId}`}>
            Preview with my data
          </Button>
          <Button variant="primary" onClick={onUse} data-testid={`suggestion-use-${s.templateId}`}>
            Use this
          </Button>
        </div>
      </div>
    </li>
  );
}

export interface HelpMeChooseProps {
  state: NewDesignState;
  /** Picks the template and moves on to the scope step. */
  onUse: (templateId: number) => void;
  onBrowse: () => void;
}

export function HelpMeChoose({ state, onUse, onBrowse }: HelpMeChooseProps) {
  const [brief, setBrief] = useState<TemplateBrief>(() => defaultBrief(state));
  const [result, setResult] = useState<TemplateSuggestResponse | null>(null);
  const [preview, setPreview] = useState<TemplateSuggestion | null>(null);
  const suggest = useTemplateSuggest();
  const patch = (p: Partial<TemplateBrief>) => setBrief((b) => ({ ...b, ...p }));
  const purposes = PURPOSES_BY_KIND[state.kind];
  const purpose = purposes.includes(brief.purpose) ? brief.purpose : purposes[0];
  const frameworks = FRAMEWORKS_BY_KIND[state.kind];
  const toggleFramework = (f: (typeof frameworks)[number]) => patch({ frameworks: brief.frameworks.includes(f) ? brief.frameworks.filter((x) => x !== f) : [...brief.frameworks, f] });
  const period = periodLabel(state.yearType, state.year);
  const noteLeft = BRIEF_NOTE_MAX - (brief.note?.length ?? 0);

  const ask = async () => {
    setResult(null);
    try {
      setResult(await suggest.mutateAsync(suggestBody(state, { ...brief, purpose })));
    } catch {
      // the error shows from the mutation state
    }
  };
  const heading = useMemo(() => {
    if (!result) return "";
    return `${result.shortlist.length} of ${result.considered} ${kindNoun(state.kind)} template${result.considered === 1 ? "" : "s"} · checked against your approved ${period} data`;
  }, [result, state.kind, period]);

  return (
    <div className="grid gap-5 lg:grid-cols-[340px_1fr]" data-testid="help-me-choose">
      <form
        className={cn(panel, "h-fit space-y-4 p-4")}
        aria-label="Tell us about the report"
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <p className="font-semibold text-ink">Tell us about the report</p>
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium text-ink">What is it for?</legend>
          <div role="radiogroup" aria-label="What is it for?" className="flex flex-wrap gap-1.5">
            {purposes.map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={purpose === p}
                onClick={() => patch({ purpose: p })}
                className={cn("rounded-full border px-3 py-1 text-sm", purpose === p ? "border-brand bg-brand-50 text-brand-text" : "border-line bg-panel text-ink hover:bg-tint", focusRing)}
              >
                {PURPOSE_LABELS[p]}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className="space-y-1.5">
          <legend className="text-sm font-medium text-ink">Standard</legend>
          {frameworks.map((f) => (
            <label key={f} className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" className="size-4 accent-accent" checked={brief.frameworks.includes(f)} onChange={() => toggleFramework(f)} />
              {FRAMEWORK_LABELS[f]}
            </label>
          ))}
        </fieldset>
        <Select label="Audience" value={brief.audience} onChange={(audience) => audience && patch({ audience })} options={BRIEF_AUDIENCES.map((a) => ({ value: a, label: AUDIENCE_LABELS[a] }))} />
        <Select label="Length" value={brief.length} onChange={(length) => length && patch({ length })} options={(["medium", "short", "long"] as const).filter((l) => BRIEF_LENGTHS.includes(l)).map((l) => ({ value: l, label: LENGTH_LABELS[l] }))} />
        <SegmentedControl label="Tone" value={brief.tone ?? "formal"} onChange={(tone) => patch({ tone })} options={BRIEF_TONES.map((t) => ({ value: t, label: TONE_LABELS[t] }))} size="sm" />
        <Textarea
          label="Anything else?"
          help={`Optional. ${noteLeft} characters left.`}
          rows={3}
          maxLength={BRIEF_NOTE_MAX}
          placeholder="For our first third-party verification. Keep it formal."
          value={brief.note ?? ""}
          onChange={(note) => patch({ note })}
        />
        <Button type="submit" variant="primary" loading={suggest.isPending} className="w-full" data-testid="suggest-submit">
          <Sparkles aria-hidden className="size-4" /> Suggest templates
        </Button>
        <p className="text-xs text-muted">The AI sees your answers and data coverage counts, never your figures.</p>
      </form>

      <section aria-label="Suggested templates" className="space-y-3" aria-live="polite">
        {suggest.isError ? (
          <EmptyState variant="error" title="No suggestions" description={templateSuggestErrorMessage(suggest.error)} action={<Button onClick={onBrowse}>Browse all templates</Button>} />
        ) : suggest.isPending ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-96 w-full" />
            ))}
          </div>
        ) : !result ? (
          <div className={cn(panel, "p-6 text-sm text-muted")}>
            <p className="font-medium text-ink">Answer a few questions and we'll suggest templates</p>
            <p className="mt-1">We check each template against your approved {period} data, so you can see which pages would say “Not reported” before you build.</p>
          </div>
        ) : result.shortlist.length === 0 ? (
          <EmptyState title="No template fits these answers." description="Try another purpose or length, or browse all templates." action={<Button onClick={onBrowse}>Browse all templates</Button>} />
        ) : (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <p className="flex items-center gap-2 font-semibold text-ink">
                  Suggested for you {result.aiUsed && <AiChip />}
                </p>
                <p className="text-sm text-muted" data-testid="suggest-heading">
                  {heading}
                </p>
              </div>
            </div>
            {!result.aiUsed && (
              <Callout tone="info" title="Ordered by our rules">
                The AI couldn't rank these right now, so they're in rule order (fit and data readiness) without reasons.
              </Callout>
            )}
            <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Suggestions">
              {result.shortlist.map((s) => (
                <SuggestCard key={s.templateId} s={s} onPreview={() => setPreview(s)} onUse={() => onUse(s.templateId)} />
              ))}
            </ul>
            <p className="text-xs text-muted">
              Templates are shortlisted by rules (kind, standard, format, data coverage). The AI only orders the shortlist and writes the reasons. Not useful?{" "}
              <button type="button" onClick={onBrowse} className={cn("font-medium text-brand-text underline", focusRing)}>
                Browse all templates
              </button>
            </p>
          </>
        )}
      </section>
      <SuggestPreview
        suggestion={preview}
        state={state}
        onClose={() => setPreview(null)}
        onUse={(s) => {
          setPreview(null);
          onUse(s.templateId);
        }}
      />
    </div>
  );
}
