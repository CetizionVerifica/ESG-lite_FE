// @vitest-environment jsdom
// DS-6 · the editor shell against the MSW studio mocks: drawers switch, the
// toolbar follows the selection, Position aligns to the page, moving commits
// one frame change, locked elements stay, undo, autosave PATCH with rev.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { setupServer } from "msw/node";
import { http } from "msw";
import { handlers, resetStudioMocks, studioMockDoc } from "../../../test/msw";
import type { FreeformPage } from "../../../lib/studio/contracts";
import { PX_PER_MM } from "../../../lib/studio/geometry";
import { Editor } from "./Editor";

vi.mock("../../../context/AuthContext", () => ({ useAuth: () => ({ role: "Manager", user: {} }) }));
vi.mock("../../../lib/clientContext", () => ({ useClientContext: () => ({ clientId: null }) }));

const patches: { rev: number }[] = [];
const server = setupServer(
  http.patch("*/studio/docs/:id", async ({ request }) => {
    const b = (await request.clone().json()) as { rev: number };
    patches.push({ rev: b.rev });
    return undefined as unknown as Response; // fall through to the studio mock
  }),
  ...handlers,
);

// jsdom has no PointerEvent: a MouseEvent carries clientX/Y and the buttons.
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
  patches.length = 0;
  sessionStorage.clear();
});
afterEach(() => cleanup());
afterAll(() => server.close());

const wrap = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Editor docId={1} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};

/** Page mm → client px on an overlay at the editor's zoom (rects are 0,0 in jsdom). */
const at = (zoom: number, x: number, y: number) => ({ clientX: x * PX_PER_MM * zoom, clientY: y * PX_PER_MM * zoom, button: 0 });
const zoomOf = () => Number(screen.getByTestId("zoom-value").textContent?.replace("%", "")) / 100;

async function openEditor() {
  wrap();
  await screen.findByTestId("studio-editor", {}, { timeout: 5000 });
  await screen.findByTestId("overlay-p-scope3");
}

describe("Editor (DS-6)", () => {
  it("opens the doc: rail, toolbar for the page, every page with its title", async () => {
    await openEditor();
    expect(screen.getByRole("tablist", { name: "Side panels" })).toBeTruthy();
    expect(screen.getAllByRole("tab")).toHaveLength(9);
    expect(screen.getByTestId("context-toolbar").dataset.toolbar).toBe("page");
    expect(screen.getByLabelText("Page 3 title")).toHaveProperty("value", "Scope 3");
    expect(screen.getByTestId("page-counter").textContent).toContain("/ 5");
  });

  it("the drawer switches between tabs, and the open tab closes it", async () => {
    const user = userEvent.setup();
    await openEditor();
    await user.click(screen.getByRole("tab", { name: "Pages" }));
    expect(screen.getByTestId("drawer").dataset.drawer).toBe("pages");
    expect(screen.getByTestId("pages-panel")).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "Elements" }));
    expect(screen.getByTestId("drawer").dataset.drawer).toBe("elements");
    expect((await screen.findAllByRole("button", { name: "Circle frame" })).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("tab", { name: "Brand" }));
    expect(await screen.findByTestId("brand-panel")).toBeTruthy();
    await user.click(screen.getByRole("tab", { name: "Brand" }));
    expect(screen.queryByTestId("drawer")).toBeNull();
    // Keyboard: arrows move along the rail.
    const first = screen.getByRole("tab", { name: "Templates" });
    first.focus();
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(screen.getByRole("tab", { name: "Elements" }));
  });

  it("the toolbar follows the selection; moving commits one frame change; undo puts it back", async () => {
    await openEditor();
    const z = zoomOf();
    const overlay = screen.getByTestId("overlay-p-scope3");
    // Click the KPI tile (20,120 60×30).
    fireEvent.pointerDown(overlay, at(z, 30, 130));
    fireEvent.pointerUp(overlay, at(z, 30, 130));
    expect(screen.getByTestId("context-toolbar").dataset.toolbar).toBe("kpi_tile");
    expect(screen.getByRole("button", { name: "Edit data" })).toBeTruthy();
    // Drag it 10 mm right (snapping can move it a little more).
    fireEvent.pointerDown(overlay, at(z, 30, 130));
    fireEvent.pointerMove(overlay, at(z, 35, 130));
    fireEvent.pointerMove(overlay, at(z, 40.3, 130));
    fireEvent.pointerUp(overlay, at(z, 40.3, 130));
    await waitFor(() => expect(screen.getByRole("button", { name: /^Undo Move/ })).toBeTruthy());
    // An image frame on another element changes the toolbar.
    fireEvent.pointerDown(overlay, at(z, 150, 190));
    fireEvent.pointerUp(overlay, at(z, 150, 190));
    expect(screen.getByTestId("context-toolbar").dataset.toolbar).toBe("grid");
    // Empty page: the page toolbar.
    fireEvent.pointerDown(overlay, at(z, 5, 290));
    fireEvent.pointerUp(overlay, at(z, 5, 290));
    expect(screen.getByTestId("context-toolbar").dataset.toolbar).toBe("page");
    expect(screen.getByRole("button", { name: /Reset to layout/ })).toBeTruthy();
    // Undo the move.
    fireEvent.click(screen.getByRole("button", { name: /^Undo Move/ }));
    expect(screen.queryByRole("button", { name: /^Undo/ })?.hasAttribute("disabled")).toBe(true);
  });

  it("Position: align to page centres the element; autosave PATCHes with the rev", async () => {
    await openEditor();
    const z = zoomOf();
    const overlay = screen.getByTestId("overlay-p-scope3");
    fireEvent.pointerDown(overlay, at(z, 30, 130));
    fireEvent.pointerUp(overlay, at(z, 30, 130));
    fireEvent.click(screen.getByRole("button", { name: "Position" }));
    const panel = await screen.findByTestId("position-panel");
    fireEvent.click(within(panel).getByRole("button", { name: "Align centre to page" }));
    expect((within(panel).getByLabelText("X") as HTMLInputElement).value).toBe("75");
    await waitFor(() => expect(patches).toEqual([{ rev: 1 }]), { timeout: 4000 });
    await waitFor(() => {
      const saved = studioMockDoc(1);
      const tile = (saved?.doc.pages.find((p) => p.id === "p-scope3") as FreeformPage).elements.find((e) => e.id === "p-scope3.cat4");
      expect(tile?.frame.x).toBe(75);
      expect(saved?.rev).toBe(2);
    });
    await waitFor(() => expect(screen.getByTestId("save-state").textContent).toContain("Saved"));
  });

  it("a locked element can be selected but doesn't move", async () => {
    await openEditor();
    const z = zoomOf();
    const overlay = screen.getByTestId("overlay-p-scope3");
    fireEvent.pointerDown(overlay, at(z, 30, 130));
    fireEvent.pointerUp(overlay, at(z, 30, 130));
    fireEvent.click(screen.getByRole("button", { name: "Lock" }));
    expect(screen.getByRole("button", { name: "Unlock" })).toBeTruthy();
    fireEvent.pointerDown(overlay, at(z, 30, 130));
    fireEvent.pointerMove(overlay, at(z, 60, 160));
    fireEvent.pointerUp(overlay, at(z, 60, 160));
    expect(screen.getByRole("button", { name: /^Undo Lock/ })).toBeTruthy(); // no Move step
    expect(screen.getByTestId("sel-p-scope3.cat4").style.left).toBe(`${20 * PX_PER_MM * z}px`);
  });

  it("shortcuts: Delete removes, ⌘Z restores; typing in a field never deletes", async () => {
    await openEditor();
    const z = zoomOf();
    const overlay = screen.getByTestId("overlay-p-scope3");
    fireEvent.pointerDown(overlay, at(z, 30, 130));
    fireEvent.pointerUp(overlay, at(z, 30, 130));
    fireEvent.keyDown(screen.getByLabelText("Page 3 title"), { key: "Backspace" });
    expect(screen.queryByTestId("sel-p-scope3.cat4")).toBeTruthy();
    fireEvent.keyDown(window, { key: "Delete" });
    expect(screen.queryByTestId("sel-p-scope3.cat4")).toBeNull();
    fireEvent.keyDown(window, { key: "z", metaKey: true });
    fireEvent.pointerDown(overlay, at(z, 30, 130));
    fireEvent.pointerUp(overlay, at(z, 30, 130));
    expect(screen.queryByTestId("sel-p-scope3.cat4")).toBeTruthy();
  });

  it("grid view groups pages and deletes the picked ones after a confirm", async () => {
    const user = userEvent.setup();
    await openEditor();
    fireEvent.keyDown(window, { key: "3", code: "Digit3", metaKey: true, altKey: true });
    const grid = await screen.findByTestId("grid-view");
    expect(within(grid).getByRole("region", { name: "All pages" })).toBeTruthy();
    await user.click(screen.getByTestId("grid-page-p-factors"));
    expect(within(grid).getByText("1 page selected")).toBeTruthy();
    await user.click(within(grid).getByRole("button", { name: "Delete" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(screen.queryByTestId("grid-page-p-factors")).toBeNull();
  });

  it("an unknown doc says so", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <Editor docId={999} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByText("This design couldn't be opened.")).toBeTruthy();
    expect(screen.getByText(/doesn't exist/)).toBeTruthy();
  });
});
