// @vitest-environment jsdom
// DS-11 · Page view and Present against the MSW mocks. preview.html's own
// script doesn't run in jsdom, so its bridge messages are sent here the way
// the frame sends them (postMessage from the frame's window).
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { setupServer } from "msw/node";
import { ToastProvider } from "../../../ui";
import { handlers, resetStudioMocks } from "../../../test/msw";
import { setStudioMockJobPolls, studioMockDoc } from "../../../test/msw/studio";
import { PreviewPage } from "./PreviewPage";
import { PresentPage } from "../present/PresentPage";

vi.mock("../../../context/AuthContext", () => ({ useAuth: () => ({ role: "Admin", user: {} }) }));

const server = setupServer(...handlers);
beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  URL.createObjectURL = vi.fn(() => "blob:mock/proof") as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn();
});
beforeEach(() => {
  resetStudioMocks();
  setStudioMockJobPolls(0);
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

function renderRoutes(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: "/studio/:id/preview", element: <PreviewPage /> },
      { path: "/studio/:id/present", element: <PresentPage /> },
      { path: "/studio/:id", element: <p>editor</p> },
    ],
    { initialEntries: [path] },
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

/** Sends a bridge message as the preview frame. */
function fromFrame(data: Record<string, unknown>) {
  const frame = screen.getByTestId("preview-frame") as HTMLIFrameElement;
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { data: { source: "ds-preview", ...data }, source: frame.contentWindow }));
  });
}

describe("Page view (/studio/:id/preview)", () => {
  it("shows every page from preview.html in a sandboxed frame; a click opens the element in the editor", async () => {
    const router = renderRoutes("/studio/1/preview");
    const frame = (await screen.findByTestId("preview-frame")) as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.getAttribute("srcdoc")).toContain('data-mode="paged"');
    expect(frame.getAttribute("srcdoc")).toContain('data-page-id="p-cover"');
    fromFrame({ type: "ready", pageCount: 5, error: null });
    expect(await screen.findByText("5 pages")).toBeTruthy();
    // A message from anywhere else is ignored.
    act(() => window.dispatchEvent(new MessageEvent("message", { data: { source: "ds-preview", type: "select", pageId: "p-cover", elId: "x" } })));
    expect(router.state.location.pathname).toBe("/studio/1/preview");
    fromFrame({ type: "select", pageId: "p-summary", elId: "p-summary.title" });
    await waitFor(() => expect(router.state.location.pathname).toBe("/studio/1"));
    expect(router.state.location.search).toBe("?page=p-summary&el=p-summary.title");
  });

  it("PDF proof: makes a proof and shows it in the PDF viewer; Admins see Share without view links", async () => {
    const user = userEvent.setup();
    renderRoutes("/studio/1/preview");
    await screen.findByTestId("preview-frame");
    await user.click(screen.getByRole("radio", { name: "PDF proof" }));
    expect(await screen.findByText("See the PDF before you share it.")).toBeTruthy();
    await user.click(screen.getByTestId("make-proof"));
    const viewer = await screen.findByTestId("proof-viewer", undefined, { timeout: 4000 });
    expect(viewer.getAttribute("src")).toBe("blob:mock/proof");
    expect(screen.getByText(/PDF proof · 5 pages · kept until/)).toBeTruthy();
    await user.click(screen.getByTestId("share-menu"));
    expect(screen.getByTestId("share-view-link").getAttribute("aria-disabled")).toBe("true");
  });

  it("a design that isn't there says so", async () => {
    renderRoutes("/studio/99/preview");
    expect(await screen.findByText("This design couldn't be opened.")).toBeTruthy();
  });
});

describe("Present (/studio/:id/present)", () => {
  it("counts slides, steps with the keys, shows speaker notes (side panel without pop-ups) and Esc leaves", async () => {
    const user = userEvent.setup();
    const posted: unknown[] = [];
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const router = renderRoutes("/studio/1/present");
    const frame = (await screen.findByTestId("preview-frame")) as HTMLIFrameElement;
    expect(frame.getAttribute("srcdoc")).toContain('data-mode="present"');
    const doc = studioMockDoc(1)!.doc;
    const first = doc.pages[0];
    fromFrame({ type: "ready", pageCount: doc.pages.length, error: null });
    fromFrame({ type: "slide", index: 0, count: doc.pages.length, pageId: first.id });
    vi.spyOn(frame.contentWindow as Window, "postMessage").mockImplementation((m: unknown) => void posted.push(m));
    (document.activeElement as HTMLElement | null)?.blur();
    expect(screen.getByTestId("present-counter").textContent).toBe(`1 / ${doc.pages.length}`);
    // Keys pressed on the app move the deck through the frame.
    await user.keyboard("{ArrowRight}");
    expect(posted).toContainEqual({ source: "ds-host", type: "go", index: 1 });
    fromFrame({ type: "slide", index: 1, count: doc.pages.length, pageId: doc.pages[1].id });
    expect(screen.getByTestId("present-counter").textContent).toBe(`2 / ${doc.pages.length}`);
    // N opens the notes window; blocked → the side panel.
    await user.keyboard("n");
    expect(open).toHaveBeenCalled();
    const notes = await screen.findByTestId("present-notes");
    expect(within(notes).getByRole("heading").textContent).toBe(doc.pages[1].name);
    // Keys from inside the frame arrive as messages: Esc leaves.
    fromFrame({ type: "key", key: "Escape" });
    await waitFor(() => expect(router.state.location.pathname).toBe("/studio/1"));
    open.mockRestore();
  });

  it("writes the notes into a second window when pop-ups are allowed", async () => {
    const user = userEvent.setup();
    const win = document.implementation.createHTMLDocument("notes");
    const fake = { closed: false, close: vi.fn(), document: win } as unknown as Window;
    const open = vi.spyOn(window, "open").mockReturnValue(fake);
    renderRoutes("/studio/1/present");
    await screen.findByTestId("preview-frame");
    const doc = studioMockDoc(1)!.doc;
    fromFrame({ type: "slide", index: 0, count: doc.pages.length, pageId: doc.pages[0].id });
    await user.click(screen.getByRole("button", { name: "Notes" }));
    await waitFor(() => expect(win.body.textContent).toContain(`Page 1 of ${doc.pages.length}`));
    expect(win.body.textContent).toContain(doc.pages[0].name);
    expect(screen.queryByTestId("present-notes")).toBeNull();
    open.mockRestore();
  });
});
