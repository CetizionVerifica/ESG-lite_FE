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
import { STUDIO_GHG_DOC, setStudioMockKpi, studioMockDoc } from "../../../test/msw/studio";
import { EditorShellPage } from "./EditorShellPage";

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

function renderShell(id: number) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: "/studio/:id", element: <EditorShellPage /> }], { initialEntries: [`/studio/${id}`] });
  render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe("EditorShellPage", () => {
  it("shows every page drawn by the renderer, the rail, the page counter and zoom", async () => {
    renderShell(1);
    expect(await screen.findByTestId("studio-editor-shell")).toBeTruthy();
    const pages = screen.getAllByTestId("studio-page");
    expect(pages).toHaveLength(STUDIO_GHG_DOC.pages.length);
    expect(pages[0].textContent).toContain("Page 1 · Cover");
    // Free-form pages render in a shadow root (the renderer's HTML, isolated from app CSS).
    const sheet = screen.getByTestId("sheet-p-cover").querySelector("div") as HTMLDivElement;
    await waitFor(() => expect(sheet.shadowRoot?.querySelector(".ds-sheet")).toBeTruthy());
    expect(screen.getByTestId("studio-page-counter").textContent).toBe(`Page 1 / ${STUDIO_GHG_DOC.pages.length}`);
    for (const tab of ["templates", "elements", "text", "brand", "uploads", "data", "charts", "ai", "pages"]) expect(screen.getByTestId(`rail-${tab}`)).toBeTruthy();
    expect((screen.getByLabelText("Zoom") as HTMLInputElement).value).not.toBe("");
  });

  it("opens and closes drawers from the rail; the Data drawer lists the design's figures", async () => {
    const user = userEvent.setup();
    renderShell(1);
    await screen.findByTestId("studio-editor-shell");
    await user.click(screen.getByTestId("rail-elements"));
    expect(screen.getByRole("complementary", { name: "Elements" }).textContent).toContain("Coming soon in the editor.");
    await user.click(screen.getByTestId("rail-elements"));
    expect(screen.queryByRole("complementary", { name: "Elements" })).toBeNull();
    await user.click(screen.getByTestId("rail-data"));
    expect(await screen.findByTestId("studio-data-panel")).toBeTruthy();
  });

  it("renaming autosaves with the rev and says when it's saved", async () => {
    const user = userEvent.setup();
    renderShell(1);
    await user.click(await screen.findByTestId("studio-title"));
    const input = screen.getByLabelText("Design name");
    await user.clear(input);
    await user.type(input, "Board edition{Enter}");
    expect(screen.getByTestId("studio-title").textContent).toBe("Board edition");
    await waitFor(() => expect(studioMockDoc(1)?.doc.meta.title).toBe("Board edition"), { timeout: 3000 });
    expect(studioMockDoc(1)?.rev).toBe(2);
    await waitFor(() => expect(screen.getByTestId("studio-save-status").textContent).toMatch(/Saved/));
  });

  it("a conflicting save asks to reload", async () => {
    const user = userEvent.setup();
    server.use(http.patch("*/studio/docs/:id", () => HttpResponse.json({ code: "DS_VERSION_CONFLICT", message: "Changed", details: { rev: 5 } }, { status: 409 })));
    renderShell(1);
    await user.click(await screen.findByTestId("studio-title"));
    await user.type(screen.getByLabelText("Design name"), " v2{Enter}");
    const dialog = await screen.findByRole("dialog", {}, { timeout: 3000 });
    expect(within(dialog).getByText("Someone else changed this design")).toBeTruthy();
    expect(screen.getByTestId("studio-save-status").textContent).toContain("Changed elsewhere");
    await user.click(within(dialog).getByRole("button", { name: "Reload the design" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("a sustainability design with KPI tracking off, and an unknown design", async () => {
    setStudioMockKpi(false);
    renderShell(2);
    expect(await screen.findByText("Sustainability reports need KPI tracking.")).toBeTruthy();
    cleanup();
    renderShell(99);
    expect(await screen.findByText("This design wasn't found.")).toBeTruthy();
  });
});
