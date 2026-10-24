// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";
import { handlers, resetStudioMocks } from "../../../test/msw";
import { setStudioMockEnabled, setStudioMockSourceDataChanged, studioMockDoc } from "../../../test/msw/studio";
import type { ReportDoc } from "../../../lib/studio/contracts";
import { ResizeDialog } from "./ResizeDialog";
import { LinkedSourceChip } from "./LinkedSourceChip";
import { resizeDesign } from "./api";

vi.mock("../../../context/AuthContext", () => ({ useAuth: () => ({ role: "Manager", user: {} }) }));

const server = setupServer(...handlers);
const posted: Array<Record<string, unknown>> = [];
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
beforeEach(() => {
  resetStudioMocks();
  posted.length = 0;
  server.events.on("request:start", async ({ request }) => {
    if (request.method === "POST" && /\/studio\/docs\/\d+\/resize$/.test(new URL(request.url).pathname)) posted.push((await request.clone().json()) as Record<string, unknown>);
  });
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
  server.events.removeAllListeners();
});
afterAll(() => server.close());

function renderAt(element: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: "/studio/:id", element },
      { path: "/studio/:id/*", element: <p>other</p> },
    ],
    { initialEntries: ["/studio/1"] },
  );
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

const source = () => studioMockDoc(1)!.doc;

describe("ResizeDialog", () => {
  it("opens on a board deck with its slide count and a preview of the first three slides", async () => {
    renderAt(<ResizeDialog open onClose={() => undefined} docId={1} doc={source()} data={null} brand={null} />);
    const dialog = screen.getByRole("dialog", { name: "Resize and convert" });
    expect(within(dialog).getByText(new RegExp(`From ${source().meta.title} · A4`))).toBeTruthy();
    expect((screen.getByTestId("resize-target-deck") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId("resize-target-summary") as HTMLInputElement).checked).toBe(false);
    const preview = screen.getByTestId("resize-preview");
    expect(within(preview).getAllByRole("img")).toHaveLength(3);
    expect(within(preview).getByText(/^Slide 1 · /)).toBeTruthy();
    expect(screen.getByTestId("resize-note").textContent).toMatch(/^Showing 3 of \d+ slides\./);
    expect(screen.getByRole("button", { name: "Create copy" })).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Summarise text with AI" }).getAttribute("aria-checked")).toBe("false");
  });

  it("makes a deck and a summary: two linked designs, listed with Open links", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderAt(<ResizeDialog open onClose={onClose} docId={1} doc={source()} data={null} brand={null} />);
    await user.click(screen.getByTestId("resize-target-summary"));
    // The preview follows the last ticked target; both are in the tabs.
    expect(screen.getByRole("radiogroup", { name: "Preview" })).toBeTruthy();
    expect(within(screen.getByTestId("resize-preview")).getByText(/^Page 1 · /)).toBeTruthy();
    await user.click(screen.getByRole("switch", { name: "Summarise text with AI" }));
    await user.click(screen.getByRole("button", { name: "Create 2 copies" }));
    const made = await screen.findByTestId("resize-made");
    expect(within(made).getByText("2 copies made")).toBeTruthy();
    const links = within(made).getAllByRole("link", { name: /Open/ });
    expect(links).toHaveLength(2);
    expect(posted.map((b) => [b.format, b.purpose, b.title, b.ai, b.pageIds])).toEqual([
      ["slide_16_9", "deck", `${source().meta.title} · Board deck`, true, undefined],
      ["a4", "summary", `${source().meta.title} · One-page summary`, true, undefined],
    ]);
    const deckId = Number(links[0].getAttribute("href")!.split("/").pop());
    const copy = studioMockDoc(deckId)!.doc as ReportDoc;
    expect(copy.format).toBe("slide_16_9");
    expect(copy.source).toMatchObject({ docId: 1 });
  });

  it("one copy opens at once; the chapter picker sends the pages of the chapters ticked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const router = renderAt(<ResizeDialog open onClose={onClose} docId={1} doc={source()} data={null} brand={null} />);
    expect((screen.getByTestId("resize-chapter-summary") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByTestId("resize-chapter-scope3") as HTMLInputElement).checked).toBe(false);
    await user.click(screen.getByTestId("resize-chapter-scope3"));
    await user.click(screen.getByTestId("resize-create"));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(router.state.location.pathname).toMatch(/^\/studio\/\d+$/);
    expect(router.state.location.pathname).not.toBe("/studio/1");
    expect(posted[0].pageIds).toEqual(["p-cover", "p-summary", "p-scope3", "p-categories"]);
  });

  it("says why a copy failed, and Create waits for at least one chapter", async () => {
    server.use(http.post("*/studio/docs/:id/resize", () => HttpResponse.json({ code: "DS_RESIZE_UNSUPPORTED", message: "x" }, { status: 422 })));
    const user = userEvent.setup();
    renderAt(<ResizeDialog open onClose={() => undefined} docId={1} doc={source()} data={null} brand={null} />);
    await user.click(screen.getByTestId("resize-create"));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "This design can't be made in that shape.");
    for (const box of screen.getAllByTestId(/^resize-chapter-/) as HTMLInputElement[]) if (box.checked) await user.click(box);
    expect(screen.getByText("Pick at least one chapter.")).toBeTruthy();
    expect((screen.getByTestId("resize-create") as HTMLButtonElement).disabled).toBe(true);
  });

  it("closes on Esc", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderAt(<ResizeDialog open onClose={onClose} docId={1} doc={source()} data={null} brand={null} />);
    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });
});

describe("LinkedSourceChip", () => {
  const makeCopy = async () => {
    const r = await resizeDesign(1, { format: "a4", purpose: "summary", title: "Copy" }, null);
    return { id: r.id, doc: studioMockDoc(r.id)!.doc as ReportDoc };
  };

  it("shows nothing (and asks nothing) for a design that isn't a copy", () => {
    renderAt(<LinkedSourceChip docId={1} doc={source()} />);
    expect(screen.queryByTestId("linked-source")).toBeNull();
  });

  it("says Made from <source>, links to it, and flags Source data changed", async () => {
    const copy = await makeCopy();
    renderAt(<LinkedSourceChip docId={copy.id} doc={copy.doc} />);
    const link = await screen.findByRole("link", { name: `Made from ${source().meta.title}` });
    expect(link.getAttribute("href")).toBe("/studio/1");
    expect(screen.queryByTestId("source-data-changed")).toBeNull();
    cleanup();
    setStudioMockSourceDataChanged();
    renderAt(<LinkedSourceChip docId={copy.id} doc={copy.doc} />);
    expect(await screen.findByTestId("source-data-changed")).toHaveProperty("textContent", " Source data changed");
  });

  it("says when the source was deleted, and answers the switch-off quietly", async () => {
    const copy = await makeCopy();
    server.use(http.get("*/studio/docs/:id/source", () => HttpResponse.json({ source: { docId: 1, exists: false, title: null, rev: 1, dataHash: "h", currentRev: null, currentDataHash: null, dataChanged: false } })));
    renderAt(<LinkedSourceChip docId={copy.id} doc={copy.doc} />);
    expect(await screen.findByText("Made from a deleted design")).toBeTruthy();
    cleanup();
    server.resetHandlers();
    setStudioMockEnabled(false);
    renderAt(<LinkedSourceChip docId={copy.id} doc={copy.doc} />);
    expect(await screen.findByText("Made from another design")).toBeTruthy();
  });
});
