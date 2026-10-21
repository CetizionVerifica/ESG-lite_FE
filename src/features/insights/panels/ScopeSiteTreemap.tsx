import { entrance } from "../../../lib/insights/motion";
import { ChartFrame } from "../../../ui";
import { Legend, LegendItem } from "../components/kit";
import { usePanelView } from "../components/panelView";
import type { PanelProps } from "./index";
import { scopeSiteAria, scopeSiteOption, scopeSiteRows, scopeSiteTable } from "./scopeSiteLogic";

const Box = ({ className }: { className: string }) => <span className={`inline-block size-2.5 rounded-sm ${className}`} />;

/**
 * Story 2 without KPI tracking (05-ux §3): "By scope and site", a treemap of
 * each site's approved tonnes by scope, from the flow panel's site → scope
 * links (the same request as the Data flow tab).
 */
export function ScopeSiteTreemap({ response }: PanelProps<"flow">) {
  const rows = scopeSiteRows(response.data);
  const { view, setView } = usePanelView();
  return (
    <div data-testid="scope-site">
      <ChartFrame
        className="border-0! bg-transparent! p-0!"
        title="Where emissions come from"
        unit="tCO₂e"
        subtitle={response.label}
        option={(t) => scopeSiteOption(rows, t, entrance(1))}
        height={320}
        empty={rows.length === 0}
        emptyText="Approve emissions for this period to see them by site and scope."
        table={scopeSiteTable(rows)}
        exportName="insights-by-scope-and-site"
        ariaLabel={scopeSiteAria(rows)}
        view={view}
        onViewChange={setView}
        legend={
          <Legend label="Scopes">
            <LegendItem swatch={<Box className="bg-s1" />}>Scope 1</LegendItem>
            <LegendItem swatch={<Box className="bg-s2" />}>Scope 2</LegendItem>
            <LegendItem swatch={<Box className="bg-s3" />}>Scope 3</LegendItem>
          </Legend>
        }
      />
    </div>
  );
}
