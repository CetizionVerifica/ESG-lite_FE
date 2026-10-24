import { useCallback, useState } from "react";
import { PILLARS } from "../../../lib/insights/contracts";
import { useInsightsQuery } from "../../../lib/insights/query";
import { PILLAR_LABEL } from "../../../lib/kpi/labels";
import { Button, ChartFrame, SegmentedControl } from "../../../ui";
import type { PanelProps } from ".";
import { usePanelView } from "../components/panelView";
import { Legend, PillarLetter } from "../components/kit";
import { AUTO_GLYPH, type RingNode, pillarAfterClick, ringAria, ringOption, ringTable, topicBarsOption, zoomedPillar } from "./esgRingLogic";

export type RingShape = "ring" | "bars";

/**
 * IN-2 · A · ESG ring (05-ux §4 A): pillars inside, topics outside sized by
 * KPI count and shaded by coverage, the overall % in the centre. A click on a
 * pillar zooms onto it and sets the page `pillar` filter; a click on the
 * centre (or "All pillars") goes back. "Ring | Bars" (G2) morphs the ring into
 * one bar per topic (coverage %), and back. Every figure is the server's.
 */
export function EsgRing({ response, query }: PanelProps<"esg_ring">) {
  const data = response.data;
  const { set } = useInsightsQuery();
  const { view, setView } = usePanelView();
  const pillar = query.pillar;
  const zoomed = zoomedPillar(data, pillar);
  const back = useCallback(() => set({ pillar: null }), [set]);
  const [shape, setShape] = useState<RingShape>("ring");
  const onEvents = {
    click: (params: unknown) => {
      const next = pillarAfterClick((params as { data?: RingNode }).data, pillar);
      if (next !== undefined) set({ pillar: next });
    },
  };
  const table = ringTable(data, pillar);
  const present = PILLARS.filter((p) => data.pillars.some((x) => x.pillar === p));
  return (
    <div data-testid="esg-ring" data-pillar={zoomed?.pillar ?? "all"} data-shape={shape}>
      <ChartFrame
        className="border-0! bg-transparent! p-0!"
        title={zoomed ? `${PILLAR_LABEL[zoomed.pillar]} topics` : "KPI values approved"}
        unit="% of KPIs"
        option={(t) => (shape === "bars" ? topicBarsOption(data, pillar, t) : ringOption(data, pillar, t, back))}
        height={320}
        table={table}
        exportName="insights-esg-ring"
        ariaLabel={ringAria(data, pillar)}
        view={view}
        onViewChange={setView}
        onEvents={onEvents}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {zoomed && (
              <Button size="sm" variant="ghost" onClick={back} data-testid="ring-back">
                All pillars
              </Button>
            )}
            <SegmentedControl<RingShape>
              label="Ring or bars"
              size="sm"
              value={shape}
              onChange={setShape}
              options={[
                { value: "ring", label: "Ring" },
                { value: "bars", label: "Bars" },
              ]}
            />
          </div>
        }
        legend={
          <div className="flex flex-col gap-1.5">
            <Legend label="Pillars">
              {present.map((p) => (
                <li key={p}>
                  <PillarLetter pillar={p} withLabel />
                </li>
              ))}
            </Legend>
            <p className="text-xs text-muted">
              Paler topics have fewer KPI values approved. <span aria-hidden>{AUTO_GLYPH}</span>
              <span className="sr-only">The database mark</span> marks topics partly filled from your data.
            </p>
          </div>
        }
      />
    </div>
  );
}
