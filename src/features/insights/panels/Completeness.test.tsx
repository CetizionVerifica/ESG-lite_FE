// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { Completeness as CompletenessData, InsightsQuery, PanelResponse } from "../../../lib/insights/contracts";
import { completenessData } from "../../../test/msw/insightsData";
import { PanelViewContext } from "../components/panelView";
import { Completeness } from "./Completeness";

type Handlers = Record<string, (p: unknown) => void>;
const captured = vi.hoisted(() => ({ option: null as null | { series: { data: unknown[] }[] }, onEvents: null as null | Record<string, (p: unknown) => void> }));
vi.mock("echarts-for-react", () => ({
  default: (props: { option: { series: { data: unknown[] }[] }; onEvents?: Handlers }) => {
    captured.option = props.option;
    captured.onEvents = props.onEvents ?? null;
    return <div data-testid="echart" />;
  },
}));
vi.mock("../../../theme", async (orig) => {
  const actual = await orig<typeof import("../../../theme")>();
  const theme = actual.chartTheme(actual.buildTheme(actual.PLANETPULSE, "light", "light"));
  return { ...actual, useChartTheme: () => theme };
});

const query: InsightsQuery = { year: 2026, yearType: "CY", sites: "all", pillar: null, compare: "prior" };
const envelope = (data: CompletenessData): PanelResponse<CompletenessData> & { data: CompletenessData } => ({
  panel: "completeness",
  availability: "ok",
  period: { year: 2026, yearType: "CY" },
  sites: "all",
  label: "CY 2026 · All sites",
  data,
  pending_not_in: { emissions: 0, kpi_values: 0, link: null },
  stamp: "t",
  links: {},
});

const matchMedia = (matches: boolean) => vi.fn(() => ({ matches, media: "", onchange: null, addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn() }));

function renderPanel(view: "chart" | "table" = "chart", data = completenessData) {
  const setView = vi.fn();
  render(
    <MemoryRouter>
      <PanelViewContext.Provider value={{ view, setView }}>
        <Completeness response={envelope(data)} query={query} />
      </PanelViewContext.Provider>
    </MemoryRouter>,
  );
  return { setView };
}

beforeEach(() => {
  captured.option = null;
  captured.onEvents = null;
  vi.stubGlobal("matchMedia", matchMedia(false));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Completeness panel (IN-4)", () => {
  it("draws a heatmap of the due cells with a ramp legend and a one-sentence label", () => {
    renderPanel();
    expect(captured.option!.series[0].data).toHaveLength(27);
    expect(screen.getByRole("img").getAttribute("aria-label")).toBe("Data completeness for 3 sites by month, Jan 2026 to Dec 2026: 11 site-months are not complete yet.");
    expect(screen.getByRole("list", { name: "Colour scale" }).textContent).toBe("Below 50%50–74%75–89%90–99%100%Not due yet");
  });

  it("a cell click opens the drawer with the server's counts and the entries link", async () => {
    renderPanel();
    act(() => captured.onEvents!.click({ data: { row: 1, col: 8 } }));
    const dialog = screen.getByRole("dialog", { name: `${completenessData.rows[1].site} · Sep 2026` });
    expect(dialog.textContent).toContain("52% of the expected data is approved");
    expect(within(dialog).getByTestId("completeness-drawer").textContent).toContain("13 of 25 approved");
    expect(dialog.textContent).toContain("No KPI values due this month.");
    expect(within(dialog).getByTestId("completeness-link").getAttribute("href")).toBe(completenessData.rows[1].cells[8].link);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows KPI counts when KPI values are expected", () => {
    const withKpi: CompletenessData = { ...completenessData, rows: completenessData.rows.map((r) => ({ ...r, cells: r.cells.map((c) => ({ ...c, kpi_expected: 4, kpi_approved: 1 })) })) };
    renderPanel("chart", withKpi);
    act(() => captured.onEvents!.click({ data: { row: 0, col: 0 } }));
    expect(screen.getByRole("dialog").textContent).toContain("1 of 4 approved");
  });

  it("the table view lists site, month, %, counts, and opens the same drawer from the keyboard", async () => {
    renderPanel("table");
    const table = screen.getByRole("table");
    const row = within(table).getAllByRole("row")[9]; // header + 8 → Sep for the first site
    expect([...row.querySelectorAll("td")].slice(0, 5).map((td) => td.textContent)).toEqual([completenessData.rows[0].site, "Sep 2026", "70%", "18 of 25", "—"]);
    const details = within(row).getByRole("button", { name: `Details for ${completenessData.rows[0].site}, Sep 2026` });
    details.focus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("dialog", { name: `${completenessData.rows[0].site} · Sep 2026` })).toBeTruthy();
  });

  it("future months read 'Not due' in the table", () => {
    renderPanel("table");
    const row = within(screen.getByRole("table")).getAllByRole("row")[10];
    expect(row.textContent).toContain("Oct 2026");
    expect(row.textContent).toContain("Not due");
  });

  it("opens on the table at phone widths", () => {
    vi.stubGlobal("matchMedia", matchMedia(true));
    const { setView } = renderPanel();
    expect(setView).toHaveBeenCalledWith("table");
  });
});
