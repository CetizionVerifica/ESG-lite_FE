// @vitest-environment jsdom
import { useState } from "react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { setupServer } from "msw/node";
import type { Bridge as BridgeData, InsightsQuery, PanelResponse } from "../../../lib/insights/contracts";
import { handlers, resetInsightsMocks, setInsightsMockPanel } from "../../../test/msw";
import { bridgeData } from "../../../test/msw/insightsData";
import { PanelViewContext, type PanelView } from "../components/panelView";
import { Bridge, BridgePanel } from "./Bridge";

type Series = { id: string; data: { value: number; groupId: string; itemStyle?: { color: string } }[] };
const captured = vi.hoisted(() => ({ option: null as null | { series: Series[] } }));
vi.mock("echarts-for-react", () => ({
  default: (props: { option: { series: Series[] } }) => {
    captured.option = props.option;
    return <div data-testid="echart" />;
  },
}));
vi.mock("../../../theme", () => ({
  useChartTheme: () => ({
    color: [],
    tooltip: { backgroundColor: "panel" },
    ui: { ink: "ink", muted: "muted", line: "line", panel: "panel", tint: "tint", brand: "brand", onBrand: "on-brand", accent: "accent" },
    status: { good: "good", bad: "bad", warn: "warn", info: "info" },
  }),
}));
vi.mock("../../../context/AuthContext", () => ({ useAuth: () => ({ role: "Manager", user: {} }) }));

const query: InsightsQuery = { year: 2026, yearType: "CY", sites: "all", pillar: null, compare: "prior" };
const envelope = (data: BridgeData): PanelResponse<BridgeData> & { data: BridgeData } => ({
  panel: "bridge",
  availability: "ok",
  period: { year: 2026, yearType: "CY" },
  sites: "all",
  label: "CY 2026 · All sites",
  data,
  pending_not_in: { emissions: 0, kpi_values: 0, link: null },
  stamp: "t",
  links: {},
});

/** The view state a PanelShell gives its panel. */
function WithView({ children }: { children: React.ReactNode }) {
  const [view, setView] = useState<PanelView>("chart");
  return <PanelViewContext.Provider value={{ view, setView }}>{children}</PanelViewContext.Provider>;
}

function renderIn(element: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: "*", element }], { initialEntries: ["/insights"] });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

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

describe("Bridge (IN-5)", () => {
  it("draws the waterfall with a helper stack, coloured by kind, and a one-sentence label", () => {
    renderIn(<Bridge response={envelope(bridgeData)} query={query} />);
    const [helper, values] = captured.option!.series;
    expect(helper.id).toBe("bridge-helper");
    expect(values.data.map((d) => d.itemStyle?.color)).toEqual(["brand", "bad", "good", "good", "good", "good", "brand"]);
    expect(values.data[0].groupId).toBe("year:2025");
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe(
      "Emissions went from 44,910.200 tCO₂e in 2025 to 41,280.400 tCO₂e in 2026; the biggest driver was cleaner electricity (−2,449.000 tCO₂e).",
    );
    expect(screen.getByRole("list", { name: "Bar colours" }).textContent).toContain("Increase (+)");
  });

  it("has a table view with the change and a word (the panel's view, as the shell owns it)", async () => {
    renderIn(<WithView><Bridge response={envelope(bridgeData)} query={query} /></WithView>);
    await userEvent.click(screen.getByRole("radio", { name: "Table" }));
    const table = screen.getByRole("table", { name: "What moved" });
    const rows = within(table).getAllByRole("row").map((r) => r.textContent);
    expect(rows[1]).toBe("2025 total44,910.200Total");
    expect(rows[2]).toBe("More output+2,330.600Increase");
    expect(rows[3]).toBe("Better process efficiency−2,210.100Decrease");
    expect(rows[rows.length - 1]).toBe("2026 total41,280.400Total");
  });

  it("shows the notes under the chart", () => {
    renderIn(<Bridge response={envelope({ ...bridgeData, notes: ["Add production data to split by driver"] })} query={query} />);
    expect(screen.getByTestId("bridge-notes").textContent).toBe("Add production data to split by driver");
  });

  it("'How this is calculated' opens the drawer with the method, inputs and notes; Esc closes it", async () => {
    const user = userEvent.setup();
    renderIn(<Bridge response={envelope({ ...bridgeData, notes: ["Scope 2 kWh for 2025 was estimated."] })} query={query} />);
    await user.click(screen.getByRole("button", { name: "How this is calculated" }));
    const dialog = screen.getByRole("dialog", { name: "How this is calculated" });
    expect(dialog.textContent).toContain("L(Eᵀ, E⁰) × ln(driverᵀ / driver⁰)");
    const activity = within(dialog).getByTestId("calc-step-activity");
    expect(activity.textContent).toContain("More output");
    expect(activity.textContent).toContain("+2,330.600 tCO₂e");
    expect(within(activity).getAllByRole("row").map((r) => r.textContent)).toEqual(["InputValue", "Output (2025)63,540", "Output (2026)66,880"]);
    expect(within(dialog).getByTestId("calc-notes").textContent).toBe("Scope 2 kWh for 2025 was estimated.");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("BridgePanel (IN-5)", () => {
  it("loads the bridge and renders it", async () => {
    renderIn(<BridgePanel query={query} />);
    await waitFor(() => expect(screen.getByTestId("bridge-panel").dataset.state).toBe("ok"));
    expect(screen.getByTestId("bridge")).toBeTruthy();
  });

  it("shows the server's reason when there's no data", async () => {
    setInsightsMockPanel("bridge", { availability: "no_data", reason: "Approve emissions for 2025 and 2026 to see what moved." });
    renderIn(<BridgePanel query={query} />);
    await waitFor(() => expect(screen.getByTestId("bridge-panel").dataset.state).toBe("empty"));
    expect(screen.getByText("Approve emissions for 2025 and 2026 to see what moved.")).toBeTruthy();
  });

  it("shows an error with Retry", async () => {
    setInsightsMockPanel("bridge", { error: 500 });
    renderIn(<BridgePanel query={query} />);
    // A 5xx is retried twice (api.ts) before the error shows.
    await waitFor(() => expect(screen.getByTestId("bridge-panel").dataset.state).toBe("error"), { timeout: 8000 });
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
  }, 10_000);
});
