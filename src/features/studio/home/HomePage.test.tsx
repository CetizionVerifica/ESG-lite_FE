// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { ToastProvider } from "../../../ui";
import { handlers, resetStudioMocks } from "../../../test/msw";
import { setStudioMockKpi, studioMockDoc } from "../../../test/msw/studio";
import { StudioHomePage } from "./HomePage";

const auth = vi.hoisted(() => ({ role: "Manager" as string }));
vi.mock("../../../context/AuthContext", () => ({ useAuth: () => ({ role: auth.role, user: {} }) }));

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => resetStudioMocks());
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: "/studio", element: <StudioHomePage /> },
      { path: "/studio/:id", element: <p>editor</p> },
    ],
    { initialEntries: ["/studio"] },
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

describe("StudioHomePage", () => {
  it("offers what to design, readiness per kind with links to fix gaps, and recent designs", async () => {
    renderHome();
    expect(screen.getByRole("heading", { name: "Design Studio", level: 1 })).toBeTruthy();
    expect((await within(screen.getByTestId("studio-start-deck")).findByRole("link")).getAttribute("href")).toBe("/studio/new?kind=ghg&format=slide_16_9&purpose=deck");
    const ghg = await screen.findByTestId("readiness-ghg");
    await waitFor(() => expect(ghg.textContent).toContain("1,284"));
    expect(ghg.textContent).toContain("Almost ready");
    expect(ghg.textContent).toContain("11 / 15");
    expect(within(ghg).getByRole("link", { name: "Open Review" }).getAttribute("href")).toBe("/data/approvals");
    expect(within(ghg).getByRole("link", { name: "Scope 3 screening" }).getAttribute("href")).toBe("/settings/scope3/screening");
    const sus = await screen.findByTestId("readiness-sustainability");
    await waitFor(() => expect(sus.textContent).toContain("82%"));
    const designs = await screen.findByTestId("studio-designs");
    expect(within(designs).getAllByRole("listitem")).toHaveLength(2);
    expect(within(screen.getByTestId("design-1")).getByText("Draft")).toBeTruthy();
    expect(screen.getByTestId("design-1").textContent).toMatch(/GHG.*A4 · \d+ pages/);
  });

  it("sustainability needs KPI tracking: the card is disabled and its designs are hidden", async () => {
    setStudioMockKpi(false);
    server.use(http.get("*/studio/status", () => HttpResponse.json({ enabled: true, kinds: { ghg: true, sustainability: false } })));
    renderHome();
    await waitFor(() => expect(screen.getByTestId("studio-start-sustainability").textContent).toContain("Needs KPI tracking"));
    expect(within(screen.getByTestId("studio-start-sustainability")).queryByRole("link")).toBeNull();
    expect(await screen.findByTestId("readiness-sustainability-off")).toBeTruthy();
    const designs = await screen.findByTestId("studio-designs");
    expect(within(designs).getAllByRole("listitem")).toHaveLength(1);
  });

  it("duplicates, renames and deletes a design from its menu", async () => {
    const user = userEvent.setup();
    const router = renderHome();
    await screen.findByTestId("design-1");
    await user.click(within(screen.getByTestId("design-1")).getByRole("button", { name: /More actions/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Rename" }));
    const name = screen.getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Renamed design");
    await user.click(screen.getByRole("button", { name: "Rename" }));
    await waitFor(() => expect(studioMockDoc(1)?.doc.meta.title).toBe("Renamed design"));

    await user.click(within(await screen.findByTestId("design-2")).getByRole("button", { name: /More actions/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Delete design" }));
    await waitFor(() => expect(studioMockDoc(2)).toBeUndefined());

    await user.click(within(await screen.findByTestId("design-1")).getByRole("button", { name: /More actions/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Duplicate" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/studio/3"));
    expect(studioMockDoc(3)?.doc.meta.title).toBe("Renamed design (copy)");
  });

  it("shows the empty state when there are no designs", async () => {
    server.use(http.get("*/studio/docs", () => HttpResponse.json([])));
    renderHome();
    expect(await screen.findByText("Design your first GHG report.")).toBeTruthy();
    expect(screen.getByText("We'll lay it out from your approved emissions.")).toBeTruthy();
  });
});
