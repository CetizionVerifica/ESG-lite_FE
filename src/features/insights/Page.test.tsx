// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { setupServer } from "msw/node";
import { ToastProvider } from "../../ui";
import { handlers, resetInsightsMocks, setInsightsMockEnabled, setInsightsMockKpi, setInsightsMockPanel } from "../../test/msw";
import InsightsPage from "./Page";

const auth = vi.hoisted(() => ({ role: "Manager" as string, user: {} as Record<string, unknown> }));
vi.mock("../../context/AuthContext", () => ({ useAuth: () => ({ role: auth.role, user: auth.user }) }));
// Panels draw ECharts (canvas) inside ChartFrame: stub the chart and give it the PlanetPulse light theme.
vi.mock("echarts-for-react", () => ({ default: () => <div data-testid="echart" /> }));
vi.mock("../../theme", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../theme")>();
  const theme = m.chartTheme(m.buildTheme(m.PLANETPULSE, "light", "light"));
  return { ...m, useChartTheme: () => theme };
});

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  resetInsightsMocks();
  auth.role = "Manager";
  auth.user = { sites: [{ site_id: 11, company: { company_id: 1, insights_enabled: true, kpi_tracking_enabled: true } }] };
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

function renderPage(url = "/insights") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: "/insights", element: <InsightsPage /> }], { initialEntries: [url] });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return router;
}

const slot = (id: string) => screen.findByTestId(`panel-${id}`);
const settled = async (id: string) => {
  const el = await slot(id);
  // A 5xx is retried twice (api.ts) before the shell shows its error.
  await waitFor(() => expect(el.getAttribute("data-state")).not.toBe("loading"), { timeout: 8000 });
  return el;
};

describe("InsightsPage (IN-0 shell on mocks)", () => {
  it("renders the header, filters and every slot, each in its own state", async () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "Insights", level: 1 })).toBeTruthy();
    expect((screen.getByRole("button", { name: /Present/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Export/ }) as HTMLButtonElement).disabled).toBe(true);
    const hero = await settled("hero");
    expect(within(hero).getByTestId("hero-strip")).toBeTruthy();
    expect((await screen.findByTestId("pending-banner")).textContent).toContain("12 entries and 3 KPI values waiting for approval aren't in these figures.");
    const cards = await settled("cards");
    expect(cards.getAttribute("data-state")).toBe("ok");
    expect(within(cards).getAllByTestId("insight-card")).toHaveLength(6);
    for (const id of ["decoupling", "ring", "pathway", "wall"]) {
      const el = await settled(id);
      expect(el.getAttribute("data-state"), id).toBe("ok");
      // No module has filled the slot yet: the shell says which one will.
      expect(within(el).getByTestId("panel-placeholder").textContent, id).toMatch(/This panel is built in IN-\d/);
    }
    // IN-6: the first tab (Data flow) draws its sankey.
    const flow = await settled("flow");
    expect(flow.getAttribute("data-state")).toBe("ok");
    expect(within(flow).getByTestId("disclosure-flow")).toBeTruthy();
    expect(within(flow).getByRole("img").getAttribute("aria-label")).toBe("3 sites feed Scope 1, 2 and 3; 3 KPIs feed 3 disclosures.");
    // Lazy tabs: Materiality and Completeness haven't loaded.
    expect(screen.queryByTestId("panel-materiality")).toBeNull();
    expect(screen.queryByTestId("panel-completeness")).toBeNull();
    const sites = await screen.findByRole("button", { name: "Pune plant" });
    expect(sites).toBeTruthy();
  });

  it("KPI tracking off: the ring and the Materiality tab are hidden, and there are no pillar chips", async () => {
    setInsightsMockKpi(false);
    auth.user = { sites: [{ site_id: 11, company: { company_id: 1, insights_enabled: true, kpi_tracking_enabled: false } }] };
    renderPage();
    await settled("decoupling");
    await waitFor(() => expect(screen.queryByTestId("panel-ring")).toBeNull());
    expect(screen.queryByRole("tab", { name: "Materiality" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Pillar" })).toBeNull();
  });

  it("one panel's empty state and error don't touch the others; Retry reloads it", async () => {
    setInsightsMockPanel("decoupling", { availability: "no_data", reason: "Add production data for 2024 and 2025 to see decoupling." });
    setInsightsMockPanel("target_wall", { error: 500 });
    renderPage();
    const d = await settled("decoupling");
    expect(d.getAttribute("data-state")).toBe("empty");
    expect(d.textContent).toContain("Add production data for 2024 and 2025 to see decoupling.");
    const wall = await settled("wall");
    expect(wall.getAttribute("data-state")).toBe("error");
    expect((await settled("hero")).getAttribute("data-state")).toBe("ok");
    setInsightsMockPanel("target_wall", null);
    await userEvent.click(within(wall).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByTestId("panel-wall").getAttribute("data-state")).toBe("ok"));
  }, 15000);

  it("a server IN_OFF turns the page into the 'not turned on' state", async () => {
    setInsightsMockEnabled(false);
    renderPage();
    expect(await screen.findByText("Insights isn't turned on for your company.")).toBeTruthy();
    expect(screen.queryByTestId("insights-page")).toBeNull();
  });

  it("a card's Show targets its panel: ?panel= is set and that panel pulses", async () => {
    const router = renderPage();
    const cards = await settled("cards");
    const card = within(cards).getAllByTestId("insight-card").find((c) => c.dataset.rule === "decoupling")!;
    expect((await settled("decoupling")).className).not.toContain("ring-2");
    await userEvent.click(within(card).getByRole("button", { name: "Show" }));
    await waitFor(() => expect(router.state.location.search).toContain("panel=decoupling"));
    await waitFor(() => expect(screen.getByTestId("panel-decoupling").className).toContain("ring-2"));
  });

  it("filters go to the URL; ?panel= targets a slot and opens its tab", async () => {
    const router = renderPage("/insights?panel=completeness");
    expect((await settled("completeness")).className).toContain("ring-2");
    await userEvent.click(await screen.findByRole("button", { name: "Social" }));
    await waitFor(() => expect(router.state.location.search).toContain("pillar=social"));
    await userEvent.click(screen.getByRole("radio", { name: "Base year" }));
    await waitFor(() => expect(router.state.location.search).toContain("compare=base"));
    await userEvent.click(screen.getByRole("button", { name: "Chennai plant" }));
    await waitFor(() => expect(router.state.location.search).toContain("sites=11"));
    await waitFor(() => expect(screen.getByTestId("panel-decoupling").textContent).toContain("Chennai plant"));
    await userEvent.click(screen.getByRole("button", { name: "All sites" }));
    await waitFor(() => expect(router.state.location.search).not.toContain("sites="));
  });
});
