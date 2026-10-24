// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import type { InsightsQuery, Materiality, PanelResponse } from "../../../lib/insights/contracts";
import { materialityData } from "../../../test/msw/insightsData";
import { PanelViewContext } from "../components/panelView";
import { MaterialityMatrix } from "./MaterialityMatrix";

type Captured = { option: { series: { name: string; data: { name: string; point: { link: string } }[] }[] }; onEvents?: Record<string, (p: unknown) => void> };
const chart = vi.hoisted(() => ({ last: null as Captured | null }));
vi.mock("echarts-for-react", () => ({
  default: (props: Captured) => {
    chart.last = props;
    return <div data-testid="echart" />;
  },
}));
vi.mock("../../../theme", () => ({
  useChartTheme: () => ({
    color: [],
    tooltip: { backgroundColor: "panel" },
    status: { good: "good", goodSoft: "good-soft", warn: "warn", warnSoft: "warn-soft", bad: "bad", badSoft: "bad-soft", info: "info", infoSoft: "info-soft" },
    ui: { ink: "ink", muted: "muted", line: "line", panel: "panel", tint: "tint", brand: "brand", onBrand: "on-brand", accent: "accent" },
  }),
}));
const auth = vi.hoisted(() => ({ role: "Manager" as string }));
vi.mock("../../../context/AuthContext", () => ({ useAuth: () => ({ role: auth.role, user: {} }) }));

beforeEach(() => {
  auth.role = "Manager";
  chart.last = null;
});
afterEach(cleanup);

const query: InsightsQuery = { year: 2026, yearType: "CY", sites: "all", pillar: null, compare: "prior" };
const envelope = (data: Materiality): PanelResponse<Materiality> & { data: Materiality } => ({
  panel: "materiality",
  availability: "ok",
  period: { year: 2026, yearType: "CY" },
  sites: "all",
  label: "CY 2026 · All sites",
  data,
  pending_not_in: { emissions: 0, kpi_values: 0, link: null },
  stamp: "t",
  links: {},
});

function renderPanel(data: Materiality, view: "chart" | "table" = "chart") {
  const setView = vi.fn();
  const router = createMemoryRouter(
    [
      {
        path: "*",
        element: (
          <PanelViewContext.Provider value={{ view, setView }}>
            <MaterialityMatrix response={envelope(data)} query={query} />
          </PanelViewContext.Provider>
        ),
      },
    ],
    { initialEntries: ["/insights"] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe("MaterialityMatrix (IN-7)", () => {
  it("plots scored topics, one series per status, with a one-sentence label", () => {
    renderPanel(materialityData(true));
    expect(screen.getByTestId("materiality-matrix")).toBeTruthy();
    expect(screen.getByRole("img", { name: "4 material topics; none off track in the act-here corner, 1 at risk: Climate." })).toBeTruthy();
    const series = chart.last!.option.series;
    expect(series.map((s) => s.name)).toEqual(["Act here", "Off track", "At risk", "On track", "No data"]);
    expect(series.flatMap((s) => s.data.map((d) => d.name))).toEqual(["Own workforce · off track", "Climate · at risk", "Water · on track", "Business conduct · no data"]);
    expect(screen.queryByTestId("materiality-not-scored")).toBeNull();
    expect(within(screen.getByTestId("materiality-topic-links")).getAllByRole("link")).toHaveLength(4);
  });

  it("a bubble click opens the topic's KPIs from the server's link", () => {
    const router = renderPanel(materialityData(true));
    const climate = chart.last!.option.series[2].data[0];
    act(() => chart.last!.onEvents!.click({ data: climate }));
    expect(router.state.location.pathname + router.state.location.search).toBe("/kpi/esg?topic=climate");
  });

  it("lists points without both scores under the chart instead of plotting them", () => {
    const data = materialityData(true);
    data.points[1] = { ...data.points[1], impact: null };
    renderPanel(data);
    expect(screen.getByTestId("materiality-not-scored").textContent).toBe("Not scored yet: Water.");
    expect(chart.last!.option.series.flatMap((s) => s.data.map((d) => d.name))).not.toContain("Water · on track");
  });

  it("table view shows every topic with its scores, status and counts", () => {
    renderPanel(materialityData(true), "table");
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(5);
    expect(within(rows[0]).getAllByRole("columnheader").map((c) => c.textContent)).toEqual(["Topic", "ESRS topic", "Impact", "Financial", "Weight", "Status", "KPIs", "On track", "Off track"]);
    expect(within(rows[3]).getAllByRole("cell").map((c) => c.textContent)).toEqual(["Own workforce", "S1", "7.5", "6.0", "9.0", "Off track", "9", "4", "3"]);
  });

  it("without scores lists topics with status chips and counts; Admin gets 'Add scores'", async () => {
    auth.role = "Admin";
    const router = renderPanel(materialityData(false));
    expect(screen.queryByTestId("echart")).toBeNull();
    const topics = screen.getAllByTestId("materiality-topic");
    expect(topics).toHaveLength(4);
    expect(within(topics[0]).getByTestId("status-chip").textContent).toBe("At risk");
    expect(topics[0].textContent).toContain("6 KPIs · 3 on track · 1 off track");
    await userEvent.click(screen.getByRole("link", { name: /Add scores/ }));
    expect(router.state.location.pathname + router.state.location.search).toBe("/kpi/setup?step=topics");
  });

  it("a Manager sees the unscored list without the 'Add scores' link", () => {
    renderPanel(materialityData(false));
    expect(screen.getAllByTestId("materiality-topic")).toHaveLength(4);
    expect(screen.queryByTestId("materiality-add-scores")).toBeNull();
    expect(screen.getByTestId("materiality-unscored").textContent).toContain("once an Admin scores each material topic");
  });
});
