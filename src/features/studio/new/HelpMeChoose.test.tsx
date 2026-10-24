// @vitest-environment jsdom
// AT-1 · "Help me choose" on /studio/new step 1, with the MSW studio mocks
// (src/test/msw/studio.ts PRO-0 block): brief → three cards with reasons and
// readiness badges → "Use this" continues the flow; rule order when the AI is
// off; "Preview with my data" pages through the template; errors.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { ToastProvider } from "../../../ui";
import { handlers, resetStudioMocks } from "../../../test/msw";
import { setStudioMockTemplateAi } from "../../../test/msw/studio";
import { NewDesignPage } from "./NewDesignPage";

vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({ role: "Manager", user: { sites: [{ site_id: 1, name: "Bahrain plant" }, { site_id: 2, name: "Pune warehouse" }] } }),
}));

const server = setupServer(...handlers);
const suggested: Array<Record<string, unknown>> = [];
const resolved: Array<Record<string, unknown>> = [];
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  resetStudioMocks();
  suggested.length = 0;
  resolved.length = 0;
  server.events.on("request:start", async ({ request }) => {
    const p = new URL(request.url).pathname;
    if (request.method === "POST" && p.endsWith("/studio/templates/suggest")) suggested.push(await request.clone().json());
    if (request.method === "POST" && p.endsWith("/studio/resolve")) resolved.push(await request.clone().json());
  });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  server.events.removeAllListeners();
});
afterAll(() => server.close());

function renderFlow(url = "/studio/new?kind=ghg&year=2026&yearType=FY&siteIds=1") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: "/studio/new", element: <NewDesignPage /> },
      { path: "/studio", element: <p>home</p> },
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

async function openChooser(user: ReturnType<typeof userEvent.setup>) {
  renderFlow();
  await screen.findByRole("heading", { name: "New GHG report" });
  await user.click(screen.getByRole("radio", { name: "Help me choose" }));
  return screen.findByTestId("help-me-choose");
}

describe("Help me choose", () => {
  it("brief → three cards with reasons and readiness → Use this picks the template and moves to Scope", async () => {
    const user = userEvent.setup();
    await openChooser(user);
    expect(screen.getByText("The AI sees your answers and data coverage counts, never your figures.")).toBeTruthy();
    await user.click(screen.getByRole("radio", { name: "Board brief" }));
    await user.selectOptions(screen.getByLabelText("Audience"), "board");
    await user.selectOptions(screen.getByLabelText("Length"), "short");
    await user.type(screen.getByLabelText("Anything else?"), "For the board meeting.");
    await user.click(screen.getByTestId("suggest-submit"));

    const list = await screen.findByRole("list", { name: "Suggestions" });
    const cards = within(list).getAllByRole("listitem").filter((li) => li.dataset.testid?.startsWith("suggestion-"));
    expect(cards.length).toBeGreaterThanOrEqual(1);
    expect(cards.length).toBeLessThanOrEqual(3);
    expect(within(cards[0]).getByText("Best fit")).toBeTruthy();
    expect(within(cards[0]).getByText("Closest to the length and purpose you chose.")).toBeTruthy();
    expect(within(cards[0]).getByText("Scope 3: 9 of 15 categories have data")).toBeTruthy();
    expect(screen.getByTestId("suggest-heading").textContent).toMatch(/of \d+ GHG templates · checked against your approved FY 2025–26 data/);
    expect(suggested[0]).toMatchObject({ kind: "ghg", year: 2026, yearType: "FY", sites: [1], brief: { purpose: "board_brief", audience: "board", length: "short", frameworks: ["GHGP"], note: "For the board meeting." } });

    const id = cards[0].dataset.testid!.replace("suggestion-", "");
    await user.click(within(cards[0]).getByTestId(`suggestion-use-${id}`));
    // The scope step of the existing flow
    expect(await screen.findByLabelText("Year")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByRole("radio", { name: "Browse all" }));
    expect((await screen.findByTestId(`template-${id}`)).getAttribute("aria-checked")).toBe("true");
  });

  it("AI off: rule order, no reasons, says so", async () => {
    setStudioMockTemplateAi(false);
    const user = userEvent.setup();
    await openChooser(user);
    await user.click(screen.getByTestId("suggest-submit"));
    expect(await screen.findByText("Ordered by our rules")).toBeTruthy();
    expect(screen.queryByText("Closest to the length and purpose you chose.")).toBeNull();
    expect(screen.queryByLabelText("Why it fits")).toBeNull();
  });

  it("Preview with my data pages through the template with /resolve values, then Use this", async () => {
    const user = userEvent.setup();
    await openChooser(user);
    await user.click(screen.getByTestId("suggest-submit"));
    const list = await screen.findByRole("list", { name: "Suggestions" });
    const first = within(list).getAllByRole("listitem").find((li) => li.dataset.testid?.startsWith("suggestion-"))!;
    const id = first.dataset.testid!.replace("suggestion-", "");
    await user.click(within(first).getByTestId(`suggestion-preview-${id}`));
    const pageLabel = await screen.findByTestId("suggest-preview-page");
    await waitFor(() => expect(pageLabel.textContent).toMatch(/^Page 1 of \d+$/));
    await waitFor(() => expect(resolved.length).toBeGreaterThan(0));
    expect(resolved[0]).toMatchObject({ kind: "ghg", year: 2026, yearType: "FY", sites: [1] });
    const total = Number(pageLabel.textContent!.split(" of ")[1]);
    if (total > 1) {
      await user.click(screen.getByRole("button", { name: "Next page" }));
      expect(pageLabel.textContent).toBe(`Page 2 of ${total}`);
    }
    await user.click(screen.getByTestId("suggest-preview-use"));
    expect(await screen.findByLabelText("Year")).toBeTruthy();
  });

  it("an error shows the copy and Browse all goes back to the gallery", async () => {
    server.use(http.post("*/studio/templates/suggest", () => HttpResponse.json({ code: "DS_KIND_OFF", message: "off" }, { status: 403 })));
    const user = userEvent.setup();
    await openChooser(user);
    await user.click(screen.getByTestId("suggest-submit"));
    expect(await screen.findByText("Sustainability reports need KPI tracking, which isn't turned on for your company.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Browse all templates" }));
    expect(await screen.findByTestId("template-gallery")).toBeTruthy();
  });
});
