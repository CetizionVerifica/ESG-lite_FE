// @vitest-environment jsdom
// DS-7 · text in the editor against the MSW studio mocks:
//   - double-click mounts TipTap in place; Esc commits one undoable step; the
//     editor's Delete shortcut never fires while typing;
//   - `{{` opens the data picker; picking inserts a chip with the server's value;
//   - the picker lists the doc's kind only (GHG metrics or KPIs);
//   - footnotes number in reading order and renumber after a move;
//   - an overflowing box shows "+N lines" and "Shrink text to fit" clears it;
//   - the Text drawer adds a heading (ready to type) and a preset;
//   - a flow page opens its settings: categories, show DQ, autosaved.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { setupServer } from "msw/node";
import { handlers, resetStudioMocks, setStudioMockKpi, studioMockDoc } from "../../../../test/msw";
import type { FlowSection, FreeformPage, TextDoc } from "../../../../lib/studio/contracts";
import { PX_PER_MM } from "../../../../lib/studio/geometry";
import { Editor } from "../Editor";
import { sheetRoot } from "../canvasUtil";
import { ChipDataProvider } from "./ChipDataProvider";
import { DataPicker } from "./DataPicker";
import { activeTextEditor, clearEditing } from "./editing";
import { setOverflowMeasurer } from "./overflow";
import { resetPrimedChips } from "./chipData";

vi.mock("../../../../context/AuthContext", () => ({ useAuth: () => ({ role: "Manager", user: {} }) }));
vi.mock("../../../../lib/clientContext", () => ({ useClientContext: () => ({ clientId: null }) }));

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
  // ProseMirror asks for layout jsdom doesn't have.
  Range.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) }) as DOMRect;
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
  document.elementFromPoint = () => null;
  (document as unknown as { execCommand: () => boolean }).execCommand = () => false;
});
beforeEach(() => {
  resetStudioMocks();
  resetPrimedChips();
  sessionStorage.clear();
});
afterEach(() => {
  clearEditing();
  setOverflowMeasurer(null);
  cleanup();
});
afterAll(() => server.close());

const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrap = () =>
  render(
    <QueryClientProvider client={client()}>
      <MemoryRouter>
        <Editor docId={1} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
const at = (zoom: number, x: number, y: number) => ({ clientX: x * PX_PER_MM * zoom, clientY: y * PX_PER_MM * zoom, button: 0 });
const zoomOf = () => Number(screen.getByTestId("zoom-value").textContent?.replace("%", "")) / 100;
const doc1 = () => studioMockDoc(1)?.doc;
const page = (id: string) => doc1()?.pages.find((p) => p.id === id) as FreeformPage;

async function openEditor() {
  wrap();
  await screen.findByTestId("studio-editor", {}, { timeout: 5000 });
  await screen.findByTestId("overlay-p-summary");
}

/** A key press inside the TipTap editor (ProseMirror listens on its own DOM). */
const keyIn = (key: string) => {
  const dom = activeTextEditor()?.view.dom as HTMLElement;
  fireEvent.keyDown(dom, { key });
};

const footnoted = (text: string, note: string): TextDoc => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text, marks: [{ type: "footnote", attrs: { note } }] }] }] });

describe("in-place text editing (DS-7)", () => {
  it("double-click mounts TipTap over the box; Delete is text-only; Esc commits one undoable step", async () => {
    await openEditor();
    const z = zoomOf();
    const overlay = screen.getByTestId("overlay-p-summary");
    fireEvent.doubleClick(overlay, at(z, 30, 25));
    await screen.findByTestId("text-edit-overlay");
    const ed = activeTextEditor();
    expect(ed).toBeTruthy();
    expect(ed?.getText()).toContain("Executive summary");
    act(() => {
      ed?.commands.focus("end");
      ed?.commands.insertContent(" 2025");
    });
    // Delete belongs to the text, not to the editor's "delete element" shortcut.
    keyIn("Delete");
    expect(page("p-summary").elements.some((e) => e.id === "p-summary.heading")).toBe(true);
    act(() => keyIn("Escape"));
    await waitFor(() => expect(screen.queryByTestId("text-edit-overlay")).toBeNull());
    expect(await screen.findByRole("button", { name: /^Undo Edit text/ })).toBeTruthy();
    // The sheet shows the committed text.
    await waitFor(() => expect(sheetRoot("p-summary")?.querySelector('[data-el-id="p-summary.heading"]')?.textContent).toContain("Executive summary 2025"));
    await userEvent.setup().click(screen.getByRole("button", { name: /^Undo Edit text/ }));
    await waitFor(() => expect(sheetRoot("p-summary")?.querySelector('[data-el-id="p-summary.heading"]')?.textContent).not.toContain("2025"));
  });

  it("{{ opens the data picker; picking Scope 1 inserts a chip showing the server's value", async () => {
    await openEditor();
    const z = zoomOf();
    fireEvent.doubleClick(screen.getByTestId("overlay-p-summary"), at(z, 30, 25));
    await screen.findByTestId("text-edit-overlay");
    const ed = activeTextEditor();
    act(() => {
      ed?.commands.focus("end");
      ed?.commands.insertContent(" {{scope");
    });
    const picker = await screen.findByRole("dialog", { name: "Insert data value" });
    const pick = await within(picker).findByTestId("pick-scope1");
    expect(within(picker).queryByText("Water withdrawal")).toBeNull();
    fireEvent.click(pick);
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Insert data value" })).toBeNull());
    const chipIn = () => activeTextEditor()?.view.dom.querySelector<HTMLElement>('[data-testid="data-chip"]') ?? null;
    await waitFor(() => expect(chipIn()).toBeTruthy());
    const chip = chipIn() as HTMLElement;
    expect(chip.textContent).toBe("1,111");
    expect(ed?.getText()).not.toContain("{{");
    // Hovering shows source, period, sites, approval and the approved entry count.
    fireEvent.mouseEnter(chip);
    const card = await screen.findByTestId("chip-card");
    expect(card.textContent).toContain("Scope 1");
    expect(card.textContent).toContain("Source: approved emission entries");
    expect(card.textContent).toContain("Linked to approved data · 12 Apr 2026");
    act(() => keyIn("Escape"));
    await waitFor(() => expect(screen.queryByTestId("text-edit-overlay")).toBeNull());
    await waitFor(() => {
      const heading = page("p-summary").elements.find((e) => e.id === "p-summary.heading");
      expect(JSON.stringify(heading?.type === "text" && heading.props.doc)).toContain('"metric":"scope1"');
    }, { timeout: 4000 });
    // The sheet resolves the new chip and prints the server's value.
    await waitFor(() => expect(sheetRoot("p-summary")?.querySelector('[data-el-id="p-summary.heading"] .ds-chip:not(.ds-chip--nr)')).toBeTruthy());
  });
});

describe("the data picker", () => {
  const renderPicker = (kind: "ghg" | "sustainability") =>
    render(
      <QueryClientProvider client={client()}>
        <ChipDataProvider scope={{ kind, year: 2025, yearType: "CY", sites: "all" }} data={null}>
          <DataPicker scope={{ kind, year: 2025, yearType: "CY", sites: "all" }} onPick={() => undefined} />
        </ChipDataProvider>
      </QueryClientProvider>,
    );

  it("lists GHG metrics for a GHG report and KPIs for a sustainability report", async () => {
    renderPicker("ghg");
    expect(await screen.findByText("Scope 1")).toBeTruthy();
    expect(screen.getByText("1 · Purchased goods and services")).toBeTruthy();
    expect(screen.queryByText("Total by site"), "a breakdown is a chart, not a chip").toBeNull();
    expect(screen.queryByText("Water withdrawal")).toBeNull();
    cleanup();
    setStudioMockKpi(true);
    renderPicker("sustainability");
    expect(await screen.findByText("Water withdrawal")).toBeTruthy();
    expect(screen.queryByText("Scope 1")).toBeNull();
  });

  it("filters by what is typed", async () => {
    const user = userEvent.setup();
    renderPicker("ghg");
    await screen.findByText("Scope 1");
    await user.type(screen.getByRole("textbox", { name: "Search emissions data" }), "intensity");
    await waitFor(() => expect(screen.queryByText("Scope 1")).toBeNull());
    expect(screen.getByText("Intensity per unit of output")).toBeTruthy();
  });
});

describe("footnotes", () => {
  it("number in reading order at the page foot and renumber after a move", async () => {
    const p = page("p-summary");
    for (const e of p.elements) {
      if (e.id === "p-summary.heading" && e.type === "text") e.props.doc = footnoted("Executive summary", "Heading note");
      if (e.id === "p-summary.body" && e.type === "text") e.props.doc = footnoted("Scope 1 fell", "DEFRA 2024 factors");
    }
    await openEditor();
    const refs = () => {
      const root = sheetRoot("p-summary");
      const n = (id: string) => root?.querySelector(`[data-el-id="${id}"] sup[data-fn]`)?.textContent;
      return { heading: n("p-summary.heading"), body: n("p-summary.body"), foot: [...(root?.querySelectorAll(".ds-footnotes .ds-fn") ?? [])].map((x) => x.textContent) };
    };
    await waitFor(() => expect(refs()).toEqual({ heading: "1", body: "2", foot: ["1 Heading note", "2 DEFRA 2024 factors"] }));
    // Drag the heading (20,20 170×15) below the body (y 40–80).
    const z = zoomOf();
    const overlay = screen.getByTestId("overlay-p-summary");
    fireEvent.pointerDown(overlay, at(z, 100, 25));
    fireEvent.pointerUp(overlay, at(z, 100, 25));
    fireEvent.pointerDown(overlay, at(z, 100, 25));
    fireEvent.pointerMove(overlay, at(z, 100, 40));
    fireEvent.pointerMove(overlay, at(z, 100, 95));
    fireEvent.pointerUp(overlay, at(z, 100, 95));
    await screen.findByRole("button", { name: /^Undo Move/ });
    await waitFor(() => expect(refs()).toEqual({ heading: "2", body: "1", foot: ["1 DEFRA 2024 factors", "2 Heading note"] }));
  });
});

describe("overflow", () => {
  it("shows +N lines on an overflowing box; Shrink text to fit clears it", async () => {
    let over: Record<string, { overflowMm: number; cutBlock: number | null }> = { "p-summary.body": { overflowMm: 9, cutBlock: null } };
    setOverflowMeasurer((pid) => (pid === "p-summary" ? over : {}));
    const user = userEvent.setup();
    await openEditor();
    const tag = await screen.findByRole("button", { name: /Text doesn't fit: \+\d+ lines/ });
    expect(tag.textContent).toMatch(/^\+[2-9] lines$/);
    await user.click(tag);
    over = {};
    await user.click(await screen.findByRole("menuitem", { name: "Shrink text to fit" }));
    await waitFor(() => expect(screen.queryByTestId("overflow-p-summary.body")).toBeNull());
    await waitFor(() => {
      const body = page("p-summary").elements.find((e) => e.id === "p-summary.body");
      expect(body?.type === "text" && body.props.style).toBe("caption");
    }, { timeout: 4000 });
    expect(screen.getByRole("button", { name: /^Undo Shrink text to fit/ })).toBeTruthy();
  });
});

describe("the Text drawer", () => {
  it("adds a heading ready to type over, and a preset as one group", async () => {
    const user = userEvent.setup();
    await openEditor();
    fireEvent.pointerDown(screen.getByTestId("overlay-p-summary"), at(zoomOf(), 5, 5));
    fireEvent.pointerUp(screen.getByTestId("overlay-p-summary"), at(zoomOf(), 5, 5));
    await user.click(screen.getByRole("tab", { name: "Text" }));
    const panel = await screen.findByTestId("text-panel");
    const before = page("p-summary").elements.length;
    await user.click(within(panel).getByRole("button", { name: "Add a heading" }));
    await screen.findByTestId("text-edit-overlay");
    expect(activeTextEditor()?.getText()).toBe("Add a heading");
    act(() => keyIn("Escape"));
    await waitFor(() => expect(screen.queryByTestId("text-edit-overlay")).toBeNull());
    await waitFor(() => expect(page("p-summary").elements.length).toBe(before + 1), { timeout: 4000 });
    await user.click(within(panel).getByRole("button", { name: "Add kicker and title" }));
    await screen.findByRole("button", { name: /^Undo Add kicker and title/ });
    await waitFor(() => expect(page("p-summary").elements.length).toBe(before + 3), { timeout: 4000 });
    const added = page("p-summary").elements.slice(before + 1);
    expect(added.map((e) => e.type === "text" && e.props.style)).toEqual(["kicker", "title"]);
    expect(new Set(added.map((e) => e.groupId)).size).toBe(1);
  });
});

describe("flow sections", () => {
  it("a flow page opens its settings: categories and show DQ are saved on the section", async () => {
    const user = userEvent.setup();
    await openEditor();
    const slot = document.querySelector('[data-sheet-host="p-categories"]') as HTMLElement;
    fireEvent.pointerDown(slot);
    const panel = await screen.findByTestId("flow-panel");
    expect(within(panel).getByText("Scope 3 categories")).toBeTruthy();
    await user.click(within(panel).getByRole("checkbox", { name: /Category 1 · Purchased goods and services/ }));
    await user.click(within(panel).getByRole("switch", { name: "Show data quality" }));
    await waitFor(() => {
      const s = doc1()?.pages.find((p) => p.id === "p-categories") as FlowSection;
      expect(s.options.categories).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
      expect(s.options.showDq).toBe(false);
    }, { timeout: 4000 });
  });
});
