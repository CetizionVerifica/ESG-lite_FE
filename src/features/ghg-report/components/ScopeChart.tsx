import { useState } from "react";
import { ChartFrame, SegmentedControl, formatEmissions, formatPercent } from "../../../ui";
import { type ReportFigures, SCOPES, scopeTable } from "../logic";

type Measure = "t" | "pct";

/**
 * Emissions by scope, last year next to this one. Each scope keeps its scope
 * colour; last year's bar is the lighter one. "%" shows each year's split.
 */
export function ScopeChart({ figures, prevLabel, selLabel }: { figures: ReportFigures; prevLabel: string; selLabel: string }) {
  const [measure, setMeasure] = useState<Measure>("t");
  const rows = scopeTable(figures);
  const pct = measure === "pct";
  const pick = (r: (typeof rows)[number], year: "previous" | "selected") => (pct ? r[`${year}Pct`] : r[year]);
  const fmt = (v: unknown) => (typeof v !== "number" ? "—" : pct ? formatPercent(v) : formatEmissions(v));

  return (
    <ChartFrame
      title="Emissions by scope"
      unit={pct ? "% of total" : "tCO₂e"}
      subtitle="Renewables aren't a scope, so they're left out here; the Total figure above shows them as saved."
      empty={figures.selected.total === 0 && figures.previous.total === 0}
      emptyText="No Scope 1–3 emissions in either period."
      exportName="ghg-emissions-by-scope"
      actions={
        <SegmentedControl<Measure>
          size="sm"
          label="Show as"
          value={measure}
          onChange={setMeasure}
          options={[
            { value: "t", label: "tCO₂e" },
            { value: "pct", label: "%" },
          ]}
        />
      }
      table={{
        columns: [
          { id: "scope", header: "Scope" },
          { id: "previous", header: `${prevLabel} tCO₂e`, numeric: true, decimals: 3 },
          { id: "previousPct", header: `${prevLabel} %`, numeric: true, decimals: 1 },
          { id: "selected", header: `${selLabel} tCO₂e`, numeric: true, decimals: 3 },
          { id: "selectedPct", header: `${selLabel} %`, numeric: true, decimals: 1 },
        ],
        rows: rows.map(({ scope, previous, previousPct, selected, selectedPct }) => ({ scope, previous, previousPct, selected, selectedPct })),
      }}
      option={(t) => {
        const colors = [t.scopes.s1, t.scopes.s2, t.scopes.s3];
        return {
          grid: { left: 8, right: 8, top: 32, bottom: 4, containLabel: true },
          legend: { top: 0, data: [prevLabel, selLabel] },
          tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: fmt },
          xAxis: { type: "category", data: [...SCOPES] },
          yAxis: { type: "value", axisLabel: pct ? { formatter: "{value}%" } : undefined },
          series: [
            {
              name: prevLabel,
              type: "bar",
              barMaxWidth: 36,
              itemStyle: { color: t.scopes.s1, opacity: 0.45 },
              data: rows.map((r, i) => ({ value: pick(r, "previous"), itemStyle: { color: colors[i], opacity: 0.45 } })),
            },
            {
              name: selLabel,
              type: "bar",
              barMaxWidth: 36,
              itemStyle: { color: t.scopes.s1 },
              data: rows.map((r, i) => ({ value: pick(r, "selected"), itemStyle: { color: colors[i] } })),
            },
          ],
        };
      }}
    />
  );
}
