// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterProvider, createMemoryRouter } from "react-router-dom";
import type { Cards, InsightCard, InsightsQuery, PanelResponse } from "../../../lib/insights/contracts";
import { cardsData } from "../../../test/msw/insightsData";
import { InsightCards } from "./InsightCards";
import { shownCards } from "./cardSentence";

afterEach(cleanup);

const query: InsightsQuery = { year: 2026, yearType: "CY", sites: "all", pillar: null, compare: "prior" };
const envelope = (data: Cards): PanelResponse<Cards> & { data: Cards } => ({
  panel: "cards",
  availability: "ok",
  period: { year: 2026, yearType: "CY" },
  sites: "all",
  label: "CY 2026 · All sites",
  data,
  pending_not_in: { emissions: 0, kpi_values: 0, link: null },
  stamp: "t",
  links: {},
});

function renderCards(data: Cards, url = "/insights") {
  const router = createMemoryRouter([{ path: "*", element: <InsightCards response={envelope(data)} query={query} /> }], { initialEntries: [url] });
  render(<RouterProvider router={router} />);
  return router;
}

const cardFor = (rule: string) => screen.getAllByTestId("insight-card").find((c) => c.dataset.rule === rule)!;

describe("InsightCards (IN-3)", () => {
  it("renders the server's cards in order: severity chip (icon + word) and a heading-level sentence", () => {
    renderCards(cardsData(true));
    const cards = screen.getAllByRole("article");
    expect(cards).toHaveLength(6);
    expect(cards.map((c) => c.dataset.rule)).toEqual(["pathway_gap", "target_off_track", "pending_large", "decoupling", "renewables_jump", "largest_source"]);
    const gap = cardFor("pathway_gap");
    expect(within(gap).getByTestId("severity-chip").textContent).toBe("Critical");
    expect(within(gap).getByTestId("severity-chip").querySelector("svg")).toBeTruthy();
    expect(within(gap).getByRole("heading", { level: 3 }).textContent).toBe("Emissions are 3.4% above the 2030 pathway.");
    expect(screen.getByRole("article", { name: "Emissions are 3.4% above the 2030 pathway." })).toBe(gap);
    expect(within(cardFor("pending_large")).getByTestId("severity-chip").textContent).toBe("Needs attention");
    expect(within(cardFor("decoupling")).getByTestId("severity-chip").textContent).toBe("Good news");
    expect(within(cardFor("largest_source")).getByTestId("severity-chip").textContent).toBe("Worth knowing");
  });

  it("Show sets ?panel= to the card's panel; a card without a panel has no Show", async () => {
    const router = renderCards(cardsData(true), "/insights?year=2025");
    await userEvent.click(within(cardFor("decoupling")).getByRole("button", { name: "Show" }));
    expect(router.state.location.search).toBe("?year=2025&panel=decoupling");
    await userEvent.click(within(cardFor("target_off_track")).getByRole("button", { name: "Show" }));
    expect(router.state.location.search).toBe("?year=2025&panel=target_wall");
    expect(within(cardFor("pending_large")).queryByRole("button", { name: "Show" })).toBeNull();
  });

  it("Show on the panel that's already the target scrolls to it again", async () => {
    const target = document.createElement("section");
    target.dataset.testid = "panel-pathway";
    target.scrollIntoView = vi.fn();
    document.body.appendChild(target);
    renderCards(cardsData(true), "/insights?panel=pathway");
    await userEvent.click(within(cardFor("pathway_gap")).getByRole("button", { name: "Show" }));
    expect(target.scrollIntoView).toHaveBeenCalled();
    target.remove();
  });

  it("Open follows the server's link; a card without a link has no Open", async () => {
    const router = renderCards(cardsData(true));
    expect(within(cardFor("decoupling")).queryByRole("link", { name: /Open/ })).toBeNull();
    const open = within(cardFor("pathway_gap")).getByRole("link", { name: /Open/ });
    expect(open.getAttribute("href")).toBe("/targets");
    await userEvent.click(open);
    expect(router.state.location.pathname).toBe("/targets");
  });

  it("with no cards says so", () => {
    renderCards({ cards: [] });
    expect(screen.getByText("No standout changes this period.")).toBeTruthy();
    expect(screen.queryByRole("article")).toBeNull();
  });

  it("leaves out cards it can't word, and shows at most six", () => {
    const base = cardsData(true).cards;
    const unknown = { ...base[0], id: "x", rule: "made_up" } as unknown as InsightCard;
    const extra: InsightCard = { id: "extra", rule: "pathway_on_track", severity: "good", source: "rule", params: { margin_pct: 2 }, link: null, panel: "pathway" };
    expect(shownCards([unknown, ...base, extra]).map((c) => c.id)).toEqual(base.map((c) => c.id));
    renderCards({ cards: [unknown] });
    expect(screen.getByText("No standout changes this period.")).toBeTruthy();
  });
});
