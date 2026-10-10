import { Tooltip, cn } from "../../../ui";
import { STAGE_LABEL, type FootprintRow, stageSegments } from "../logic";

// Stage tokens in fixed order (docs/pcf): A1 materials, A2 transport, A3 energy, A3 packaging, A3 waste.
const FILL = {
  A1: "bg-series-1",
  A2: "bg-series-2",
  A3_energy: "bg-series-3",
  A3_packaging: "bg-series-4",
  A3_waste: "bg-series-5",
  hidden: "bg-line",
} as const;

const fmt = (v: number) => v.toLocaleString("en-GB", { maximumFractionDigits: 3 });

/** 60px stacked bar of the footprint by stage. Licensed stages the viewer can't see show as one grey part. */
export function StageBar({ row }: { row: Pick<FootprintRow, "total" | "stages"> }) {
  const parts = stageSegments(row.total, row.stages);
  if (parts.length === 0) return <span className="text-muted">—</span>;
  const text = parts.map((p) => `${p.stage === "hidden" ? "Licensed, hidden" : STAGE_LABEL[p.stage]}: ${fmt(p.value)} kg (${Math.round(p.pct)}%)`).join("; ");
  return (
    <Tooltip content={text}>
      <span role="img" aria-label={`By stage: ${text}`} className="flex h-2.5 w-[60px] overflow-hidden rounded-full bg-tint">
        {parts.map((p) => (
          <span key={p.stage} className={cn("h-full", FILL[p.stage])} style={{ width: `${p.pct}%` }} />
        ))}
      </span>
    </Tooltip>
  );
}
