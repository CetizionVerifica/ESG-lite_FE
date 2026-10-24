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
import { studioMockDoc } from "../../../test/msw/studio";
import { NewDesignPage } from "./NewDesignPage";

const auth = vi.hoisted(() => ({ role: "Manager" as string }));
vi.mock("../../../context/AuthContext", () => ({
  useAuth: () => ({ role: auth.role, user: { sites: [{ site_id: 1, name: "Bahrain plant" }, { site_id: 2, name: "Pune warehouse" }] } }),
}));

const server = setupServer(...handlers);
const posted: unknown[] = [];
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  resetStudioMocks();
  posted.length = 0;
  server.events.on("request:start", async ({ request }) => {
    if (request.method === "POST" && new URL(request.url).pathname.endsWith("/studio/docs")) posted.push(await request.clone().json());
  });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  server.events.removeAllListeners();
});
afterAll(() => server.close());

function renderFlow(url: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: "/studio/new", element: <NewDesignPage /> },
      { path: "/studio/:id", element: <p data-testid="editor">editor</p> },
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

describe("NewDesignPage", () => {
  it("template → scope → details → words → build, then opens the editor", async () => {
    const user = userEvent.setup();
    const router = renderFlow("/studio/new?kind=ghg&year=2026&yearType=FY&compareYear=2025&siteIds=1&format=a4&purpose=report");
    expect(await screen.findByRole("heading", { name: "New GHG report" })).toBeTruthy();
    expect(screen.getByText(/FY 2025–26 · 1 site/)).toBeTruthy();
    const gallery = await screen.findByTestId("template-gallery");
    // The A4 report filter hides the deck and the one-page summary.
    await waitFor(() => expect(within(gallery).getByTestId("template-1")).toBeTruthy());
    expect(within(gallery).queryByTestId("template-3")).toBeNull();
    expect(screen.getByText(/Market-based Scope 2 isn't recorded/)).toBeTruthy();
    expect((screen.getByTestId("new-next") as HTMLButtonElement).disabled).toBe(true);
    await user.click(within(gallery).getByTestId("template-1"));
    expect(within(gallery).getByTestId("template-1").getAttribute("aria-checked")).toBe("true");
    await user.click(screen.getByTestId("new-next"));

    // Scope: carried over from the GHG report.
    expect((screen.getByLabelText("Year") as HTMLSelectElement).value).toBe("2026");
    expect((screen.getByLabelText("Bahrain plant") as HTMLInputElement).checked).toBe(true);
    await user.click(screen.getByLabelText("ISO 14064-1"));
    await user.click(screen.getByTestId("new-next"));

    // Report details, prefilled.
    await screen.findByTestId("input-responsible_person");
    await user.type(within(screen.getByTestId("input-responsible_person")).getByRole("textbox"), "Asha Rao");
    await user.click(screen.getByTestId("new-next"));

    // Words.
    expect(screen.getByRole("switch", { name: "Write text with AI" }).getAttribute("aria-checked")).toBe("true");
    await user.click(screen.getByTestId("new-build"));
    expect(await screen.findByTestId("build-progress")).toBeTruthy();
    await waitFor(() => expect(router.state.location.pathname).toBe("/studio/3"), { timeout: 5000 });
    expect(posted[0]).toMatchObject({ kind: "ghg", templateId: 1, year: 2026, yearType: "FY", compareYear: 2025, sites: [1], frameworks: ["GHGP", "ISO14064"], ai: true, inputs: { responsible_person: { value: "Asha Rao" } } });
    expect(studioMockDoc(3)?.doc.meta.sites).toEqual([1]);
  });

  it("a blank deck and a build that fails", async () => {
    const user = userEvent.setup();
    server.use(
      http.get("*/studio/docs/:id", ({ request, params }) =>
        new URL(request.url).searchParams.get("build") === "1"
          ? HttpResponse.json({ id: Number(params.id), rev: 1, status: "draft", title: "x", build: { state: "failed", steps: [{ id: "template", label: "Loading the template", state: "failed" }], dropped: [], pageCount: null, startedAt: "", finishedAt: "", error: { code: "DS_DOC_INVALID", message: "The template isn't valid." } } })
          : HttpResponse.json({}),
      ),
    );
    renderFlow("/studio/new?kind=ghg&format=slide_16_9&purpose=deck");
    await user.click(await screen.findByTestId("template-blank"));
    expect(screen.getByTestId("template-blank").textContent).toContain("Blank 16:9");
    await user.click(screen.getByTestId("new-next"));
    await user.click(screen.getByTestId("new-next"));
    await user.click(screen.getByTestId("new-next"));
    await user.click(screen.getByTestId("new-build"));
    expect(await screen.findByText("The template isn't valid.")).toBeTruthy();
    expect(posted[0]).toMatchObject({ templateId: "blank", format: "slide_16_9" });
    await user.click(screen.getByRole("button", { name: "Back to the details" }));
    expect(screen.getByTestId("new-build")).toBeTruthy();
  });

  it("sustainability without KPI tracking says so", async () => {
    server.use(http.get("*/studio/status", () => HttpResponse.json({ enabled: true, kinds: { ghg: true, sustainability: false } })));
    renderFlow("/studio/new?kind=sustainability");
    expect(await screen.findByText("Sustainability reports need KPI tracking.")).toBeTruthy();
  });
});
