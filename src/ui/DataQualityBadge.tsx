import { DQ_INDICATORS, DQ_INDICATOR_LABELS, DQ_TONES, type DqScore, dqLabel, readDq } from "../lib/scope3/dq";
import { Badge } from "./Badge";
import { Tooltip } from "./Tooltip";
import { cn } from "./cn";
import { focusRing } from "./styles";

/** Three bars, filled for Good, two for Fair, one for Poor: the glyph carries the score with the word, never colour alone. */
function Bars({ score }: { score: DqScore }) {
  const filled = 4 - score;
  return (
    <svg aria-hidden viewBox="0 0 12 12" className="size-3 shrink-0" fill="currentColor">
      {[4, 7, 10].map((h, i) => (
        <rect key={h} x={1 + i * 4} y={11 - h} width="2.5" height={h} rx="0.5" opacity={i < filled ? 1 : 0.3} />
      ))}
    </svg>
  );
}

export type DataQualityBadgeProps = {
  /** A row's `dq` as the server sends it; anything that isn't a full score shows "Not scored". */
  dq: unknown;
  className?: string;
};

/**
 * A row's data quality (S3-3): Good / Fair / Poor with a signal glyph, and the
 * five indicators (technology, geography, time, completeness, reliability) in
 * the tooltip. A score someone entered by hand says so.
 */
export function DataQualityBadge({ dq: raw, className }: DataQualityBadgeProps) {
  const dq = readDq(raw);
  if (!dq) {
    return (
      <span className={cn("inline-flex", className)}>
        <Badge tone="neutral">Not scored</Badge>
      </span>
    );
  }
  const word = dqLabel(dq.overall);
  const lines = DQ_INDICATORS.map((k) => `${DQ_INDICATOR_LABELS[k]}: ${dqLabel(dq[k])}`);
  const source = dq.source === "manual" ? "Scored by hand" : "Scored automatically";
  return (
    <Tooltip
      toggleOnClick
      content={
        <span className="block space-y-0.5 text-left">
          <span className="block font-medium">
            Data quality: {word} · {source.toLowerCase()}
          </span>
          {lines.map((l) => (
            <span key={l} className="block">
              {l}
            </span>
          ))}
        </span>
      }
    >
      <span
        tabIndex={0}
        role="img"
        aria-label={`Data quality ${word}. ${lines.join(", ")}. ${source}.`}
        className={cn("inline-flex rounded-chip", focusRing, className)}
        data-testid="dq-badge"
        data-score={dq.overall}
      >
        <Badge tone={DQ_TONES[dq.overall]} className="gap-1">
          <Bars score={dq.overall} />
          {word}
          {dq.source === "manual" && <span className="font-normal opacity-80">· by hand</span>}
        </Badge>
      </span>
    </Tooltip>
  );
}
