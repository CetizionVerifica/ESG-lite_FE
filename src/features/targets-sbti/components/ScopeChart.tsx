import { ChartFrame, formatEmissions } from "../../../ui";
import type { TargetModel } from "../logic";

/** Scope-wise targets, stacked in the fixed Scope 1/2/3 colours. */
export function ScopeChart({ model }: { model: TargetModel }) {
  const years = model.scopes.map((r) => String(r.year));
  const s3 = model.scope3Required;
  return (
    <ChartFrame
      title="Scope-wise targets"
      unit="tCO₂e"
      subtitle={s3 ? undefined : "Scope 3 is below 40% of base emissions, so it isn't in the target."}
      height={280}
      exportName={`targets-scopes-${model.baseYear}-${model.targetYear}`}
      option={(t) => ({
        grid: { left: 8, right: 8, top: 32, bottom: 4, containLabel: true },
        legend: { top: 0, left: 0 },
        tooltip: { trigger: "axis", axisPointer: { type: "shadow" }, valueFormatter: (v) => (typeof v === "number" ? formatEmissions(v) : "—") },
        xAxis: { type: "category", data: years },
        yAxis: { type: "value" },
        series: [
          { name: "Scope 1", type: "bar", stack: "scopes", barMaxWidth: 28, itemStyle: { color: t.scopes.s1 }, data: model.scopes.map((r) => r.s1) },
          { name: "Scope 2", type: "bar", stack: "scopes", barMaxWidth: 28, itemStyle: { color: t.scopes.s2 }, data: model.scopes.map((r) => r.s2) },
          ...(s3
            ? [{ name: "Scope 3", type: "bar" as const, stack: "scopes", barMaxWidth: 28, itemStyle: { color: t.scopes.s3 }, data: model.scopes.map((r) => r.s3 ?? 0) }]
            : []),
        ],
      })}
    />
  );
}
