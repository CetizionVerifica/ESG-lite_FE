// @vitest-environment jsdom
// DS-8 · charts and tables in the editor against the MSW studio mocks:
// the Charts drawer adds Scope 3 category bars bound to their default; the
// toolbar switches the kind (valid kinds only), changes top n and greys prior
// years; Edit data focuses the Data drawer on the binding; a figure dropped
// on a chart replaces its binding and on empty page asks Big number · Tile ·
// Chart; the custom-data grid takes a pasted table, refuses metric names, and
// the sheet shows the Unlinked data badge; the table toolbar edits a static table.
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { setupServer } from "msw/node";
import {
  handlers,
  resetStudioMocks,
  studioMockDoc,
} from "../../../../test/msw";
import type {
  Element,
  FreeformPage,
  GhgBinding,
} from "../../../../lib/studio/contracts";
import { PX_PER_MM } from "../../../../lib/studio/geometry";
import { Editor } from "../Editor";
import { DND_DATA } from "../dnd";
import { resetChartsUi } from "./store";

vi.mock("../../../../context/AuthContext", () => ({
  useAuth: () => ({ role: "Manager", user: {} }),
}));
vi.mock("../../../../lib/clientContext", () => ({
  useClientContext: () => ({ clientId: null }),
}));

const server = setupServer(...handlers);
vi.setConfig({ testTimeout: 20000 });

class PointerEventShim extends MouseEvent {
  pointerId: number;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
  }
}

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
  (
    window as unknown as { PointerEvent: typeof PointerEventShim }
  ).PointerEvent = PointerEventShim;
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 1600,
  });
});
beforeEach(() => {
  resetStudioMocks();
  resetChartsUi();
  sessionStorage.clear();
});
afterEach(() => cleanup());
afterAll(() => server.close());

const wrap = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <Editor docId={1} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
};
const at = (zoom: number, x: number, y: number) => ({
  clientX: x * PX_PER_MM * zoom,
  clientY: y * PX_PER_MM * zoom,
  button: 0,
});
const zoomOf = () =>
  Number(screen.getByTestId("zoom-value").textContent?.replace("%", "")) / 100;
const toolbar = () => screen.getByTestId("context-toolbar");

async function openEditor() {
  wrap();
  await screen.findByTestId("studio-editor", {}, { timeout: 5000 });
  await screen.findByTestId("overlay-p-scope3");
}
const clickAt = (pageId: string, x: number, y: number) => {
  const z = zoomOf();
  const overlay = screen.getByTestId(`overlay-${pageId}`);
  fireEvent.pointerDown(overlay, at(z, x, y));
  fireEvent.pointerUp(overlay, at(z, x, y));
};
/** The element as autosaved (the mock's stored doc), after the 1 s idle. */
async function saved(pageId: string, id: string): Promise<Element> {
  let el: Element | undefined;
  await waitFor(
    () => {
      const page = studioMockDoc(1)?.doc.pages.find((p) => p.id === pageId) as
        FreeformPage | undefined;
      el = page?.elements.find((e) => e.id === id);
      expect(el).toBeTruthy();
    },
    { timeout: 4000 },
  );
  return el as Element;
}

describe("Charts and tables (DS-8)", () => {
  it("adds Scope 3 category bars from the Charts drawer, switches to a treemap, changes top n", async () => {
    const user = userEvent.setup();
    await openEditor();
    await user.click(screen.getByRole("tab", { name: "Charts" }));
    const panel = await screen.findByTestId("charts-panel");
    const tile = within(panel).getByTestId("chart-kind-category_bars");
    await waitFor(() => expect(tile.hasAttribute("disabled")).toBe(false));
    // Gases aren't tracked in the mock catalog? Every default resolves in the mock: all enabled.
    expect(
      within(panel).getByTestId("chart-kind-treemap").hasAttribute("disabled"),
    ).toBe(false);
    await user.click(tile);
    await waitFor(() => expect(toolbar().dataset.toolbar).toBe("chart"));
    expect(within(toolbar()).getByTestId("chart-kind").textContent).toContain(
      "Scope 3 categories",
    );
    expect(within(toolbar()).getByTestId("chart-top").textContent).toContain(
      "Top 8",
    );
    // The kind menu lists only kinds that can draw Scope 3 by category.
    await user.click(within(toolbar()).getByTestId("chart-kind"));
    const menu = await screen.findByRole("menu", { name: "Chart kind" });
    const names = within(menu)
      .getAllByRole("menuitemradio")
      .map((m) => m.textContent?.trim());
    expect(names).toContain("Treemap");
    expect(names).not.toContain("Scope split");
    await user.click(
      within(menu).getByRole("menuitemradio", { name: /Treemap/ }),
    );
    expect(within(toolbar()).getByTestId("chart-kind").textContent).toContain(
      "Treemap",
    );
    await user.click(within(toolbar()).getByTestId("chart-top"));
    await user.click(
      await screen.findByRole("menuitemradio", { name: "Top 5" }),
    );
    expect(within(toolbar()).getByTestId("chart-top").textContent).toContain(
      "Top 5",
    );
    // One year: nothing to grey.
    expect(
      within(toolbar())
        .getByTestId("chart-grey-prior")
        .hasAttribute("disabled"),
    ).toBe(true);
    const page = studioMockDoc(1)?.doc.pages[0];
    await waitFor(
      () => {
        const els = (
          studioMockDoc(1)?.doc.pages.find(
            (p) => p.id === page?.id,
          ) as FreeformPage
        ).elements;
        const c = els.find((e) => e.type === "chart");
        expect(c).toMatchObject({
          props: {
            kind: "treemap",
            binding: {
              source: "ghg",
              metric: "scope3",
              breakdown: "scope3_category",
              top: 5,
            },
          },
        });
      },
      { timeout: 4000 },
    );
  });

  it("Edit data focuses the Data drawer on the chart; more years let prior years go grey", async () => {
    const user = userEvent.setup();
    await openEditor();
    clickAt("p-scope3", 100, 60);
    expect(toolbar().dataset.toolbar).toBe("chart");
    await user.click(within(toolbar()).getByTestId("chart-edit-data"));
    const editor = await screen.findByTestId("binding-editor");
    expect(within(editor).getByTestId("binding-summary").textContent).toBe(
      "Scope 3 · by scope 3 category · this year · top 10",
    );
    await user.selectOptions(
      within(editor).getByRole("combobox", { name: "Years" }),
      "3",
    );
    await waitFor(() =>
      expect(
        within(screen.getByTestId("binding-editor")).getByTestId(
          "binding-summary",
        ).textContent,
      ).toContain("last 3 years"),
    );
    const grey = within(toolbar()).getByTestId("chart-grey-prior");
    expect(grey.hasAttribute("disabled")).toBe(false);
    expect(grey.getAttribute("aria-pressed")).toBe("true");
    await user.click(grey);
    await waitFor(
      async () =>
        expect(
          (
            (await saved("p-scope3", "p-scope3.bars")).props as {
              options: { greyPrior?: boolean };
            }
          ).options.greyPrior,
        ).toBe(false),
      { timeout: 4000 },
    );
    const el = await saved("p-scope3", "p-scope3.bars");
    expect(
      ((el.props as { binding: GhgBinding }).binding.years as { last: number })
        .last,
    ).toBe(3);
  });

  it("a figure dropped on a chart replaces its binding; on empty page it asks Big number · Tile · Chart", async () => {
    await openEditor();
    const z = zoomOf();
    const overlay = screen.getByTestId("overlay-p-scope3");
    const dt = (data: object) => {
      const store: Record<string, string> = {
        [DND_DATA]: JSON.stringify(data),
      };
      return {
        types: [DND_DATA],
        getData: (k: string) => store[k] ?? "",
        setData: () => undefined,
        dropEffect: "copy",
        effectAllowed: "copy",
      };
    };
    // jsdom has no DragEvent: a MouseEvent carries the point, the payload rides on dataTransfer.
    const fire = (
      type: "dragover" | "drop",
      x: number,
      y: number,
      data: object,
    ) => {
      const ev = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        ...at(z, x, y),
      });
      Object.defineProperty(ev, "dataTransfer", { value: dt(data) });
      act(() => {
        overlay.dispatchEvent(ev);
      });
    };
    const byScope = {
      binding: {
        source: "ghg",
        metric: "total",
        breakdown: "scope",
        years: { last: 1 },
        sites: "all",
      },
      label: "Total by scope",
    };
    fire("dragover", 100, 60, byScope);
    fire("drop", 100, 60, byScope);
    await waitFor(
      async () =>
        expect((await saved("p-scope3", "p-scope3.bars")).props).toMatchObject({
          kind: "scope_split",
          binding: { metric: "total", breakdown: "scope" },
        }),
      { timeout: 4000 },
    );
    // Empty page: the choice, then a tile at the drop point.
    fire("drop", 150, 290, {
      binding: {
        source: "ghg",
        metric: "scope1",
        years: { last: 1 },
        sites: "all",
      },
      label: "Scope 1",
    });
    const choice = await screen.findByTestId("figure-choice");
    fireEvent.click(within(choice).getByRole("button", { name: "Tile" }));
    expect(screen.queryByTestId("figure-choice")).toBeNull();
    await waitFor(
      () => {
        const els = (
          studioMockDoc(1)?.doc.pages.find(
            (p) => p.id === "p-scope3",
          ) as FreeformPage
        ).elements;
        expect(
          els.find(
            (e) =>
              e.type === "kpi_tile" &&
              (e.props as { label?: string }).label === "Scope 1",
          ),
        ).toBeTruthy();
      },
      { timeout: 4000 },
    );
  });

  it("the custom-data grid takes a pasted table, refuses metric names, and the chart shows Unlinked data", async () => {
    const user = userEvent.setup();
    await openEditor();
    clickAt("p-scope3", 50, 190);
    expect(toolbar().dataset.toolbar).toBe("chart");
    await user.click(
      within(toolbar()).getByRole("button", { name: "Edit data" }),
    );
    const grid = await screen.findByTestId("custom-grid");
    const first = within(grid).getByLabelText("Column 1 heading");
    fireEvent.focus(first);
    act(() => {
      fireEvent.paste(first, {
        clipboardData: {
          getData: () =>
            "Initiative\tScope 1\nLED retrofit\t1,200\nSolar PPA\t860\n",
        },
      });
    });
    expect(
      await within(screen.getByTestId("custom-grid")).findByText(
        /typed data can't use GHG or KPI names/,
      ),
    ).toBeTruthy();
    const apply = screen.getByRole("button", { name: "Apply" });
    expect(apply.hasAttribute("disabled")).toBe(true);
    const heading = within(screen.getByTestId("custom-grid")).getByLabelText(
      "Column 2 heading",
    );
    await user.clear(heading);
    await user.type(heading, "Saved");
    expect(
      screen.getByRole("button", { name: "Apply" }).hasAttribute("disabled"),
    ).toBe(false);
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(
      async () =>
        expect(
          (await saved("p-scope3", "p-scope3.custom")).props,
        ).toMatchObject({
          binding: {
            source: "custom",
            columns: ["Initiative", "Saved"],
            rows: [
              ["LED retrofit", 1200],
              ["Solar PPA", 860],
            ],
          },
        }),
      { timeout: 4000 },
    );
    // The sheet (shadow root) carries the badge; the link mark says Unlinked.
    const host = document.querySelector(
      '[data-sheet-host="p-scope3"]',
    ) as HTMLElement;
    await waitFor(() =>
      expect(
        host.shadowRoot?.querySelector(
          '[data-el-id="p-scope3.custom"] .ds-unlinked',
        )?.textContent,
      ).toBe("Unlinked data"),
    );
    expect(within(toolbar()).getByTestId("toolbar-link").textContent).toContain(
      "Unlinked",
    );
  });

  it("the table toolbar: columns of a bound table, a blank table edited and merged", async () => {
    const user = userEvent.setup();
    await openEditor();
    clickAt("p-scope3", 100, 250);
    expect(toolbar().dataset.toolbar).toBe("table");
    expect(
      within(toolbar()).getByRole("button", { name: "Edit data" }),
    ).toBeTruthy();
    await user.click(
      within(toolbar()).getByRole("button", { name: /Columns/ }),
    );
    const menu = await screen.findByRole("menu", { name: "Columns" });
    await user.click(
      within(menu).getByRole("menuitemradio", { name: "Head office" }),
    );
    await waitFor(
      async () =>
        expect((await saved("p-scope3", "p-scope3.table")).props).toMatchObject(
          { columns: ["Bahrain plant", "Sitra warehouse"] },
        ),
      { timeout: 4000 },
    );
    // A blank table from the Charts drawer, then the editor: type, merge.
    await user.click(screen.getByRole("tab", { name: "Charts" }));
    await user.click(
      await screen.findByRole("button", { name: "Blank table" }),
    );
    await waitFor(() => expect(toolbar().dataset.toolbar).toBe("table"));
    await user.click(within(toolbar()).getByRole("button", { name: "Edit" }));
    const ed = await screen.findByTestId("table-editor");
    await user.type(within(ed).getByLabelText("Row 1, column 1"), "Manama");
    fireEvent.mouseDown(within(ed).getByLabelText("Row 1, column 2"));
    fireEvent.mouseDown(within(ed).getByLabelText("Row 1, column 3"), {
      shiftKey: true,
    });
    await user.click(within(ed).getByRole("button", { name: "Merge cells" }));
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(
      () => {
        const els = (studioMockDoc(1)?.doc.pages ?? []).flatMap((p) =>
          p.kind === "freeform" ? p.elements : [],
        );
        expect(
          els.find(
            (e) =>
              e.type === "table" && !(e.props as { binding?: object }).binding,
          ),
        ).toMatchObject({
          props: {
            rows: [
              ["Manama", "", ""],
              ["", "", ""],
              ["", "", ""],
            ],
            merges: [{ r: 0, c: 1, rs: 1, cs: 2 }],
          },
        });
      },
      { timeout: 4000 },
    );
  });
});
