// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { setupServer } from "msw/node";
import { ToastProvider } from "../../../ui";
import { handlers, resetInsightsMocks } from "../../../test/msw";
import PresentPage from "./PresentPage";

const auth = vi.hoisted(() => ({ role: "Manager" as string, user: {} as Record<string, unknown> }));
vi.mock("../../../context/AuthContext", () => ({ useAuth: () => ({ role: auth.role, user: auth.user }) }));
vi.mock("echarts-for-react", () => ({ default: () => <div data-testid="echart" /> }));
vi.mock("../../../theme", async (importOriginal) => {
  const m = await importOriginal<typeof import("../../../theme")>();
  const theme = m.chartTheme(m.buildTheme(m.PLANETPULSE, "light", "light"));
  return { ...m, useChartTheme: () => theme };
});

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  resetInsightsMocks();
  auth.user = { sites: [{ site_id: 11, company: { company_id: 1, insights_enabled: true, kpi_tracking_enabled: true } }] };
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

function renderPresent(url = "/insights/present?year=2025") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: "/insights/present", element: <PresentPage /> },
      { path: "/insights", element: <p>page</p> },
    ],
    { initialEntries: [url] },
  );
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
  return router;
}

describe("PresentPage (IN-8)", () => {
  it("moves through the slides with the arrow keys and stops at the ends", async () => {
    renderPresent();
    expect(screen.getByTestId("slide-counter").textContent).toBe("1 / 6");
    expect(await screen.findByTestId("hero-strip")).toBeTruthy();
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(screen.getByTestId("slide-counter").textContent).toBe("1 / 6");
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(screen.getByTestId("slide-counter").textContent).toBe("2 / 6");
    expect(screen.getByTestId("slide-title").textContent).toBe("Output and emissions");
  });

  it("Exit goes back to the page with the same filters", async () => {
    const router = renderPresent("/insights/present?year=2025&compare=base");
    fireEvent.click(screen.getByRole("button", { name: /Exit/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/insights"));
    expect(router.state.location.search).toBe("?year=2025&compare=base");
  });
});
