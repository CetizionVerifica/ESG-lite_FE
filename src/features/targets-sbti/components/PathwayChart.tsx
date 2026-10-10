import { useTheme } from "../../../theme";
import { ChartFrame, formatEmissions } from "../../../ui";
import { type TargetModel, milestonesIn, statusWord } from "../logic";

/** Target bars (brand) with the actual line (ink) and the 2030–2050 milestones. */
export function PathwayChart(props: { model: TargetModel | undefined; loading: boolean; error: string | null; onRetry: () => void; className?: string }) {
  const { model, loading, error, onRetry, className } = props;
  const { tokens } = useTheme();
  const years = model?.pathway.map((r) => String(r.year)) ?? [];
  const actualBy = new Map(model?.actual.map((r) => [r.year, r]) ?? []);
  const milestones = model ? milestonesIn(model) : [];
  const nearTarget = model?.kind === "near" ? model.targetYear : null;

  return (
    <ChartFrame
      className={className}
      title={model?.kind === "netzero" ? "Net-zero pathway" : "Near-term pathway"}
      unit="tCO₂e"
      subtitle={model && `${model.baseYear} to ${model.targetYear}, falling ${model.annualRatePct}% a year`}
      height={320}
      loading={loading}
      error={error}
      onRetry={onRetry}
      empty={!!model && model.pathway.length === 0}
      exportName={model ? `targets-pathway-${model.baseYear}-${model.targetYear}` : "targets-pathway"}
      table={
        model && {
          columns: [
            { id: "year", header: "Year" },
            { id: "target", header: "Target tCO₂e", numeric: true, decimals: 3 },
            { id: "actual", header: "Actual tCO₂e", numeric: true, decimals: 3 },
            { id: "status", header: "Status" },
          ],
          rows: model.pathway.map((r) => {
            const a = actualBy.get(r.year);
            return { year: String(r.year), target: r.target, actual: a?.actual ?? null, status: a ? statusWord(a.status) : "—" };
          }),
        }
      }
      legend={
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block size-2.5 rounded-sm bg-brand" />
            Target
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-0.5 w-4 bg-ink" />
            Actual (approved)
          </li>
          {milestones.length > 0 && (
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-3 border-l border-dashed border-muted" />
              Milestones
            </li>
          )}
        </ul>
      }
      option={{
        grid: { left: 8, right: 8, top: 24, bottom: 4, containLabel: true },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          valueFormatter: (v) => (typeof v === "number" ? formatEmissions(v) : "No data"),
        },
        xAxis: { type: "category", data: years },
        yAxis: { type: "value" },
        series: [
          {
            name: "Target",
            type: "bar",
            barMaxWidth: 28,
            itemStyle: { color: tokens.brand },
            data: model?.pathway.map((r) => r.target) ?? [],
            markLine: {
              silent: true,
              symbol: ["none", "none"],
              lineStyle: { type: "dashed", color: tokens.muted },
              label: { color: tokens.muted, position: "insideEndTop", fontSize: 10 },
              data: [
                ...milestones.filter((y) => y !== nearTarget).map((y) => ({ xAxis: String(y), label: { formatter: String(y) } })),
                ...(nearTarget ? [{ xAxis: String(nearTarget), lineStyle: { color: tokens.ink }, label: { formatter: `Target ${nearTarget}`, color: tokens.ink } }] : []),
              ],
            },
          },
          {
            name: "Actual",
            type: "line",
            connectNulls: false,
            symbolSize: 8,
            z: 3,
            // A panel-coloured ring keeps the points readable over brand bars that are close to ink.
            lineStyle: { color: tokens.ink, width: 2.5 },
            itemStyle: { color: tokens.ink, borderColor: tokens.panel, borderWidth: 2 },
            data: model?.pathway.map((r) => actualBy.get(r.year)?.actual ?? null) ?? [],
          },
        ],
      }}
    />
  );
}
