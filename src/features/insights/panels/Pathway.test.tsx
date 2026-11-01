// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { setupServer } from "msw/node";
import { ToastProvider } from "../../../ui";
import type { InsightsQuery, Pathway as PathwayData, PanelResponse } from "../../../lib/insights/contracts";
import { MOCK_EVENTS, pathwayData } from "../../../test/msw/insightsData";
import { handlers, resetInsightsMocks } from "../../../test/msw";
import { PanelViewContext } from "../components/panelView";
import { Pathway } from "./Pathway";
import { PATHWAY_IDS } from "./pathwayLogic";

const captured = vi.hoisted(() => ({ option: null as null | { series: { id: string }[] } }));
vi.mock("echarts-for-react", () => ({
  default: (props: { option: { series: { id: string }[] } }) => {
    captured.option = props.option;
    return <div data-testid="echart" />;
  },
}));
vi.mock("../../../theme", async (orig) => {
  const actual = await orig<typeof import("../../../theme")>();
  const theme = actual.chartTheme(actual.buildTheme(actual.PLANETPULSE, "light", "light"));
  return { ...actual, useChartTheme: () => theme };
});
vi.mock("../../../context/AuthContext", () => ({ useAuth: () => ({ role: "Manager", user: {} }) }));

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  resetInsightsMocks();
  captured.option = null;
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

const query: InsightsQuery = { year: 2026, yearType: "CY", sites: "all", pillar: null, compare: "prior" };
const envelope = (data: PathwayData): PanelResponse<PathwayData> & { data: PathwayData } => ({
  panel: "pathway",
  availability: "ok",
  period: { year: 2026, yearType: "CY" },
  sites: "all",
  label: "CY 2026 · All sites",
  data,
  pending_not_in: { emissions: 0, kpi_values: 0, link: null },
  stamp: "t",
  links: {},
});

function renderPathway(props: Partial<Parameters<typeof Pathway>[0]> = {}, view: "chart" | "table" = "chart") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const setView = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>
          <PanelViewContext.Provider value={{ view, setView }}>
            <Pathway response={envelope(pathwayData(MOCK_EVENTS))} query={query} {...props} />
          </PanelViewContext.Provider>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
  return { setView };
}

describe("Pathway panel (IN-4)", () => {
  it("draws the chart with its series, a legend in words and a one-sentence label", () => {
    renderPathway();
    expect(captured.option!.series.map((s) => s.id)).toEqual(Object.values(PATHWAY_IDS));
    expect(screen.getByRole("img").getAttribute("aria-label")).toMatch(/^Emissions by scope from 2021 to 2026 against a 4.2% a year pathway/);
    const legend = screen.getByRole("list", { name: "Legend" });
    for (const word of ["Scope 1", "Scope 2", "Scope 3", "Pathway", "Renewable share (right axis, %)", "Above pathway", "Target 2030", "Events"]) expect(legend.textContent).toContain(word);
    expect(screen.getByText(/4.2% a year from 2021/)).toBeTruthy();
  });

  it("renders the rule sentence slot above the chart and extra header actions", () => {
    renderPathway({ sentence: "Emissions are 3.4% above the 2030 pathway.", actions: <button type="button">What moved</button> });
    expect(screen.getByTestId("pathway-sentence").textContent).toBe("Emissions are 3.4% above the 2030 pathway.");
    expect(screen.getByRole("button", { name: "What moved" })).toBeTruthy();
  });

  it("has a table view: year, scopes, pathway, renewable share, gap and events", () => {
    renderPathway({}, "table");
    const table = screen.getByRole("table");
    const r2025 = within(table).getByText("2025").closest("tr")!;
    expect([...r2025.querySelectorAll("td")].map((td) => td.textContent)).toEqual(["2025", "19,300.000", "20,550.000", "5,060.000", "42,980.000", "38%", "1,930.000", "New grid factors (CEA v20)"]);
  });

  it("the table toggle drives the panel's view", async () => {
    const { setView } = renderPathway();
    await userEvent.click(screen.getByRole("radio", { name: "Table" }));
    expect(setView).toHaveBeenCalledWith("table");
  });

  it("'Events' opens the events drawer with the stored events", async () => {
    renderPathway();
    await userEvent.click(screen.getByTestId("pathway-events-button"));
    const dialog = await screen.findByRole("dialog", { name: "Events" });
    expect(await within(dialog).findAllByTestId("event-row")).toHaveLength(3);
  });
});
