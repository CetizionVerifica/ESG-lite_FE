import { useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useAuth } from "../../../context/AuthContext";
import { ChartFrame, cn, focusRing } from "../../../ui";
import { StatusChip } from "../components/kit";
import { usePanelView } from "../components/panelView";
import type { PanelProps } from ".";
import {
  ADD_SCORES_LINK,
  TABLE_COLUMNS,
  type MaterialityPoint,
  ariaSentence,
  canAddScores,
  clickedLink,
  countsText,
  materialityOption,
  notScoredText,
  pointLabel,
  splitPoints,
  tableRows,
} from "./materialityLogic";

/**
 * IN-7 · Materiality × performance (05-ux §4 F): where each material topic
 * sits on impact × financial effect, coloured and labelled by its live target
 * status, with the top-right "Act here" corner. A bubble opens the topic's
 * KPIs (`point.link`). Without scores: the topics with their status, and an
 * "Add scores" link for Admins. Every position, weight and status is the server's.
 */
export function MaterialityMatrix({ response }: PanelProps<"materiality">) {
  const { role } = useAuth();
  const data = response.data;
  if (!data.scored) return <UnscoredList points={data.points} canScore={canAddScores(role)} />;
  return <Matrix points={data.points} label={response.label} />;
}

function Matrix({ points, label }: { points: MaterialityPoint[]; label: string }) {
  const navigate = useNavigate();
  const { view, setView } = usePanelView();
  const { placed, unplaced } = splitPoints(points);
  const onEvents = useMemo(
    () => ({
      click: (params: unknown) => {
        const link = clickedLink(params);
        if (link) navigate(link);
      },
    }),
    [navigate],
  );
  const notScored = notScoredText(unplaced);
  return (
    <div className="min-w-0 space-y-3" data-testid="materiality-matrix">
      <ChartFrame
        className="border-0! bg-transparent! p-0!"
        title="What matters most, and how you're doing"
        subtitle={`${label} · bubble size shows weight · scores 0–10`}
        option={(t) => materialityOption(points, t)}
        height={380}
        empty={placed.length === 0}
        emptyText="No material topic has both scores yet."
        table={{ columns: TABLE_COLUMNS, rows: tableRows(points) }}
        exportName="insights-materiality"
        ariaLabel={ariaSentence(points)}
        view={view}
        onViewChange={setView}
        onEvents={onEvents}
      />
      {notScored && (
        <p className="text-xs text-muted" data-testid="materiality-not-scored">
          {notScored}
        </p>
      )}
      {/* The bubbles' drill-down, reachable by keyboard too. */}
      <nav aria-label="Open a topic's KPIs">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" data-testid="materiality-topic-links">
          {points.map((p) => (
            <li key={p.esrs_topic}>
              <Link to={p.link} className={cn("inline-flex items-center gap-1 rounded-control text-brand-text hover:underline", focusRing)}>
                {pointLabel(p)}
                <ArrowRight aria-hidden className="size-3" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

function UnscoredList({ points, canScore }: { points: MaterialityPoint[]; canScore: boolean }) {
  return (
    <div className="min-w-0 space-y-3" data-testid="materiality-unscored">
      <p className="text-sm text-muted">
        {canScore ? "Score each material topic for its impact and its financial effect to place it on the matrix." : "The matrix shows once an Admin scores each material topic in KPI setup."}
      </p>
      <ul className="divide-y divide-line rounded-card border border-line" aria-label="Material topics">
        {points.map((p) => (
          <li key={p.esrs_topic} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2" data-testid="materiality-topic">
            <Link to={p.link} className={cn("min-w-0 rounded-control text-sm font-medium text-ink hover:underline", focusRing)}>
              {p.label}
            </Link>
            <span className="text-xs text-muted">{p.esrs_topic}</span>
            <StatusChip status={p.status} />
            <span className="ml-auto text-xs tabular-nums text-muted">{countsText(p)}</span>
          </li>
        ))}
      </ul>
      {canScore && (
        <Link to={ADD_SCORES_LINK} className={cn("inline-flex items-center gap-1 rounded-control text-sm font-medium text-brand-text hover:underline", focusRing)} data-testid="materiality-add-scores">
          Add scores
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      )}
    </div>
  );
}
