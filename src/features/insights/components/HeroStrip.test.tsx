// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import type { InsightsQuery, PanelResponse, Summary } from "../../../lib/insights/contracts";
import { summaryData } from "../../../test/msw/insightsData";
import { HeroStrip } from "./HeroStrip";

afterEach(cleanup);

const query: InsightsQuery = { year: 2026, yearType: "CY", sites: "all", pillar: null, compare: "prior" };
const envelope = (data: Summary): PanelResponse<Summary> & { data: Summary } => ({
  panel: "summary",
  availability: "ok",
  period: { year: 2026, yearType: "CY" },
  sites: "all",
  label: "CY 2026 · All sites",
  data,
  pending_not_in: { emissions: 12, kpi_values: 3, link: "/data/approvals" },
  stamp: "t",
  links: { net: "/data/ledger?status=approved", intensity: "/data/production", readiness: "/kpi/esg", attention: "/data/approvals" },
});

function renderHero(data: Summary) {
  const router = createMemoryRouter([{ path: "*", element: <HeroStrip response={envelope(data)} query={query} /> }], { initialEntries: ["/insights"] });
  render(<RouterProvider router={router} />);
  return router;
}

describe("HeroStrip (IN-1)", () => {
  it("shows the server's figures with words, not colour alone", () => {
    renderHero(summaryData(true));
    const net = screen.getByTestId("hero-net");
    expect(within(net).getByTestId("hero-net-value").textContent).toBe("41,280.400");
    expect(within(net).getByTestId("change-chip").textContent).toBe("down 8.1% on 2025");
    expect(within(net).getByTestId("change-chip").dataset.tone).toBe("good");
    expect(within(net).getByTestId("status-chip").textContent).toBe("At risk");
    expect(net.textContent).toContain("3.4% above the 2030 pathway");
    expect(within(net).getByRole("link").getAttribute("href")).toBe("/data/ledger?status=approved");
    expect(screen.getByTestId("hero-intensity-value").textContent).toBe("0.612");
    expect(screen.getByTestId("hero-intensity").textContent).toContain("tCO₂e per t");
    expect(screen.getByTestId("hero-readiness-value").textContent).toBe("69%");
    expect(screen.getAllByTestId("pillar-letter")).toHaveLength(3);
  });

  it("without KPI tracking shows renewable share instead of readiness, and no target as 'No target'", () => {
    renderHero({ ...summaryData(false), pathway: null });
    expect(screen.queryByTestId("hero-readiness")).toBeNull();
    expect(screen.getByTestId("hero-renewables").textContent).toContain("47%");
    expect(screen.getByTestId("status-chip").textContent).toBe("No target");
  });

  it("'Needs you' opens a menu of what's waiting, each a link", async () => {
    const router = renderHero(summaryData(true));
    await userEvent.click(screen.getByTestId("hero-attention-trigger"));
    const menu = screen.getByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((i) => i.textContent)).toEqual(["Waiting for approval · 12", "KPI values missing · 4", "Targets off track · 3"]);
    await userEvent.click(within(menu).getByRole("menuitem", { name: /KPI values missing/ }));
    expect(router.state.location.pathname).toBe("/kpi/dashboard");
  });

  it("with nothing waiting says so", () => {
    renderHero({ ...summaryData(true), attention: { total: 0, items: [] } });
    expect(screen.getByTestId("hero-attention").textContent).toContain("Nothing waiting for you.");
  });
});
