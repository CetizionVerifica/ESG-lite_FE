import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PILLARS } from "../../../lib/insights/contracts";
import { useInsightsQuery } from "../../../lib/insights/query";
import { PILLAR_LABEL } from "../../../lib/kpi/labels";
import { ChartFrame, cn, focusRing } from "../../../ui";
import type { PanelProps } from ".";
import { usePanelView } from "../components/panelView";
import { Legend, LegendItem, PillarLetter, StatusChip } from "../components/kit";
import { rightLabel, wallAria, wallClick, wallHeight, wallOption, wallTable } from "./targetWallLogic";

/** The element's width, following resizes (0 until measured or without ResizeObserver). */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth);
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * IN-2 · H · Target wall (05-ux §4 H): one bullet bar per target, worst first
 * as the server sends them — soft track to the target, progress in its status
 * colour, an ink tick where it should be by now. A row opens its target
 * (`item.link`); a pillar letter sets the page `pillar` filter. The list
 * under the chart does both from the keyboard.
 */
export function TargetWall({ response, query }: PanelProps<"target_wall">) {
  const items = response.data.items;
  const navigate = useNavigate();
  const { set } = useInsightsQuery();
  const { view, setView } = usePanelView();
  const [ref, width] = useWidth<HTMLDivElement>();
  const togglePillar = (p: (typeof PILLARS)[number]) => set({ pillar: query.pillar === p ? null : p });
  const onEvents = {
    click: (params: unknown) => {
      const action = wallClick(params as Parameters<typeof wallClick>[0], items);
      if (!action) return;
      if ("pillar" in action) togglePillar(action.pillar);
      else navigate(action.link);
    },
  };
  const statuses = [...new Set(items.map((i) => i.status))];
  return (
    <div ref={ref} data-testid="target-wall" className="min-w-0">
      <ChartFrame
        className="border-0! bg-transparent! p-0!"
        title="Progress to target"
        unit="% of the way"
        option={(t) => wallOption(items, t, width || 600)}
        height={wallHeight(items.length)}
        empty={items.length === 0}
        emptyText="No targets yet. Set an SBTi target or KPI targets to see progress here."
        table={wallTable(items)}
        exportName="insights-target-wall"
        ariaLabel={wallAria(items)}
        view={view}
        onViewChange={setView}
        onEvents={onEvents}
        legend={
          <Legend label="How to read the bars">
            <LegendItem swatch={<span className="inline-block h-2.5 w-5 rounded-full bg-tint" />}>Target (100%)</LegendItem>
            <LegendItem swatch={<span className="inline-block h-3 w-0.5 bg-ink" />}>Expected by now</LegendItem>
            {statuses.map((s) => (
              <li key={s} className="flex items-center">
                <StatusChip status={s} />
              </li>
            ))}
          </Legend>
        }
      />
      {/* The rows as links and pillar buttons, for the keyboard and screen readers; shown while focused. */}
      <ul aria-label="Targets" className="sr-only mt-3 flex-col gap-1.5 focus-within:not-sr-only focus-within:flex" data-testid="wall-list">
        {items.map((i) => (
          <li key={i.id} className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
            <button type="button" className={cn("rounded-chip", focusRing)} aria-pressed={query.pillar === i.pillar} aria-label={`Show ${PILLAR_LABEL[i.pillar]} only`} onClick={() => togglePillar(i.pillar)}>
              <PillarLetter pillar={i.pillar} />
            </button>
            <Link to={i.link} className={cn("min-w-0 truncate rounded-control text-ink hover:underline", focusRing)}>
              {i.name}
            </Link>
            <StatusChip status={i.status} />
            <span className="text-xs text-muted">{rightLabel(i)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
