// DS-8 · Chart kind ▾: only the kinds that can draw the chart's data
// (render/charts/ghg/kinds.ts), GHG kinds first; the current kind is ticked.
import { ChartColumn } from "lucide-react";
import type { Binding, ChartKind } from "../../../../lib/studio/contracts";
import { Menu } from "../../../../ui";
import { TbButton } from "../toolbars";
import { isGhgKind, kindLabel, kindsFor } from "./chartOps";

export function ChartKindPicker({
  kind,
  binding,
  disabled,
  onPick,
}: {
  kind: ChartKind;
  binding: Binding;
  disabled?: boolean;
  onPick: (k: ChartKind) => void;
}) {
  const kinds = kindsFor(binding);
  const ghg = kinds.filter(isGhgKind);
  const other = kinds.filter((k) => !isGhgKind(k));
  const item = (k: ChartKind) => ({
    label: kindLabel(k),
    checked: k === kind,
    onSelect: () => k !== kind && onPick(k),
  });
  return (
    <Menu
      label="Chart kind"
      trigger={(t) => (
        <TbButton
          {...t}
          disabled={disabled}
          icon={<ChartColumn aria-hidden className="size-4" />}
          data-testid="chart-kind"
        >
          {kindLabel(kind)} ▾
        </TbButton>
      )}
      items={[
        ...(ghg.length
          ? [
              {
                kind: "heading" as const,
                content: (
                  <span className="text-xs text-muted">Emissions charts</span>
                ),
              },
              ...ghg.map(item),
            ]
          : []),
        ...(other.length
          ? [
              {
                kind: "heading" as const,
                content: (
                  <span className="text-xs text-muted">General charts</span>
                ),
              },
              ...other.map(item),
            ]
          : []),
        ...(!kinds.length
          ? [
              {
                kind: "heading" as const,
                content: (
                  <span className="text-xs text-muted">
                    No chart kind can draw this data.
                  </span>
                ),
              },
            ]
          : []),
      ]}
    />
  );
}
