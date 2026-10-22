// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter, useLocation } from "react-router-dom";
import type { EsgRing as EsgRingData, PanelResponse } from "../../../lib/insights/contracts";
import { readInsightsQuery } from "../../../lib/insights/query";
import { esgRingData } from "../../../test/msw/insightsData";
import { PanelViewContext, type PanelView } from "../components/panelView";
import { EsgRing } from "./EsgRing";

type ChartProps = { option: { series: Array<{ data: unknown[] }>; graphic: { elements: Array<{ onclick?: () => void }> } }; onEvents?: Record<string, (p: unknown) => void> };
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

const envelope = (data: EsgRingData): PanelResponse<EsgRingData> & { data: EsgRingData } => ({
  panel: "esg_ring",
  availability: "ok",
  period: { year: 2026, yearType: "CY" },
  sites: "all",
  label: "CY 2026 · All sites",
  data,
  pending_not_in: { emissions: 0, kpi_values: 0, link: null },
  stamp: "t",
  links: {},
});

/** The ring with its query read from the URL, as the page passes it. */
function Host({ view }: { view: PanelView }) {
  const query = readInsightsQuery(new URLSearchParams(useLocation().search)).query;
  return (
    <PanelViewContext.Provider value={{ view, setView: () => undefined }}>
      <EsgRing response={envelope(esgRingData)} query={query} />
    </PanelViewContext.Provider>
  );
}

function renderRing(url = "/insights", view: PanelView = "chart") {
  const router = createMemoryRouter([{ path: "*", element: <Host view={view} /> }], { initialEntries: [url] });
  render(<RouterProvider router={router} />);
  return router;
}

const click = (data: unknown) => act(() => chart.last!.onEvents!.click({ data }));
const pillarNode = (i: number) => chart.last!.option.series[0].data[i];

describe("EsgRing (IN-2 A)", () => {
  it("draws the sunburst with an aria sentence and the legend", () => {
    renderRing();
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("ESG data readiness 69% of KPI values approved: Environment 81%, Social 62%, Governance 55%.");
    expect(chart.last!.option.series[0].data).toHaveLength(3);
    expect(screen.getByTestId("esg-ring").dataset.pillar).toBe("all");
    expect(screen.getByRole("list", { name: "Pillars" })).toBeTruthy();
    expect(screen.queryByTestId("ring-back")).toBeNull();
  });

  it("a pillar click sets the page pillar and zooms; the centre goes back", async () => {
    const router = renderRing();
    click(pillarNode(1));
    expect(router.state.location.search).toBe("?pillar=social");
    expect(screen.getByTestId("esg-ring").dataset.pillar).toBe("social");
    expect(chart.last!.option.series[0].data).toHaveLength(1);
    expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(/^Social: 62% of KPI values approved/);
    act(() => chart.last!.option.graphic.elements[0].onclick!());
    expect(router.state.location.search).toBe("");
    expect(chart.last!.option.series[0].data).toHaveLength(3);
  });

  it("opens zoomed on the page pillar; clicking that pillar again or 'All pillars' clears it", async () => {
    const router = renderRing("/insights?pillar=governance&year=2025");
    expect(screen.getByTestId("esg-ring").dataset.pillar).toBe("governance");
    expect(screen.getByRole("heading", { name: /Governance topics/ })).toBeTruthy();
    click(pillarNode(0));
    expect(router.state.location.search).toBe("?year=2025");
    click(pillarNode(2));
    expect(router.state.location.search).toContain("pillar=governance");
    await userEvent.click(screen.getByRole("button", { name: "All pillars" }));
    expect(router.state.location.search).not.toContain("pillar=");
  });

  it("a topic click zooms to its pillar", () => {
    const router = renderRing();
    const env = pillarNode(0) as { children: unknown[] };
    click(env.children[1]);
    expect(router.state.location.search).toBe("?pillar=environment");
  });

  it("G2: Ring | Bars switches the chart to one bar per topic and back, keeping the table view", async () => {
    renderRing();
    const seriesType = () => (chart.last!.option.series[0] as { type?: string }).type;
    expect(seriesType()).toBe("sunburst");
    await userEvent.click(screen.getByRole("radio", { name: "Bars" }));
    expect(screen.getByTestId("esg-ring").dataset.shape).toBe("bars");
    expect(seriesType()).toBe("bar");
    expect(chart.last!.option.series[0].data.length).toBe(esgRingData.pillars.reduce((n, p) => n + p.topics.length, 0));
    await userEvent.click(screen.getByRole("radio", { name: "Ring" }));
    expect(seriesType()).toBe("sunburst");
    cleanup();
    renderRing("/insights", "table");
    expect(screen.getByRole("radiogroup", { name: "Ring or bars" })).toBeTruthy();
    expect(screen.getByRole("table")).toBeTruthy();
  });

  it("table view lists topics with coverage and the share from data", () => {
    renderRing("/insights", "table");
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(10);
    expect(rows[1].textContent).toContain("Climate");
    expect(rows[1].textContent).toContain("83%");
    expect(rows[2].textContent).toContain("50%");
  });
});
