// @vitest-environment jsdom
// AT-2 · the AI drawer's "Layouts for page N" and "Try another template" against the MSW studio mocks:
//   - Suggest layouts asks `suggest_layouts` for the page in view and shows three options;
//     picking one previews it (ghost outlines) without saving; Accept replaces the page as one
//     undo step and autosaves; Discard leaves the doc as it was;
//   - Try another template previews on the server, compares the pages side by side and Apply
//     saves through /template-swap/apply with the preview's hash; a stale preview says so.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { handlers, resetStudioMocks, studioMockDoc } from "../../../test/msw";
import type { FreeformPage } from "../../../lib/studio/contracts";
import { Editor } from "../editor/Editor";
import { resetAiStore } from "../ai/store";

vi.mock("../../../context/AuthContext", () => ({ useAuth: () => ({ role: "Manager", user: {} }) }));
vi.mock("../../../lib/clientContext", () => ({ useClientContext: () => ({ clientId: null }) }));

const posted: { path: string; body: Record<string, unknown> }[] = [];
const server = setupServer(
  http.post("*/studio/*", async ({ request }) => {
    posted.push({ path: new URL(request.url).pathname, body: (await request.clone().json().catch(() => ({}))) as Record<string, unknown> });
    return undefined as unknown as Response; // fall through to the studio mocks
  }),
  http.patch("*/studio/docs/:id", async ({ request }) => {
    posted.push({ path: new URL(request.url).pathname, body: (await request.clone().json().catch(() => ({}))) as Record<string, unknown> });
    return undefined as unknown as Response;
  }),
  ...handlers,
);

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1600 });
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
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

const cover = () => studioMockDoc(1)?.doc.pages.find((p) => p.id === "p-cover") as FreeformPage;
const frameOf = (id: string) => cover().elements.find((e) => e.id === id)!.frame;

async function openAi(user: ReturnType<typeof userEvent.setup>) {
  wrap();
  await screen.findByTestId("studio-editor", {}, { timeout: 5000 });
  await user.click(screen.getByRole("tab", { name: "AI" }));
  return screen.findByTestId("ai-panel");
}

describe("Layouts for the page in view (AT-2)", () => {
  it("shows three options, previews one without saving, and Accept applies it as one undo step", async () => {
    const user = userEvent.setup();
    const panel = await openAi(user);
    const layouts = within(panel).getByTestId("ai-layouts");
    expect(within(layouts).getByText("Layouts for page 1")).toBeTruthy();
    const totalBefore = { ...frameOf("p-cover.total") };
    const bgBefore = { ...frameOf("p-cover.bg") };

    await user.click(within(layouts).getByRole("button", { name: "Suggest layouts" }));
    const options = await within(layouts).findByRole("list", { name: "Layout options" });
    expect(within(options).getAllByRole("listitem")).toHaveLength(3);
    const req = posted.find((p) => /\/studio\/docs\/1\/ai$/.test(p.path))!;
    expect(req.body).toEqual({ action: "suggest_layouts", target: { pageId: "p-cover" } });
    expect(within(layouts).getByTestId("layout-reason").textContent).toMatch(/Why A:/);

    await user.click(within(layouts).getByTestId("layout-option-B"));
    expect(within(layouts).getByTestId("layout-option-B").getAttribute("aria-pressed")).toBe("true");
    expect(await screen.findByTestId("ai-ghost-p-cover.total")).toBeTruthy();
    expect(frameOf("p-cover.total")).toEqual(totalBefore); // nothing saved yet

    await user.click(within(layouts).getByRole("button", { name: /Accept B/ }));
    await waitFor(() => expect(frameOf("p-cover.total").x).not.toBe(totalBefore.x), { timeout: 4000 });
    expect(frameOf("p-cover.bg")).toEqual(bgBefore); // template-locked: stays
    expect(screen.queryByTestId("ai-ghost-p-cover.total")).toBeNull();
    const undo = screen.getByRole("button", { name: /^Undo AI: layout B/ });
    await user.click(undo);
    await waitFor(() => expect(frameOf("p-cover.total")).toEqual(totalBefore), { timeout: 4000 });
  });

  it("Discard drops the options and leaves the doc unchanged", async () => {
    const user = userEvent.setup();
    const panel = await openAi(user);
    const layouts = within(panel).getByTestId("ai-layouts");
    const before = JSON.stringify(studioMockDoc(1)?.doc);
    await user.click(within(layouts).getByRole("button", { name: "Suggest layouts" }));
    await within(layouts).findByRole("list", { name: "Layout options" });
    await user.click(within(layouts).getByTestId("layout-option-C"));
    await user.click(within(layouts).getByRole("button", { name: "Discard" }));
    expect(within(layouts).queryByRole("list", { name: "Layout options" })).toBeNull();
    expect(screen.queryByTestId("ai-ghost-p-cover.total")).toBeNull();
    await new Promise((r) => setTimeout(r, 1300)); // past the autosave delay
    expect(JSON.stringify(studioMockDoc(1)?.doc)).toBe(before);
    expect(posted.some((p) => p.path.endsWith("/studio/docs/1"))).toBe(false);
  });

  it("Try again asks for layouts different from the ones shown", async () => {
    const user = userEvent.setup();
    const panel = await openAi(user);
    const layouts = within(panel).getByTestId("ai-layouts");
    await user.click(within(layouts).getByRole("button", { name: "Suggest layouts" }));
    await within(layouts).findByRole("list", { name: "Layout options" });
    await user.click(within(layouts).getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(posted.filter((p) => /\/ai$/.test(p.path))).toHaveLength(2));
    const again = posted.filter((p) => /\/ai$/.test(p.path))[1].body as { params?: { differentFrom?: string } };
    expect(again.params?.differentFrom).toBeTruthy();
  });

  it("an AI error leaves the page unchanged", async () => {
    server.use(http.post("*/studio/docs/:id/ai", () => HttpResponse.json({ code: "DS_AI_BUDGET_EXCEEDED", message: "Over", details: { limit: "doc_day_usd" } }, { status: 429 })));
    const user = userEvent.setup();
    const panel = await openAi(user);
    const layouts = within(panel).getByTestId("ai-layouts");
    await user.click(within(layouts).getByRole("button", { name: "Suggest layouts" }));
    expect((await within(layouts).findByRole("alert")).textContent).toMatch(/unchanged/);
  });
});

describe("Try another template (AT-2)", () => {
  it("compares the pages side by side and Apply saves with the preview's hash", async () => {
    const user = userEvent.setup();
    const panel = await openAi(user);
    const swap = within(panel).getByTestId("ai-template-swap");
    await user.click(await within(swap).findByRole("button", { name: "ISO 14064-1 inventory · Night" }));
    const dialog = await screen.findByRole("dialog", { name: "Try ISO 14064-1 inventory · Night" });
    const compare = await within(dialog).findByTestId("swap-compare");
    expect(within(compare).getByRole("img", { name: "Page 1 now" })).toBeTruthy();
    expect(within(compare).getByRole("img", { name: "Page 1 with ISO 14064-1 inventory · Night" })).toBeTruthy();
    expect(within(compare).getByText(/take the new layouts|takes the new layouts/)).toBeTruthy();
    expect(studioMockDoc(1)?.doc.design.templateId).toBe("ghg-inventory"); // nothing saved by the preview

    await user.click(within(dialog).getByRole("button", { name: "Apply template" }));
    await waitFor(() => expect(studioMockDoc(1)?.doc.design.templateId).toBe("2"));
    const apply = posted.find((p) => p.path.endsWith("/template-swap/apply"))!;
    expect(apply.body).toMatchObject({ templateId: 2, rev: 1, previewHash: "mock:1:1:2" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: /Try ISO/ })).toBeNull());
    expect(screen.getByRole("button", { name: /^Undo Template: ISO 14064-1 inventory · Night/ })).toBeTruthy();
    // The autosave follows the server's new rev: no conflict dialog.
    await new Promise((r) => setTimeout(r, 1300));
    await waitFor(() => expect(screen.getByTestId("save-state").textContent).not.toMatch(/Saving|Unsaved/i));
    expect(screen.getByTestId("save-state").textContent).not.toMatch(/Changed elsewhere/);
    expect(screen.queryByText("This design changed somewhere else")).toBeNull();
    expect(studioMockDoc(1)?.doc.design.templateId).toBe("2");
  });

  it("a stale preview says so and changes nothing", async () => {
    server.use(http.post("*/studio/docs/:id/template-swap/apply", () => HttpResponse.json({ code: "DS_VERSION_CONFLICT", message: "Stale", details: { rev: 3 } }, { status: 409 })));
    const user = userEvent.setup();
    const panel = await openAi(user);
    const swap = within(panel).getByTestId("ai-template-swap");
    await user.click(await within(swap).findByRole("button", { name: "One-page summary · Classic" }));
    const dialog = await screen.findByRole("dialog", { name: "Try One-page summary · Classic" });
    await within(dialog).findByTestId("swap-compare");
    await user.click(within(dialog).getByRole("button", { name: "Apply template" }));
    expect(await within(dialog).findByText("The design changed since the preview. Preview again.")).toBeTruthy();
    expect(studioMockDoc(1)?.doc.design.templateId).toBe("ghg-inventory");
  });
});
