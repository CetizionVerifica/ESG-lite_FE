// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import type { Flow, InsightsQuery, PanelResponse } from "../../../lib/insights/contracts";
import { flowData } from "../../../test/msw/insightsData";
import { PanelViewContext, type PanelView } from "../components/panelView";
import { DisclosureFlow } from "./DisclosureFlow";

const chart = vi.hoisted(() => ({ props: null as null | { option: { series: { data: unknown[]; links: unknown[] }[] }; onEvents?: Record<string, (p: unknown) => void> } }));
vi.mock("echarts-for-react", () => ({
  default: (props: NonNullable<typeof chart.props>) => {
    chart.props = props;
    return <div data-testid="echart" />;
  },
}));
vi.mock("../../../theme", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../../theme")>();
  const theme = m.chartTheme(m.buildTheme(m.PLANETPULSE, "light", "light"));
  return { ...m, useChartTheme: () => theme };
});
const media = vi.hoisted(() => ({ narrow: false }));
vi.mock("../hooks/useNarrow", () => ({ useNarrow: () => media.narrow }));

beforeEach(() => {
  chart.props = null;
  media.narrow = false;
});
afterEach(cleanup);

const query: InsightsQuery = { year: 2026, yearType: "CY", sites: "all", pillar: null, compare: "prior" };
const envelope = (data: Flow, links: Record<string, string> = {}): PanelResponse<Flow> & { data: Flow } => ({
  panel: "flow",
  availability: "ok",
  period: { year: 2026, yearType: "CY" },
  sites: "all",
  label: "CY 2026 · All sites",
  data,
  pending_not_in: { emissions: 0, kpi_values: 0, link: "/data/approvals" },
  stamp: "t",
  links,
});

/** The panel inside a stand-in for its PanelShell's Chart / Table view. */
function Shell({ data, links }: { data: Flow; links?: Record<string, string> }) {
  const [view, setView] = useState<PanelView>("chart");
  return (
    <PanelViewContext.Provider value={{ view, setView }}>
      <DisclosureFlow response={envelope(data, links)} query={query} />
    </PanelViewContext.Provider>
  );
}

function renderFlow(data: Flow, links?: Record<string, string>) {
  const router = createMemoryRouter([{ path: "*", element: <Shell data={data} links={links} /> }], { initialEntries: ["/insights"] });
  render(<RouterProvider router={router} />);
  return router;
}

describe("DisclosureFlow (IN-6)", () => {
  it("draws the sankey with an aria sentence and a legend with the count part", () => {
    renderFlow(flowData(true));
    expect(screen.getByTestId("echart")).toBeTruthy();
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("3 sites feed Scope 1, 2 and 3; 3 KPIs feed 3 disclosures.");
    expect(chart.props!.option.series[0].data).toHaveLength(12);
    const legend = screen.getByTestId("flow-legend");
    expect(within(legend).getByTestId("flow-legend-count").textContent).toContain("Count of disclosures each KPI feeds");
    expect(legend.textContent).toContain("Exact fit");
    expect(legend.textContent).toContain("Partial fit");
    expect(legend.textContent).toContain("Derived fit");
  });

  it("click a disclosure node opens its framework report; a server link wins; no link does nothing", () => {
    const router = renderFlow(flowData(true), { "site:12": "/data/ledger?site=12" });
    const click = chart.props!.onEvents!.click;
    act(() => click({ dataType: "node", data: { name: "disc:GRI:305-1" } }));
    expect(router.state.location.pathname).toBe("/kpi/reports/GRI");
    act(() => click({ dataType: "node", data: { name: "site:12" } }));
    expect(router.state.location.pathname + router.state.location.search).toBe("/data/ledger?site=12");
    act(() => click({ dataType: "node", data: { name: "scope:3" } }));
    expect(router.state.location.pathname).toBe("/data/ledger");
  });

  it("table view lists every link with its measure and fit", async () => {
    renderFlow(flowData(true));
    await userEvent.click(screen.getByRole("radio", { name: "Table" }));
    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    expect(rows).toHaveLength(flowData(true).links.length + 1);
    expect(rows[1].textContent).toBe("Chennai plantScope 16,100.000tCO₂e—");
    expect(rows[rows.length - 1].textContent).toBe("Gross Scope 3ESRS E1-61CountDerived");
  });

  it("KPI off: no disclosure column and the legend's count part is hidden", () => {
    renderFlow(flowData(false));
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("3 sites feed Scope 1, 2 and 3; the scopes split into 3 categories.");
    expect(screen.queryByTestId("flow-legend-count")).toBeNull();
    expect(screen.getByTestId("flow-legend").textContent).toContain("Categories");
  });

  it("on a phone it opens as a table with 'Show diagram'", async () => {
    media.narrow = true;
    renderFlow(flowData(true));
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.queryByTestId("echart")).toBeNull();
    await userEvent.click(screen.getByTestId("flow-show-diagram"));
    expect(screen.getByTestId("echart")).toBeTruthy();
    expect(screen.queryByTestId("flow-show-diagram")).toBeNull();
  });
});
