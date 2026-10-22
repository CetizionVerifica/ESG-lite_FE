// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { PanelResponse, SiteCompare as SiteCompareData } from "../../../lib/insights/contracts";
import { siteCompareData } from "../../../test/msw/insightsData";
import { PanelViewContext, type PanelView } from "../components/panelView";
import { SiteCompare } from "./SiteCompare";

const chart = vi.hoisted(() => ({ last: null as { option: { series: unknown[] } } | null }));
vi.mock("echarts-for-react", () => ({
  default: (props: { option: { series: unknown[] } }) => {
    chart.last = props;
    return <div data-testid="echart" />;
  },
}));
vi.mock("../../../theme", async () => {
  const { testTheme } = await import("./testTheme");
  return { useChartTheme: () => testTheme };
});

afterEach(() => {
  cleanup();
  chart.last = null;
});

const response = (data: SiteCompareData): PanelResponse<SiteCompareData> & { data: SiteCompareData } => ({
  panel: "site_compare",
  availability: "ok",
  period: { year: 2026, yearType: "CY" },
  sites: "all",
  label: "CY 2026 · All sites",
  data,
  pending_not_in: { emissions: 0, kpi_values: 0, link: null },
  stamp: "t",
  links: {},
});

function renderSites(view: PanelView = "chart") {
  render(
    <MemoryRouter>
      <PanelViewContext.Provider value={{ view, setView: () => undefined }}>
        <SiteCompare response={response(siteCompareData)} query={{ year: 2026, yearType: "CY", sites: "all", pillar: null, compare: "base", panel: null } as never} />
      </PanelViewContext.Provider>
    </MemoryRouter>,
  );
}

describe("SiteCompare (IN-11)", () => {
  it("draws one stacked bar series per scope and a card per site, with the server's links", () => {
    renderSites();
    expect(chart.last!.option.series).toHaveLength(3);
    const rows = screen.getAllByTestId("site-compare-row");
    expect(rows).toHaveLength(3);
    expect(within(rows[0]).getByRole("link", { name: "Chennai plant" }).getAttribute("href")).toBe("/overview?period=CY2026&siteIds=11");
    // The change is always on last year (the Overview's), even when the page compares with the base year.
    expect(within(rows[0]).getByTestId("change-chip").textContent).toBe("down 15% on 2025");
    expect(within(rows[0]).getByTestId("change-chip").dataset.tone).toBe("good");
  });

  it("says what's missing in words: no production, no last year, entries waiting", () => {
    renderSites();
    const [, nagpur, pune] = screen.getAllByTestId("site-compare-row");
    expect(within(nagpur).getByRole("link", { name: "Add production data" }).getAttribute("href")).toBe("/production");
    expect(within(nagpur).getByText("no last year yet")).toBeTruthy();
    expect(within(nagpur).queryByTestId("site-compare-pending")).toBeNull();
    expect(within(pune).getByTestId("site-compare-pending").textContent).toBe("7 pending");
    expect(within(pune).getByTestId("change-chip").dataset.tone).toBe("bad");
  });

  it("table view links each site name to its Overview", () => {
    renderSites("table");
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("row")).toHaveLength(4);
    expect(within(table).getByRole("link", { name: "Pune plant" }).getAttribute("href")).toBe("/overview?period=CY2026&siteIds=13");
  });
});
