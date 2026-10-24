// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter, useLocation } from "react-router-dom";
import type { PanelResponse, TargetWall as WallData } from "../../../lib/insights/contracts";
import { readInsightsQuery } from "../../../lib/insights/query";
import { targetWallData } from "../../../test/msw/insightsData";
import { PanelViewContext, type PanelView } from "../components/panelView";
import { TargetWall } from "./TargetWall";

type ChartProps = { option: { series: Array<{ id: string; data: unknown[] }> }; onEvents?: Record<string, (p: unknown) => void> };
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

const envelope = (data: WallData): PanelResponse<WallData> & { data: WallData } => ({
  panel: "target_wall",
  availability: "ok",
  period: { year: 2026, yearType: "CY" },
  sites: "all",
  label: "CY 2026 · All sites",
  data,
  pending_not_in: { emissions: 0, kpi_values: 0, link: null },
  stamp: "t",
  links: {},
});

function Host({ data, view }: { data: WallData; view: PanelView }) {
  const query = readInsightsQuery(new URLSearchParams(useLocation().search)).query;
  return (
    <PanelViewContext.Provider value={{ view, setView: () => undefined }}>
      <TargetWall response={envelope(data)} query={query} />
    </PanelViewContext.Provider>
  );
}

function renderWall(data: WallData = targetWallData(true), view: PanelView = "chart", url = "/insights") {
  const router = createMemoryRouter(
    [
      { path: "/insights", element: <Host data={data} view={view} /> },
      { path: "*", element: <p>Elsewhere</p> },
    ],
    { initialEntries: [url] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe("TargetWall (IN-2 H)", () => {
  it("draws one bullet bar per target in the server's order, with an aria sentence and a status legend", () => {
    renderWall();
    const progress = chart.last!.option.series.find((s) => s.id === "progress")!;
    expect(progress.data).toHaveLength(3);
    expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(/^3 targets, worst first\. Scope 1 and 2 emissions/);
    const legend = screen.getByRole("list", { name: "How to read the bars" });
    expect(within(legend).getAllByTestId("status-chip").map((c) => c.textContent)).toEqual(["At risk", "Off track", "On track"]);
  });

  it("a row click opens its target; a pillar letter sets the page pillar (and clears it again)", () => {
    const router = renderWall();
    act(() => chart.last!.onEvents!.click({ seriesId: "letters", dataIndex: 1, data: { pillar: "social" } }));
    expect(router.state.location.search).toBe("?pillar=social");
    act(() => chart.last!.onEvents!.click({ seriesId: "letters", dataIndex: 1, data: { pillar: "social" } }));
    expect(router.state.location.search).toBe("");
    act(() => chart.last!.onEvents!.click({ seriesId: "track", dataIndex: 1 }));
    expect(router.state.location.pathname).toBe("/kpi/targets");
    expect(router.state.location.search).toBe("?kpi=41");
  });

  it("the keyboard list has a link and a pillar button per row", async () => {
    const router = renderWall();
    const list = screen.getByRole("list", { name: "Targets" });
    const buttons = within(list).getAllByRole("button", { name: /only$/ });
    expect(buttons.map((b) => b.getAttribute("aria-label"))).toEqual(["Show Environment only", "Show Social only", "Show Environment only"]);
    await userEvent.click(buttons[1]);
    expect(router.state.location.search).toBe("?pillar=social");
    expect(buttons[1].getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(within(list).getByRole("link", { name: "Scope 1 and 2 emissions (SBTi near term)" }));
    expect(router.state.location.pathname).toBe("/targets");
  });

  it("table view shows status words, values with units and the source", () => {
    renderWall(targetWallData(true), "table");
    const rows = within(screen.getByRole("table")).getAllByRole("row");
    expect(rows).toHaveLength(4);
    expect(rows[2].textContent).toContain("Lost-time injury frequency rate");
    expect(rows[2].textContent).toContain("Off track");
    expect(rows[2].textContent).toContain("KPI target");
    expect(rows[1].textContent).toContain("51,020 tCO₂e (2021)");
  });

  it("without KPI tracking shows the SBTi target only; without targets says what's needed", () => {
    renderWall(targetWallData(false));
    expect(chart.last!.option.series.find((s) => s.id === "progress")!.data).toHaveLength(1);
    cleanup();
    chart.last = null;
    renderWall({ items: [] });
    expect(screen.getByText("No targets yet. Set an SBTi target or KPI targets to see progress here.")).toBeTruthy();
    expect(chart.last).toBeNull();
  });
});
