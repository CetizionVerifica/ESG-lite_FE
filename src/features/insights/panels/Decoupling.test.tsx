// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { type ReactNode, useState } from "react";
import type { Decoupling as DecouplingData, InsightsQuery, PanelResponse } from "../../../lib/insights/contracts";
import { MOCK_EVENTS, decouplingData } from "../../../test/msw/insightsData";
import { PanelViewContext, type PanelView } from "../components/panelView";
import { Decoupling } from "./Decoupling";

type ChartProps = { option: { series: Array<{ id: string; endLabel: { formatter: string }; markLine?: { data: unknown[] } }> } };
const chart = vi.hoisted(() => ({ last: null as ChartProps | null }));
vi.mock("echarts-for-react", () => ({
  default: (props: ChartProps) => {
    chart.last = props;
    return <div data-testid="echart" />;
  },
}));
vi.mock("../../../theme", async () => {
  const { testTheme } = await import("./testTheme");
  return { useChartTheme: () => testTheme };
});

afterEach(() => {
  cleanup();
  chart.last = null;
});

const query: InsightsQuery = { year: 2026, yearType: "CY", sites: "all", pillar: null, compare: "prior" };
const envelope = (data: DecouplingData): PanelResponse<DecouplingData> & { data: DecouplingData } => ({
  panel: "decoupling",
  availability: "ok",
  period: { year: 2026, yearType: "CY" },
  sites: "all",
  label: "CY 2026 · All sites",
  data,
  pending_not_in: { emissions: 0, kpi_values: 0, link: null },
  stamp: "t",
  links: {},
});

function WithView({ children }: { children: ReactNode }) {
  const [view, setView] = useState<PanelView>("chart");
  return <PanelViewContext.Provider value={{ view, setView }}>{children}</PanelViewContext.Provider>;
}

describe("Decoupling (IN-2 B)", () => {
  it("draws three indexed lines with the server's changes, a legend and an aria sentence", () => {
    render(<Decoupling response={envelope(decouplingData)} query={query} />);
    expect(chart.last!.option.series.map((s) => [s.id, s.endLabel.formatter])).toEqual([
      ["output", "+42%"],
      ["emissions", "−19%"],
      ["intensity", "−43%"],
    ]);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Since 2021, output is up 42%, emissions down 19% and intensity down 43% (indexed, 2021 = 100).");
    expect(within(screen.getByRole("list", { name: "Lines" })).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Output", "Emissions", "Intensity"]);
    expect(screen.getByText("Indexed, 2021 = 100")).toBeTruthy();
    expect(screen.queryByTestId("decoupling-sentence")).toBeNull();
    expect(screen.queryByTestId("decoupling-combined")).toBeNull();
    expect(chart.last!.option.series[0].markLine?.data).toHaveLength(1);
  });

  it("shows the rule sentence above, the combined-output note under, and event marks when given", () => {
    render(<Decoupling response={envelope({ ...decouplingData, combined_output: true })} query={query} sentence="Output is up 42% since 2021 while emissions fell 19%." events={MOCK_EVENTS} />);
    expect(screen.getByTestId("decoupling-sentence").textContent).toBe("Output is up 42% since 2021 while emissions fell 19%.");
    expect(screen.getByTestId("decoupling-combined").textContent).toContain("combined index");
    expect(chart.last!.option.series[0].markLine?.data).toHaveLength(4);
  });

  it("the table view lists each year's indexes and raw values with units", async () => {
    render(
      <WithView>
        <Decoupling response={envelope(decouplingData)} query={query} />
      </WithView>,
    );
    await userEvent.click(screen.getByRole("radio", { name: "Table" }));
    const table = screen.getByRole("table");
    const headers = within(table).getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toEqual(["Year", "Output index", "Emissions index", "Intensity index", "Output (t)", "Emissions (tCO₂e)", "Intensity (tCO₂e/t)"]);
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(7);
    expect(rows[1].textContent).toContain("2021 (base)");
    expect(rows[6].textContent).toContain("142.0");
    expect(rows[6].textContent).toContain("66,880");
    expect(rows[6].textContent).toContain("41,280.000");
    expect(rows[6].textContent).toContain("0.617");
  });
});
