import { Badge, type BadgeTone, Tooltip, cn, focusRing, formatPercent } from "../../../ui";
import { type Scope3ReportRow, dqWord } from "../../../lib/scope3/report";

const TONE: Record<"Good" | "Fair" | "Poor", BadgeTone> = { Good: "good", Fair: "info", Poor: "warn" };

/**
 * A category's emission-weighted data quality: the word and score, with the
 * good / fair / poor shares in the tooltip. Local to the report until S3-3's
 * shared `DataQualityBadge` (per-entry, five indicators) lands in src/ui.
 */
export function DqCell({ row }: { row: Scope3ReportRow }) {
  const word = dqWord(row.dq.overall);
  if (!word) return <span className="text-muted">Not scored</span>;
  const detail = `Good ${formatPercent(row.dq.good_pct)} · Fair ${formatPercent(row.dq.fair_pct)} · Poor ${formatPercent(row.dq.poor_pct)} of this category's tCO₂e`;
  return (
    <Tooltip content={detail}>
      <span tabIndex={0} aria-label={`${word}, score ${row.dq.overall?.toFixed(1)}. ${detail}`} className={cn("inline-flex rounded-chip", focusRing)}>
        <Badge tone={TONE[word]}>
          {word} · {row.dq.overall?.toFixed(1)}
        </Badge>
      </span>
    </Tooltip>
  );
}
