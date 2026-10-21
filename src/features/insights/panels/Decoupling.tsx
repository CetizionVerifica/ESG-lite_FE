import type { ReactNode } from "react";
import type { EventRef } from "../../../lib/insights/contracts";
import { ChartFrame } from "../../../ui";
import type { PanelProps } from ".";
import { usePanelView } from "../components/panelView";
import { Legend, LegendItem, LineSwatch } from "../components/kit";
import { COMBINED_NOTE, SERIES_SWATCH, decouplingAria, decouplingOption, decouplingTable } from "./decouplingLogic";

export interface DecouplingProps extends PanelProps<"decoupling"> {
  /** IN-3: the `decoupling` rule's sentence, shown above the chart when it fires. */
  sentence?: ReactNode;
  /** IN-4: events drawn as marks on the chart (none until IN-4 wires them). */
  events?: EventRef[];
}

/**
 * IN-2 · B · Decoupling (05-ux §4 B): output, emissions and intensity indexed
 * to the base year (= 100), each line ending in the server's change since
 * then. Every figure is the server's `index`, `raw` and `headline`.
 */
export function Decoupling({ response, sentence, events }: DecouplingProps) {
  const data = response.data;
  const { view, setView } = usePanelView();
  return (
    <div data-testid="decoupling" data-decoupled={data.decoupled}>
      {/* Rule sentence slot (IN-3 fills it). */}
      {sentence ? (
        <p className="mb-2 text-sm text-ink" data-testid="decoupling-sentence">
          {sentence}
        </p>
      ) : null}
      <ChartFrame
        className="border-0! bg-transparent! p-0!"
        title="Output and emissions since the base year"
        subtitle={`Indexed, ${data.base_year} = 100`}
        option={(t) => decouplingOption(data, t, events)}
        height={300}
        table={decouplingTable(data)}
        exportName="insights-decoupling"
        ariaLabel={decouplingAria(data)}
        view={view}
        onViewChange={setView}
        legend={
          <Legend label="Lines">
            {data.series.map((s) => (
              <LegendItem key={s.key} swatch={<LineSwatch dash={SERIES_SWATCH[s.key].dash} className={SERIES_SWATCH[s.key].className} />}>
                {s.label}
              </LegendItem>
            ))}
          </Legend>
        }
      />
      {data.combined_output && (
        <p className="mt-2 text-xs text-muted" data-testid="decoupling-combined">
          {COMBINED_NOTE}
        </p>
      )}
    </div>
  );
}
