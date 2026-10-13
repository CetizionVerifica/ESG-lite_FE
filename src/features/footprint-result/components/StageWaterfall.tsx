import { ChartFrame } from "../../../ui";
import { STAGES, type WaterfallStep } from "../logic";

const fmt = (v: number) => v.toLocaleString("en-GB", { maximumFractionDigits: 3 });

type Props = { steps: WaterfallStep[]; unitText: string; exportName: string; hiddenNote: boolean };

/** A1 → A2 → A3 energy → packaging → waste → total, each stage in its fixed series token. */
export function StageWaterfall({ steps, unitText, exportName, hiddenNote }: Props) {
  return (
    <ChartFrame
      title="By stage"
      unit={unitText}
      subtitle={hiddenNote ? "Stages with a licensed factor are shown together; their split is hidden." : undefined}
      exportName={exportName}
      empty={steps.length <= 1}
      emptyText="Nothing to show yet."
      table={{
        columns: [
          { id: "stage", header: "Stage" },
          { id: "value", header: unitText, numeric: true, decimals: 3 },
        ],
        rows: steps.map((s) => ({ stage: s.label, value: s.value })),
      }}
      option={(t) => {
        const colorOf = (s: WaterfallStep) => {
          if (s.key === "total") return t.textStyle.color;
          if (s.key === "hidden") return t.valueAxis.axisLabel.color;
          return t.color[STAGES.indexOf(s.key)];
        };
        return {
          grid: { left: 8, right: 8, top: 24, bottom: 4, containLabel: true },
          tooltip: {
            trigger: "axis",
            axisPointer: { type: "shadow" },
            formatter: (items: unknown) => {
              const list = Array.isArray(items) ? (items as { dataIndex: number }[]) : [];
              const s = steps[list[0]?.dataIndex ?? -1];
              return s ? `${s.label}: ${fmt(s.value)} ${unitText}` : "";
            },
          },
          xAxis: { type: "category", data: steps.map((s) => s.label), axisLabel: { interval: 0, hideOverlap: true } },
          yAxis: { type: "value" },
          series: [
            {
              type: "bar",
              stack: "w",
              silent: true,
              itemStyle: { color: "transparent" },
              data: steps.map((s) => (s.value < 0 ? s.base + s.value : s.base)),
            },
            {
              type: "bar",
              stack: "w",
              barMaxWidth: 48,
              label: { show: true, position: "top", formatter: (p: { dataIndex: number }) => fmt(steps[p.dataIndex].value) },
              data: steps.map((s) => ({ value: Math.abs(s.value), itemStyle: { color: colorOf(s) } })),
            },
          ],
        };
      }}
    />
  );
}
