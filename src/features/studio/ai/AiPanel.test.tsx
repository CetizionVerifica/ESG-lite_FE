// @vitest-environment jsdom
// DS-9 · the AI drawer in the editor against the MSW studio mocks:
//   - the header says what is selected, the budget meter shows;
//   - a quick chip gives a reply and a suggestion card with a diff; Accept
//     changes the box (AI-written, unreviewed) as one undo step and autosaves;
//   - Discard leaves the doc exactly as it was;
//   - "Preview on page" draws the ghost outline without changing the doc;
//   - "AI ▾" on the text toolbar opens the drawer with a card for the box;
//   - an AI error says the report is unchanged;
//   - Design from a brief proposes templates and builds one through POST /docs.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { handlers, resetStudioMocks, studioMockDoc } from "../../../test/msw";
import type { FreeformPage } from "../../../lib/studio/contracts";
import { PX_PER_MM } from "../../../lib/studio/geometry";
import { Editor } from "../editor/Editor";
import { resetAiStore } from "./store";

vi.mock("../../../context/AuthContext", () => ({ useAuth: () => ({ role: "Manager", user: {} }) }));
vi.mock("../../../lib/clientContext", () => ({ useClientContext: () => ({ clientId: null }) }));

const posted: { path: string; body: Record<string, unknown> }[] = [];
const server = setupServer(
  http.post("*/studio/*", async ({ request }) => {
    posted.push({ path: new URL(request.url).pathname, body: (await request.clone().json().catch(() => ({}))) as Record<string, unknown> });
    return undefined as unknown as Response; // fall through to the studio mocks
  }),
  ...handlers,
);

class PointerEventShim extends MouseEvent {
  pointerId: number;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
  }
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  (window as unknown as { PointerEvent: typeof PointerEventShim }).PointerEvent = PointerEventShim;
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1600 });
  Range.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) }) as DOMRect;
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
  document.elementFromPoint = () => null;
});
beforeEach(() => {
  resetStudioMocks();
  resetAiStore();
  posted.length = 0;
  sessionStorage.clear();
});
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());

const wrap = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={["/studio/1"]}>
        <Routes>
          <Route path="/studio/:id" element={<Editor docId={1} />} />
          <Route path="/studio/:id" element={<p>Opened</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
const at = (zoom: number, x: number, y: number) => ({ clientX: x * PX_PER_MM * zoom, clientY: y * PX_PER_MM * zoom, button: 0 });
const zoomOf = () => Number(screen.getByTestId("zoom-value").textContent?.replace("%", "")) / 100;
const body = () => (studioMockDoc(1)?.doc.pages.find((p) => p.id === "p-summary") as FreeformPage).elements.find((e) => e.id === "p-summary.body")!;

async function openWithBodySelected() {
  wrap();
  await screen.findByTestId("studio-editor", {}, { timeout: 5000 });
  const overlay = await screen.findByTestId("overlay-p-summary");
  fireEvent.pointerDown(overlay, at(zoomOf(), 100, 60));
  fireEvent.pointerUp(overlay, at(zoomOf(), 100, 60));
  await waitFor(() => expect(screen.getByTestId("context-toolbar").dataset.toolbar).toBe("text"));
}

async function openAi(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("tab", { name: "AI" }));
  return screen.findByTestId("ai-panel");
}

describe("AI panel (DS-9)", () => {
  it("names the selection, shows the budget, and Accept applies the suggestion as one undoable step", async () => {
    const user = userEvent.setup();
    await openWithBodySelected();
    const panel = await openAi(user);
    expect(within(panel).getByTestId("ai-about").textContent).toMatch(/About: “Scope 1 emissions were .*” \(page 2\)/);
    await within(panel).findByText("$0.42 of $5 today");
    const before = JSON.stringify(studioMockDoc(1)?.doc);

    await user.click(within(panel).getByRole("button", { name: "Write the executive summary" }));
    const card = await within(panel).findByTestId("ai-suggestion");
    expect(within(panel).getByText(/draft of the executive summary/)).toBeTruthy();
    expect(card.dataset.action).toBe("ghg_exec_summary");
    const diff = within(card).getByTestId("ai-diff");
    const all = (sel: string) => [...diff.querySelectorAll(sel)].map((n) => n.textContent).join("");
    expect(all("del")).toMatch(/Scope 1/);
    expect(all("ins")).toMatch(/Total/);
    expect(diff.textContent).toMatch(/Total emissions were ⟦/);
    expect(within(card).getByText("Based on: Total emissions 2025")).toBeTruthy();
    const chat = posted.find((p) => p.path.endsWith("/ai/chat"))!;
    expect(chat.body.selection).toEqual({ pageId: "p-summary", elementIds: ["p-summary.body"] });
    expect(JSON.stringify(studioMockDoc(1)?.doc)).toBe(before);

    await user.click(within(card).getByRole("button", { name: "Accept" }));
    expect(card.dataset.status).toBe("accepted");
    // The fixture's box was AI-written and reviewed; the accepted text is AI-written and not reviewed.
    expect(before).toContain('"reviewed":true');
    await waitFor(() => expect(body().reviewed).toBe(false), { timeout: 4000 });
    const el = body();
    expect(el.source).toBe("ai");
    const nodes = el.type === "text" ? el.props.doc.content[0].content ?? [] : [];
    expect(nodes.map((n) => n.type)).toEqual(["text", "data", "text"]);
    expect(screen.getByRole("button", { name: /^Undo AI: Executive summary/ })).toBeTruthy();
  });

  it("Discard leaves the doc unchanged; Preview draws the ghost without saving", async () => {
    const user = userEvent.setup();
    await openWithBodySelected();
    const panel = await openAi(user);
    const before = JSON.stringify(studioMockDoc(1)?.doc);
    await user.click(within(panel).getByRole("button", { name: "Make it more concise" }));
    const card = await within(panel).findByTestId("ai-suggestion");
    await user.click(within(card).getByRole("button", { name: "Preview on page" }));
    expect(await screen.findByTestId("ai-ghost-p-summary.body")).toBeTruthy();
    expect(within(card).getByRole("button", { name: "Hide preview" }).getAttribute("aria-pressed")).toBe("true");
    await user.click(within(card).getByRole("button", { name: "Discard" }));
    expect(card.dataset.status).toBe("discarded");
    await waitFor(() => expect(screen.queryByTestId("ai-ghost-p-summary.body")).toBeNull());
    await new Promise((r) => setTimeout(r, 1300)); // past the autosave delay
    expect(JSON.stringify(studioMockDoc(1)?.doc)).toBe(before);
    expect(posted.some((p) => p.path.endsWith("/studio/docs/1"))).toBe(false);
  });

  it("“AI ▾” on the text toolbar opens the drawer with a card for the box", async () => {
    const user = userEvent.setup();
    await openWithBodySelected();
    await user.click(screen.getByTestId("ai-rewrite-menu"));
    await user.click(screen.getByRole("menuitem", { name: "Shorter" }));
    const panel = await screen.findByTestId("ai-panel");
    expect(within(panel).getByText("Make it shorter")).toBeTruthy();
    const card = await within(panel).findByTestId("ai-suggestion");
    expect(card.dataset.action).toBe("rewrite_shorter");
    const req = posted.find((p) => /\/studio\/docs\/1\/ai$/.test(p.path))!;
    expect(req.body).toEqual({ action: "rewrite_shorter", target: { pageId: "p-summary", elementId: "p-summary.body" } });
  });

  it("an AI error says the report is unchanged", async () => {
    server.use(http.post("*/studio/docs/:id/ai/chat", () => HttpResponse.json({ code: "DS_AI_BUDGET_EXCEEDED", message: "Over", details: { limit: "doc_day_usd" } }, { status: 429 })));
    const user = userEvent.setup();
    await openWithBodySelected();
    const panel = await openAi(user);
    await user.type(within(panel).getByLabelText("Ask about this report"), "How big is Scope 3?");
    await user.click(within(panel).getByRole("button", { name: "Send" }));
    expect((await within(panel).findByRole("alert")).textContent).toMatch(/AI is paused.*Your report is unchanged/);
  });

  it("Design from a brief proposes templates and builds the chosen one", async () => {
    const user = userEvent.setup();
    await openWithBodySelected();
    const panel = await openAi(user);
    await user.click(within(panel).getByRole("button", { name: "Design ideas from a brief" }));
    const dialog = await screen.findByRole("dialog", { name: "Design from a brief" });
    await user.type(within(dialog).getByLabelText("Brief"), "A short board summary, dark look");
    await user.click(within(dialog).getByRole("button", { name: "Suggest designs" }));
    const list = await within(dialog).findByTestId("brief-proposals");
    expect(within(list).getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(within(list).getByText("Board GHG brief")).toBeTruthy();
    await user.click(within(list).getAllByRole("button", { name: "Build this design" })[0]);
    await waitFor(() => expect(posted.some((p) => p.path === "/studio/docs")).toBe(true));
    const build = posted.find((p) => p.path === "/studio/docs")!.body;
    expect(build).toMatchObject({ kind: "ghg", sites: "all", ai: true, title: "Board GHG brief", frameworks: ["GHGP"] });
    expect(posted.find((p) => p.path === "/studio/ai/brief")!.body).toEqual({ kind: "ghg", brief: "A short board summary, dark look" });
  });
});
