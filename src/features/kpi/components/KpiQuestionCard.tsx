import { type ReactNode, useState } from "react";
import { ExternalLink, MessageSquareWarning, X } from "lucide-react";
import type { FrameworkUse } from "../../../lib/kpi/badges";
import type { KpiBreakdowns, KpiEvidenceOut, KpiValueType } from "../../../lib/kpi/contracts";
import { breakdownTitle, checkBreakdown, compareToLast } from "../../../lib/kpi/entry";
import { breakdownLabel } from "../../../lib/kpi/labels";
import { conversionLine, formatWithUnit } from "../../../lib/kpi/units";
import {
  AiChip,
  AiLabel,
  Badge,
  Button,
  Callout,
  FileDrop,
  type FileDropItem,
  NumberField,
  SegmentedControl,
  TextField,
  Textarea,
  Tooltip,
  UnitInput,
  cn,
  focusRing,
} from "../../../ui";
import { FrameworkBadges } from "./FrameworkBadges";

/** What the contributor is typing; saved as a draft (`PUT /kpi/values`). */
export interface EntryDraft {
  value: number | null;
  /** For yes/no, choice and text KPIs. */
  text: string;
  unit: string;
  breakdown: Record<string, number | null>;
  isEstimate: boolean;
  comment: string;
}

/** The question a card asks: one KPI for one site and period. */
export interface QuestionCardItem {
  /** Already filled in: "How much water did Bahrain plant take in during September 2026?" */
  question: string;
  help: string | null;
  valueType: KpiValueType;
  canonicalUnit: string | null;
  allowedUnits: string[];
  decimals?: number;
  breakdowns: KpiBreakdowns | null;
  needsEvidence: boolean;
  usedIn: FrameworkUse[];
  /** Last year's same period: "Last September" 1,050 m³. */
  last: { label: string; value: number | null; unit: string | null } | null;
}

export type KpiQuestionCardProps = {
  item: QuestionCardItem;
  draft: EntryDraft;
  onChange: (patch: Partial<EntryDraft>) => void;
  /** A field lost focus: save now. */
  onBlur?: () => void;
  /** Pending or approved values can't change. */
  readOnly?: boolean;
  /** The reviewer's words on a sent-back value, shown on top. */
  reviewComment?: string | null;
  reviewerName?: string | null;
  evidence?: KpiEvidenceOut[];
  uploads?: FileDropItem[];
  onAddFiles?: (files: File[]) => void;
  onRemoveEvidence?: (evidence: KpiEvidenceOut) => void;
  /** Ids inside the card start with this. */
  idBase: string;
  /** KPI-12: AI suggestions for this card; "Use" only fills the input. */
  suggestions?: CardSuggestion[];
  onUseSuggestion?: (id: string) => void;
  onDismissSuggestion?: (id: string) => void;
  /** Inputs still holding what the AI suggested (the AiLabel pattern from add-data). */
  aiFields?: { value: boolean; breakdown: string[] };
};

/** One AI suggestion as the card shows it (KPI-12; built by My KPIs). */
export interface CardSuggestion {
  id: string;
  label: string;
  source: string;
  quote: string | null;
  why: string | null;
  check: boolean;
  blocked: string | null;
}

const NUMERIC: KpiValueType[] = ["number", "percent", "integer", "currency"];
const EVIDENCE_TYPES = [".pdf", ".png", ".jpg", ".jpeg", ".webp", ".heic", ".xlsx", ".xls", ".csv", ".docx"];

/**
 * KPI-7 · One KPI, asked as a plain question (05-ux S3, layer rule 3): the
 * value with its unit and a live conversion, last year's figure with the
 * change, a gentle nudge for big jumps, and the optional split, evidence and
 * comment that open only when asked for. Used by My KPIs and, later, the
 * table view's row drawer and the review drawer's edit mode.
 */
export function KpiQuestionCard({
  item,
  draft,
  onChange,
  onBlur,
  readOnly = false,
  reviewComment,
  reviewerName,
  evidence = [],
  uploads = [],
  onAddFiles,
  onRemoveEvidence,
  idBase,
  suggestions = [],
  onUseSuggestion,
  onDismissSuggestion,
  aiFields,
}: KpiQuestionCardProps) {
  const amountLabel = <AiLabel text="Amount" ai={!!aiFields?.value} />;
  const answerLabel = <AiLabel text="Answer" ai={!!aiFields?.value} />;
  const numeric = NUMERIC.includes(item.valueType);
  const unit = draft.unit || item.canonicalUnit || "";
  const units = item.allowedUnits.length ? item.allowedUnits : item.canonicalUnit ? [item.canonicalUnit] : [];
  const conversion = numeric ? conversionLine(draft.value, unit || null, item.canonicalUnit) : null;
  const compare = numeric && item.last ? compareToLast({ value: draft.value, unit: unit || null }, { value: item.last.value, unit: item.last.unit }, item.canonicalUnit, item.last.label) : null;
  const split = item.breakdowns?.values ?? [];
  const sum = split.length ? checkBreakdown(draft.value, draft.breakdown, unit || null) : null;
  const filledParts = Object.values(draft.breakdown).filter((v) => v !== null && v !== undefined).length;
  const evidenceCount = evidence.length + uploads.filter((u) => u.status !== "done" && u.status !== "error").length;

  return (
    <div className="space-y-4" onBlur={onBlur}>
      {reviewComment && (
        <Callout tone="warn" icon={MessageSquareWarning} title={`${reviewerName ?? "Your reviewer"} sent this back`}>
          “{reviewComment}”
        </Callout>
      )}

      <div className="space-y-1">
        <h3 id={`${idBase}-question`} className="text-lg font-semibold leading-snug text-ink">
          {item.question}
        </h3>
        {item.help && <p className="text-sm text-muted">{item.help}</p>}
      </div>

      {!readOnly && suggestions.length > 0 && (
        <section aria-label="AI suggestions" className="space-y-2">
          {suggestions.map((sg) => (
            <div key={sg.id} className="space-y-1.5 rounded-control border border-line bg-tint p-3" data-testid="ai-suggestion">
              <p className="flex flex-wrap items-center gap-2 text-sm">
                {sg.check ? <Badge tone="warn">Check this</Badge> : <AiChip label="AI suggestion" hint="" />}
                <b className="font-num font-medium text-ink">{sg.label}</b>
              </p>
              {sg.quote ? (
                <Tooltip content={`“${sg.quote}”`} toggleOnClick>
                  <button type="button" className={cn("text-left text-xs text-muted underline decoration-dotted underline-offset-2", focusRing)}>
                    {sg.source}
                  </button>
                </Tooltip>
              ) : (
                <p className="text-xs text-muted">{sg.source}</p>
              )}
              {sg.check && sg.why && <p className="text-xs text-muted">{sg.why}</p>}
              {sg.blocked && <p className="text-xs text-warn">{sg.blocked}</p>}
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" disabled={!!sg.blocked} onClick={() => onUseSuggestion?.(sg.id)} aria-label={`Use ${sg.label}`}>
                  Use
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onDismissSuggestion?.(sg.id)} aria-label={`Dismiss ${sg.label}`}>
                  Dismiss
                </Button>
              </div>
            </div>
          ))}
        </section>
      )}

      {numeric ? (
        <div className="space-y-1">
          {units.length > 1 ? (
            <UnitInput
              label={amountLabel}
              value={{ value: draft.value, unit }}
              units={units}
              disabled={readOnly}
              onChange={(v) => onChange({ value: v.value, unit: v.unit })}
              placeholder="0"
            />
          ) : (
            <NumberField label={amountLabel} value={draft.value} unit={unit || undefined} disabled={readOnly} onChange={(value) => onChange({ value })} placeholder="0" />
          )}
          <p aria-live="polite" className="min-h-5 text-sm text-muted" data-testid="kpi-conversion">
            {conversion}
          </p>
        </div>
      ) : item.valueType === "yes_no" ? (
        <div className="space-y-1">
          <p className="text-sm font-medium text-ink">Answer</p>
          <SegmentedControl<"yes" | "no" | "">
            label="Answer"
            value={(draft.text === "yes" || draft.text === "no" ? draft.text : "") as "yes" | "no" | ""}
            onChange={(v) => !readOnly && onChange({ text: v })}
            options={[
              { value: "yes", label: "Yes", disabled: readOnly },
              { value: "no", label: "No", disabled: readOnly },
            ]}
          />
        </div>
      ) : item.valueType === "text" ? (
        <Textarea label={answerLabel} value={draft.text} disabled={readOnly} onChange={(text) => onChange({ text })} rows={4} />
      ) : (
        <TextField label={answerLabel} value={draft.text} disabled={readOnly} onChange={(text) => onChange({ text })} />
      )}

      {item.last && numeric && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted" data-testid="kpi-compare">
          <span>
            {item.last.label} <b className="font-num font-medium text-ink">{formatWithUnit(item.last.value, item.last.unit ?? item.canonicalUnit)}</b>
          </span>
          {compare?.changeText && (
            <span className={cn(compare.nudge ? "font-medium text-warn" : "text-muted")}>
              {compare.changeText} on {item.last.label.charAt(0).toLowerCase() + item.last.label.slice(1)}
            </span>
          )}
        </p>
      )}

      {compare?.nudge && !readOnly && (
        <div role="status" className="space-y-2 rounded-control border border-warn/30 bg-warn-soft p-3">
          <p className="text-sm font-medium text-ink">{compare.nudge}</p>
          <TextField
            label="Tell your reviewer why (optional)"
            value={draft.comment}
            onChange={(comment) => onChange({ comment })}
            placeholder="For example: new cooling tower filled this month"
          />
        </div>
      )}

      <div className="divide-y divide-line rounded-control border border-line">
        {split.length > 0 && (
          <Section
            key={aiFields?.breakdown.length ? "split-ai" : "split"}
            title={breakdownTitle(item.breakdowns?.by)}
            hint={item.usedIn.some((u) => u.framework === "BRSR") ? "needed for BRSR" : "optional"}
            initiallyOpen={filledParts > 0}
          >
            <div className="space-y-2 px-3 pb-3">
              <div className="grid gap-2 sm:grid-cols-3">
                {split.map((key) => (
                  <NumberField
                    key={key}
                    label={<AiLabel text={breakdownLabel(key)} ai={!!aiFields?.breakdown.includes(key)} />}
                    value={draft.breakdown[key] ?? null}
                    unit={unit || undefined}
                    disabled={readOnly}
                    onChange={(v) => onChange({ breakdown: { ...draft.breakdown, [key]: v } })}
                  />
                ))}
              </div>
              {sum && sum.state !== "empty" && (
                <p aria-live="polite" className={cn("text-sm", sum.state === "ok" ? "text-good" : "text-warn")} data-testid="kpi-split-sum">
                  {sum.text}
                </p>
              )}
            </div>
          </Section>
        )}

        <Section
          title="Attach evidence"
          hint={evidenceCount ? `${evidenceCount} ${evidenceCount === 1 ? "file" : "files"}` : item.needsEvidence ? "needed for BRSR Core" : "optional"}
          initiallyOpen={item.needsEvidence && evidenceCount === 0 && !readOnly}
        >
          <div className="space-y-2 px-3 pb-3">
            {evidence.length > 0 && (
              <ul aria-label="Attached evidence" className="space-y-1">
                {evidence.map((e) => (
                  <li key={e.id} className="flex items-center gap-2 rounded-control border border-line px-2 py-1.5 text-sm">
                    <a href={e.document_url} target="_blank" rel="noreferrer" className={cn("flex min-w-0 flex-1 items-center gap-1 truncate text-brand-text underline", focusRing)}>
                      <span className="truncate">{e.document_name}</span>
                      <ExternalLink aria-hidden className="size-3 shrink-0" />
                    </a>
                    {!readOnly && onRemoveEvidence && (
                      <button type="button" aria-label={`Remove ${e.document_name}`} onClick={() => onRemoveEvidence(e)} className={cn("rounded-chip p-1 text-muted hover:text-ink", focusRing)}>
                        <X aria-hidden className="size-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {!readOnly && onAddFiles && (
              <FileDrop
                label="Drop a bill, meter photo or report here"
                help="PDF, image or spreadsheet, up to 10 MB."
                items={uploads.filter((u) => u.status !== "done")}
                onAdd={onAddFiles}
                accept={EVIDENCE_TYPES}
                maxSize={10 * 1024 * 1024}
              />
            )}
          </div>
        </Section>

        <Section title="Add a comment" hint={draft.comment ? "added" : "optional"} initiallyOpen={!!draft.comment && !compare?.nudge}>
          <div className="px-3 pb-3">
            <Textarea label="Comment" hideLabel value={draft.comment} disabled={readOnly} onChange={(comment) => onChange({ comment })} placeholder="Anything your reviewer should know" rows={2} />
          </div>
        </Section>
      </div>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={draft.isEstimate} disabled={readOnly} onChange={(e) => onChange({ isEstimate: e.target.checked })} className={cn("size-4 accent-brand", focusRing)} />
        This is an estimate
      </label>

      {item.usedIn.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted">Used in</span>
          <FrameworkBadges items={item.usedIn} tips />
        </div>
      )}
    </div>
  );
}

/** An optional part of the card ("open only when asked for"): native details, open at first when it already has content. */
function Section({ title, hint, initiallyOpen, children }: { title: string; hint: string; initiallyOpen: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(initiallyOpen);
  return (
    <details open={open} onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className={cn("flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium text-ink hover:bg-tint", focusRing)}>
        <span>{title}</span>
        <small className="font-normal text-muted">{hint}</small>
      </summary>
      {children}
    </details>
  );
}
