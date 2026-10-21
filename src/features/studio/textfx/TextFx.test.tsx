// @vitest-environment jsdom
// PE-2 · text effects, per-box fonts and find and replace in the editor
// against the MSW studio mocks:
//   - Effects: Shadow then Lift (they exclude each other), drawn by the renderer, one undo step each;
//   - Font: an uploaded brand font is listed and drawn as "DS Brand <id>";
//   - ⌘⇧F: find counts matches, skips locked text, Replace all is one undo step and never touches chips.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { setupServer } from "msw/node";
import { HttpResponse, http } from "msw";
import { handlers, resetStudioMocks, studioMockDoc } from "../../../test/msw";
import type { BrandFont, BrandFontsResponse, Element, FreeformPage } from "../../../lib/studio/contracts";
import { PX_PER_MM } from "../../../lib/studio/geometry";
import { resetCustomFonts } from "../../../lib/studio/renderHost";
import { Editor } from "../editor/Editor";
import { sheetRoot } from "../editor/canvasUtil";

const MIDAL: BrandFont = {
  id: 1,
  ref: "custom:1",
  family: "Midal Sans",
  weights: [400],
  styles: ["normal"],
  assetIds: ["font-1"],
  files: [{ assetId: "font-1", weight: 400, style: "normal", format: "woff2", bytes: 8, url: "/studio/brand-kit/fonts/1/files/font-1" }],
  licenceConfirmedBy: 2,
  licenceConfirmedAt: "2026-10-20T00:00:00.000Z",
  createdAt: "2026-10-20T00:00:00.000Z",
};

vi.mock("../../../context/AuthContext", () => ({ useAuth: () => ({ role: "Manager", user: {} }) }));
vi.mock("../../../lib/clientContext", () => ({ useClientContext: () => ({ clientId: null }) }));

const server = setupServer(...handlers);

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
});
beforeEach(() => {
  resetStudioMocks();
  resetCustomFonts();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());

const wrap = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <Editor docId={1} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
const at = (zoom: number, x: number, y: number) => ({ clientX: x * PX_PER_MM * zoom, clientY: y * PX_PER_MM * zoom, button: 0 });
const zoomOf = () => Number(screen.getByTestId("zoom-value").textContent?.replace("%", "")) / 100;
const page = (id: string) => studioMockDoc(1)?.doc.pages.find((p) => p.id === id) as FreeformPage;
const el = (pageId: string, id: string) => page(pageId).elements.find((e) => e.id === id) as Extract<Element, { type: "text" }>;
const rendered = (id: string) => sheetRoot("p-summary")?.querySelector<HTMLElement>(`[data-el-id="${id}"]`) ?? null;

async function openEditor() {
  wrap();
  await screen.findByTestId("studio-editor", {}, { timeout: 5000 });
  await screen.findByTestId("overlay-p-summary");
}

/** Clicks the heading so the text toolbar shows. */
async function selectHeading() {
  const z = zoomOf();
  const overlay = screen.getByTestId("overlay-p-summary");
  fireEvent.pointerDown(overlay, at(z, 30, 25));
  fireEvent.pointerUp(overlay, at(z, 30, 25));
  await waitFor(() => expect(screen.getByTestId("context-toolbar").getAttribute("data-toolbar")).toBe("text"));
}

describe("text effects (PE-2)", () => {
  it("Shadow then Lift: they exclude each other, the renderer draws them, each is one undo step and autosaves", async () => {
    const user = userEvent.setup();
    await openEditor();
    await selectHeading();
    await user.click(screen.getByTestId("text-effects"));
    const panel = await screen.findByRole("dialog", { name: "Text effects" });
    await user.click(within(panel).getByRole("button", { name: /Shadow/ }));
    await waitFor(() => expect(rendered("p-summary.heading")?.getAttribute("data-effects")).toBe("shadow"));
    expect(within(panel).getByLabelText("Shadow blur")).toBeTruthy();
    await user.click(within(panel).getByRole("button", { name: /Lift/ }));
    await waitFor(() => expect(rendered("p-summary.heading")?.getAttribute("data-effects")).toBe("lift"));
    await waitFor(() => expect(el("p-summary", "p-summary.heading").props.effects).toEqual({ lift: { intensity: 50 } }), { timeout: 4000 });
    // A slider drag is one merged step.
    fireEvent.change(within(panel).getByLabelText("Lift"), { target: { value: "80" } });
    fireEvent.change(within(panel).getByLabelText("Lift"), { target: { value: "90" } });
    await waitFor(() => expect(el("p-summary", "p-summary.heading").props.effects?.lift?.intensity).toBe(90), { timeout: 4000 });
    fireEvent.keyDown(panel, { key: "Escape" });
    await user.click(await screen.findByRole("button", { name: /^Undo Lift/ }));
    await waitFor(() => expect(el("p-summary", "p-summary.heading").props.effects?.lift?.intensity).toBe(50), { timeout: 4000 });
    await user.click(await screen.findByRole("button", { name: /^Undo Lift/ }));
    await waitFor(() => expect(rendered("p-summary.heading")?.getAttribute("data-effects")).toBe("shadow"));
  }, 20000);

  it("None removes every effect; the box renders as before", async () => {
    const user = userEvent.setup();
    await openEditor();
    await selectHeading();
    const before = rendered("p-summary.heading")?.outerHTML;
    await user.click(screen.getByTestId("text-effects"));
    const panel = await screen.findByRole("dialog", { name: "Text effects" });
    await user.click(within(panel).getByRole("button", { name: /Outline/ }));
    await waitFor(() => expect(rendered("p-summary.heading")?.getAttribute("data-effects")).toBe("outline"));
    await user.click(within(panel).getByRole("button", { name: /None/ }));
    await waitFor(() => expect(rendered("p-summary.heading")?.outerHTML).toBe(before));
  }, 20000);
});

describe("fonts per text box (PE-2)", () => {
  it("lists an uploaded brand font and draws the box in it", async () => {
    const user = userEvent.setup();
    // jsdom's XHR never completes a multipart upload through MSW, so the list answers with an uploaded font.
    server.use(http.get("*/studio/brand-kit/fonts", () => HttpResponse.json<BrandFontsResponse>({ fonts: [MIDAL], canEdit: true })));
    await openEditor();
    await selectHeading();
    const picker = (await screen.findByLabelText("Font")) as HTMLSelectElement;
    await waitFor(() => expect(within(picker).getByRole("option", { name: "Midal Sans (uploaded)" })).toBeTruthy());
    await user.selectOptions(picker, "custom:1");
    await waitFor(() => expect(rendered("p-summary.heading")?.getAttribute("data-font")).toBe("custom:1"));
    expect(rendered("p-summary.heading")?.querySelector<HTMLElement>(".ds-text")?.style.fontFamily).toContain("DS Brand 1");
    await waitFor(() => expect(el("p-summary", "p-summary.heading").props.font).toBe("custom:1"), { timeout: 4000 });
    await user.selectOptions(picker, "");
    await waitFor(() => expect(rendered("p-summary.heading")?.getAttribute("data-font")).toBeNull());
  }, 20000);
});

describe("find and replace (PE-2)", () => {
  it("⌘⇧F opens it; matches skip locked text; Replace all is one undo step and keeps the chips", async () => {
    const note = el("p-summary", "p-summary.note") as unknown as Element;
    note.locked = true;
    (note as Extract<Element, { type: "callout" }>).props.doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Reported versus the base year." }] }] };
    const user = userEvent.setup();
    await openEditor();
    fireEvent.keyDown(window, { key: "F", ctrlKey: true, shiftKey: true });
    const panel = await screen.findByRole("dialog", { name: "Find and replace" });
    await waitFor(() => expect(document.activeElement).toBe(within(panel).getByLabelText("Find")));
    await user.type(within(panel).getByLabelText("Find"), "versus");
    expect(screen.getByTestId("find-summary").textContent).toBe("1 match on 1 page · data chips and locked text are never changed · 1 match in locked text or hidden pages left as they are");
    await user.click(within(panel).getByRole("button", { name: "Next match" }));
    await waitFor(() => expect(screen.getByTestId("context-toolbar").getAttribute("data-toolbar")).toBe("text"));
    await user.type(within(panel).getByLabelText("Replace with"), "against");
    await user.click(within(panel).getByRole("button", { name: "Replace all" }));
    expect(await within(panel).findByText("Replaced 1. Undo puts them all back.")).toBeTruthy();
    await waitFor(() => expect(JSON.stringify(el("p-summary", "p-summary.body").props.doc)).toContain(" against 2024."), { timeout: 4000 });
    const body = JSON.stringify(el("p-summary", "p-summary.body").props.doc);
    expect(body.match(/"type":"data"/g)?.length).toBe(2);
    expect(JSON.stringify(el("p-summary", "p-summary.note").props.doc)).toContain("versus");
    // A number can't be typed in.
    await user.clear(within(panel).getByLabelText("Replace with"));
    await user.type(within(panel).getByLabelText("Replace with"), "2030");
    expect(within(panel).getByText(/Figures come from your data/)).toBeTruthy();
    expect((within(panel).getByRole("button", { name: "Replace all" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(panel, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Find and replace" })).toBeNull());
    await user.click(await screen.findByRole("button", { name: /^Undo Replace all/ }));
    await waitFor(() => expect(JSON.stringify(el("p-summary", "p-summary.body").props.doc)).toContain(" versus 2024."), { timeout: 4000 });
  }, 20000);
});
