// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { setupServer } from "msw/node";
import { ToastProvider } from "../../../ui";
import type { InsightsQuery, Pathway as PathwayData, PanelResponse } from "../../../lib/insights/contracts";
import { MOCK_EVENTS, pathwayData } from "../../../test/msw/insightsData";
import { handlers, resetInsightsMocks, setInsightsMockPanel } from "../../../test/msw";
import { PathwayStory } from "./PathwayStory";

type Series = { id: string; groupId?: string; data: unknown[] };
const captured = vi.hoisted(() => ({ options: [] as { series: Series[] }[], mounts: 0 }));
vi.mock("echarts-for-react", async () => {
  const { useEffect } = await import("react");
  function EChartStub(props: { option: { series: Series[] } }) {
    captured.options.push(props.option);
    useEffect(() => {
      captured.mounts += 1;
    }, []);
    return <div data-testid="echart" />;
  }
  return { default: EChartStub };
});
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
  captured.options = [];
  captured.mounts = 0;
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

const query: InsightsQuery = { year: 2026, yearType: "CY", sites: "all", pillar: null, compare: "prior" };
const response: PanelResponse<PathwayData> & { data: PathwayData } = {
  panel: "pathway",
  availability: "ok",
  period: { year: 2026, yearType: "CY" },
  sites: "all",
  label: "CY 2026 · All sites",
  data: pathwayData(MOCK_EVENTS),
  pending_not_in: { emissions: 0, kpi_values: 0, link: null },
  stamp: "t",
  links: {},
};

function renderStory(url = "/insights") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={[url]}>
          <PathwayStory response={response} query={query} />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

const last = () => captured.options[captured.options.length - 1];
const groupIds = (o: { series: Series[] }) => new Set(o.series.flatMap((s) => (s.data as { groupId?: string }[]).map((d) => d?.groupId).filter(Boolean)));

describe("PathwayStory (IN-4 ⇄ IN-5)", () => {
  it("switches the same chart from the pathway to the bridge, sharing year group ids for the morph", async () => {
    renderStory();
    expect(screen.getByTestId("pathway-story").dataset.mode).toBe("pathway");
    const pathwayIds = groupIds(last());
    await userEvent.click(screen.getByRole("radio", { name: "What moved" }));
    await waitFor(() => expect(screen.getByTestId("pathway-story").dataset.mode).toBe("bridge"));
    expect(captured.mounts).toBe(1);
    const bridgeIds = groupIds(last());
    expect(pathwayIds.has("year:2025") && bridgeIds.has("year:2025")).toBe(true);
    expect(pathwayIds.has("year:2026") && bridgeIds.has("year:2026")).toBe(true);
    expect(screen.getByRole("button", { name: "How this is calculated" })).toBeTruthy();
  });

  it("opens on What moved for ?panel=bridge and shows the bridge's own empty state", async () => {
    setInsightsMockPanel("bridge", { availability: "no_data", reason: "Approve emissions for 2025 and 2026 to see what moved." });
    renderStory("/insights?panel=bridge");
    expect(await screen.findByText("Approve emissions for 2025 and 2026 to see what moved.")).toBeTruthy();
    await userEvent.click(screen.getByRole("radio", { name: "Pathway" }));
    expect(screen.getByTestId("pathway-story").dataset.mode).toBe("pathway");
  });
});
