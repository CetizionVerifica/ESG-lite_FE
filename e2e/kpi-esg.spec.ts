import { type Page, expect, test } from "@playwright/test";
import { getResponse } from "msw";
import { kpiHandlers } from "../src/test/msw/kpi";
import { MIA, OMAR, SAM, kpiApp } from "./kpiMockApi";

/**
 * Wave E · The ESG dashboard (`/kpi/esg`, plans/kpi/wave-e.md): a card per
 * pillar that filters the page, coverage by topic with a drawer, headline
 * trends, sites × pillars, the biggest changes and the pending banner; the
 * pillar grouping in KPI setup; nav, palette, Superadmin, switch off, 390 px.
 */

const open = (page: Page, query = "") => page.goto(`/kpi/esg${query}`);
const card = (page: Page, pillar: string) => page.locator(`[data-testid="esg-pillar-card"][data-pillar="${pillar}"]`);
const esgCalls = (page: Page) => {
  const urls: URL[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname.endsWith("/kpi/esg")) urls.push(u);
  });
  return urls;
};

test("pillar cards show coverage, what's left and the change on last year; a card filters the page and a second click clears it", async ({ page }) => {
  await kpiApp(page, { role: "Manager", user: MIA });
  await open(page);
  await expect(page.getByRole("heading", { name: "ESG dashboard", level: 1 })).toBeVisible();
  await expect(page.getByText("6 values pending review aren't in these figures.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Review them" })).toHaveAttribute("href", "/data/approvals?view=kpi");

  await expect(card(page, "environment")).toContainText("71%");
  await expect(card(page, "environment").getByTestId("esg-pillar-approved")).toHaveText("12 of 17 KPIs approved");
  await expect(card(page, "environment")).toContainText("2 missing · 3 pending · 1 not due yet");
  await expect(card(page, "social")).toContainText("−5 pp on last year · Worse");
  await expect(card(page, "governance")).toContainText("+50 pp on last year · Better");
  // The letter is the second encoding: never colour alone.
  await expect(card(page, "social").getByTestId("pillar-badge")).toContainText("S");
  await expect(page.getByTestId("esg-trend-group")).toHaveCount(3);

  await card(page, "social").click();
  await expect(page).toHaveURL(/pillar=social/);
  await expect(card(page, "social")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("esg-filter-note")).toContainText("Showing Social only");
  await expect(page.getByTestId("esg-trend-group")).toHaveCount(1);
  await expect(page.getByTestId("esg-trend")).toHaveCount(4);
  await expect(page.getByTestId("esg-topic-group")).toHaveCount(1);
  await expect(page.getByTestId("esg-mover").filter({ hasText: "Energy consumed" })).toHaveCount(0);
  // The pillar chips follow.
  await expect(page.getByTestId("esg-pillar-chips").getByRole("button", { name: "Social" })).toHaveAttribute("aria-pressed", "true");

  await card(page, "social").click();
  await expect(page).not.toHaveURL(/pillar=/);
  await expect(page.getByTestId("esg-trend-group")).toHaveCount(3);
});

test("headline trends: a line per KPI with good or bad in words, a target line with a legend, and a table view", async ({ page }) => {
  await kpiApp(page, { role: "Manager", user: MIA });
  await open(page);
  // The composite headline comes with Scope 1's id; it's told apart by its code.
  const scope1 = page.locator('[data-testid="esg-trend"][data-kpi="GHG_SCOPE1_2"]');
  await expect(scope1).toContainText("GHG emissions, Scope 1 and 2");
  // #209: tCO₂e with 3 decimals. The mock's months add up to 2,341 + 2,290 + 2,265 + 2,230 + 2,190 + 2,350 + 2,402 + 2,318 + 2,315.6 = 20,701.6.
  await expect(scope1.getByTestId("esg-trend-value")).toHaveText("20,701.600 tCO₂e");
  await expect(scope1.getByTestId("change-chip")).toContainText("−28.5 % vs 2025 · Better");
  const ltifr = page.locator('[data-testid="esg-trend"][data-kpi="LTIFR"]');
  await expect(ltifr).toContainText("Target: Below 0.35 by 2027");
  await expect(ltifr.getByRole("list", { name: "Legend" })).toContainText("Target 0.35");
  await ltifr.getByRole("radio", { name: "Table" }).click();
  await expect(ltifr.getByRole("table")).toContainText("Jan 2026");
  await expect(ltifr.getByRole("columnheader", { name: "Target" })).toBeVisible();
  // The table view of a tCO₂e line has 3 decimals too (January: 2,341).
  await scope1.getByRole("radio", { name: "Table" }).click();
  await expect(scope1.getByRole("row", { name: /Jan 2026/ })).toContainText("2,341.000");
  await scope1.getByRole("radio", { name: "Chart" }).click();

  // Hovering the chart shows the month's value.
  const box = await scope1.locator("canvas").first().boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width * 0.1, box.y + box.height / 2);
    await expect(page.getByText(/Jan 2026|Feb 2026/).first()).toBeVisible();
  }
  const movers = page.getByTestId("esg-mover");
  await expect(movers).toHaveCount(5);
  await expect(movers.first()).toContainText("Complaints received");
  // Employees has no good direction: never shown as worse.
  await expect(movers.filter({ hasText: "Employees" })).toHaveCount(0);
  await expect(movers.first()).toContainText("Better");
  await expect(movers.first().getByTestId("pillar-badge")).toContainText("G");
});

test("a topic bar opens the topic drawer with its KPIs, and links pending to review and missing to the gaps list", async ({ page }) => {
  await kpiApp(page, { role: "Manager", user: MIA });
  await open(page);
  const water = page.locator('[data-testid="esg-topic-bar"][data-topic="water"]');
  await expect(water).toHaveAccessibleName(/Water · 1 of 3 approved · 1 missing · 1 pending/);
  await water.hover();
  await expect(page.getByRole("tooltip")).toHaveText("Water · 1 of 3 approved · 1 missing · 1 pending");
  await water.click();
  await expect(page).toHaveURL(/topic=water/);
  const drawer = page.getByRole("dialog", { name: "Water" });
  await expect(drawer.getByTestId("esg-drawer-summary")).toContainText("1 of 3 approved · 1 missing · 1 pending");
  const rows = drawer.getByTestId("esg-drawer-kpi");
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText("Water discharged");
  await expect(rows.first()).toContainText("Missing");
  await expect(rows.first().getByRole("link", { name: "See what's missing and who owes it" })).toHaveAttribute("href", "/kpi/dashboard?topic=water");
  const withdrawn = rows.filter({ hasText: "Water withdrawn" });
  await expect(withdrawn).toContainText("Pending");
  await expect(withdrawn).toContainText("31,500 m³");
  await expect(withdrawn.getByRole("link", { name: "Review pending values" })).toHaveAttribute("href", "/data/approvals?view=kpi");
  await expect(withdrawn.getByRole("img", { name: /Water withdrawn, 12 periods/ })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(page).not.toHaveURL(/topic=/);

  // By keyboard, and from a shared link.
  await page.locator('[data-testid="esg-topic-bar"][data-topic="training"]').focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Training" })).toBeVisible();
  await page.goto("/kpi/esg?topic=health_safety");
  await expect(page.getByRole("dialog", { name: "Health and safety" })).toBeVisible();
});

test("a heat-table cell sets the site and pillar filters and asks the server again", async ({ page }) => {
  await kpiApp(page, { role: "Manager", user: MIA });
  const urls = esgCalls(page);
  await open(page);
  const heat = page.getByTestId("esg-heat");
  await expect(heat.getByRole("rowheader")).toHaveText(["Bahrain plant", "Dammam", "Matola"]);
  const cell = heat.locator('[data-testid="esg-heat-cell"][data-site="3"][data-pillar="social"]');
  await expect(cell).toHaveText("67%");
  await expect(cell).toHaveAccessibleName("Matola, Social: 67 percent covered. Show this site and pillar.");
  // Governance has nothing at the sites: "—", not a button.
  await expect(heat.locator('[data-testid="esg-heat-cell"][data-empty="true"]')).toHaveCount(3);
  await cell.click();
  await expect(page).toHaveURL(/site=3/);
  await expect(page).toHaveURL(/pillar=social/);
  await expect(page.getByLabel("Site", { exact: true })).toHaveValue("3");
  await expect.poll(() => urls.some((u) => u.searchParams.get("site") === "3" && u.searchParams.get("pillar") === "social")).toBe(true);
  await expect(heat.getByRole("rowheader")).toHaveText(["Matola"]);
});

test("the year filter is in the URL; an earlier year with nothing approved says so plainly", async ({ page }) => {
  await kpiApp(page, { role: "Manager", user: MIA });
  await open(page);
  await page.getByLabel("Year", { exact: true }).selectOption("2025");
  await expect(page).toHaveURL(/year=2025/);
  await expect(card(page, "environment")).toContainText("100%");
  await expect(page.getByTestId("esg-movers")).toHaveCount(0);
  await expect(page.getByText("Nothing to compare with 2024 yet.")).toBeVisible();
});

test("a server error shows a plain message and Try again", async ({ page }) => {
  await kpiApp(page, { role: "Manager", user: MIA });
  let fail = true;
  await page.route((url) => url.port !== "4173" && url.pathname.endsWith("/kpi/esg"), (route) => (fail ? route.fulfill({ status: 500, json: { message: "Database is busy" } }) : route.fallback()));
  await open(page);
  await expect(page.getByText("Database is busy")).toBeVisible({ timeout: 15_000 });
  fail = false;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(card(page, "environment")).toBeVisible();
});

test("the ESG dashboard is first in the KPIs menu and in the command palette", async ({ page }) => {
  await kpiApp(page, { role: "Admin", user: OMAR });
  await page.goto("/kpi/dashboard");
  await expect(page.getByRole("link", { name: "See the ESG dashboard" })).toHaveAttribute("href", "/kpi/esg");
  await expect(page.getByTestId("kpi-card").first().getByTestId("pillar-badge")).toBeVisible();
  await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "KPIs", exact: true }).click();
  await expect(page.getByRole("menuitem").first()).toHaveText("ESG dashboard");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox", { name: "Search pages" }).fill("ESG");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/kpi\/esg$/);
  await expect(page.getByRole("heading", { name: "ESG dashboard", level: 1 })).toBeVisible();
  // An Admin can't approve: no review link.
  await expect(page.getByRole("link", { name: "Review them" })).toHaveCount(0);
});

test("a Superadmin chooses a client first, then sees its ESG dashboard", async ({ page }) => {
  await kpiApp(page, { role: "Superadmin", user: SAM });
  const urls = esgCalls(page);
  await open(page);
  await expect(page.getByTestId("kpi-choose-client")).toContainText("Choose a client to see its KPIs");
  await page.getByTestId("kpi-choose-client").getByRole("button", { name: /Choose client/ }).click();
  await page.getByRole("option", { name: "ACME" }).click();
  await expect(card(page, "governance")).toBeVisible();
  expect(urls.some((u) => u.searchParams.get("company_id") === "1")).toBe(true);
});

test("with the switch off the ESG dashboard is not available and not in the nav", async ({ page }) => {
  await kpiApp(page, { role: "Manager", user: MIA, enabled: false });
  await open(page);
  await expect(page.getByText("KPI tracking isn't turned on for your company.")).toBeVisible();
  await expect(page.getByTestId("esg-pillar-card")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "KPIs", exact: true })).toHaveCount(0);
});

test("at 390 px the ESG dashboard doesn't scroll sideways and the drawer opens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await kpiApp(page, { role: "Manager", user: MIA });
  await open(page);
  await expect(card(page, "environment")).toBeVisible();
  await expect(page.getByTestId("esg-trend").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.locator('[data-testid="esg-topic-bar"][data-topic="waste"]').click();
  await expect(page.getByRole("dialog", { name: "Waste" })).toBeVisible();
});

test("in Midal Night the pillars and the heat table keep their tokens", async ({ page }) => {
  const midal = { companyId: 1, name: "Midal Cables", primary: "#0b2e5c", accent: "#2f6fb0", coverFrom: "#061933", coverTo: "#0b2e5c", defaultLook: "classic" };
  await kpiApp(page, { role: "Manager", user: MIA, brand: midal, appearance: "dark" });
  await open(page);
  const heatCell = page.locator('[data-testid="esg-heat-cell"][data-site="1"][data-pillar="social"]');
  await expect(heatCell).toBeVisible();
  const colours = await heatCell.evaluate((el) => {
    const css = getComputedStyle(document.documentElement);
    return { bg: getComputedStyle(el).backgroundColor, heat5: css.getPropertyValue("--t-heat-5").trim(), pillarE: css.getPropertyValue("--t-pillar-e").trim() };
  });
  expect(colours.heat5).toBe("#9ec5f4");
  expect(colours.pillarE).toBe("#1fa68c");
  expect(colours.bg).toBe("rgb(158, 197, 244)");
});

test("KPI setup groups step 3 by pillar then topic, and step 4 rows under pillar headings", async ({ page }) => {
  const calls = await kpiApp(page, { role: "Admin", user: OMAR });
  await page.goto("/kpi/setup?step=kpis");
  const groups = page.getByTestId("setup-pillar-group");
  await expect(groups).toHaveCount(3);
  await expect(groups.getByRole("heading", { level: 3 })).toHaveText([/Environment\s*18 of 19 selected/, /Social\s*10 of 10 selected/, /Governance\s*3 of 3 selected/]);
  // Board diversity sits under Governance (its own pillar), not under Social's Diversity.
  const gov = groups.filter({ has: page.getByRole("heading", { name: /Governance/, level: 3 }) });
  await expect(gov.getByRole("heading", { level: 4 })).toHaveText(["Diversity", "Governance", "Business ethics"]);
  await expect(gov.getByTestId("setup-kpi-row").first()).toContainText("Women on the board");
  // Ticking a KPI moves its pillar's count.
  await page.getByRole("checkbox", { name: "Particulate matter emitted" }).click();
  await expect(groups.first().getByTestId("setup-pillar-count")).toHaveText("19 of 19 selected");

  // Custom KPI: the pillar follows the topic unless changed.
  await page.getByRole("button", { name: "Add your own KPI" }).click();
  const own = page.getByRole("dialog", { name: "Add your own KPI" });
  await own.getByLabel("Topic").selectOption({ label: "Community" });
  await expect(own.getByLabel("Pillar")).toHaveValue("social");
  await own.getByLabel("Pillar").selectOption({ label: "Governance" });
  await expect(own.getByTestId("pillar-override-note")).toHaveText("Differs from its topic (Community → Social)");
  await own.getByLabel("Name").fill("Community grievances");
  await own.getByLabel("Question your people answer").fill("How many grievances did {site} receive in {period}?");
  await own.getByRole("button", { name: "Add KPI" }).click();
  await expect(page.getByText("Community grievances added and ticked.")).toBeVisible();
  expect(calls.find((c) => c.path.endsWith("/kpi/setup/custom-kpis"))?.body).toMatchObject({ topic: "community", pillar: "governance" });

  await page.goto("/kpi/setup?step=owners");
  const pillarRows = page.getByTestId("topic-pillar-row");
  await expect(pillarRows).toHaveText([/Environment/, /Social/, /Governance/]);
  await expect(page.getByRole("rowheader", { name: "Business ethics" })).toBeVisible();
});

test("partly empty: a pillar with no KPIs reads 'No KPIs yet', Governance without headlines says so, and 0 % reads plainly", async ({ page }) => {
  await kpiApp(page, { role: "Manager", user: MIA });
  // Midal-like figures: Social at 0 %, Governance with nothing counted and no headlines.
  await page.route(
    (url) => url.port !== "4173" && url.pathname.endsWith("/kpi/esg"),
    async (route) => {
      // The shared mock's answer, then changed.
      const res = await getResponse(kpiHandlers, new Request(route.request().url()));
      const body = await (res as Response).json();
      body.pillars = body.pillars.map((p: { pillar: string; topics: { approved: number; coverage_pct: number | null; missing: number; pending: number; kpis: number }[] }) =>
        p.pillar === "social"
          ? { ...p, approved: 0, pending: 0, missing: 10, coverage_pct: 0, change: { approved_pct_vs_last_year: null }, topics: p.topics.map((t) => ({ ...t, approved: 0, pending: 0, missing: t.kpis, coverage_pct: 0 })) }
          : p.pillar === "governance"
            ? { ...p, kpis: 0, approved: 0, pending: 0, missing: 0, not_due: 0, coverage_pct: null, change: { approved_pct_vs_last_year: null }, topics: [] }
            : p,
      );
      body.trends = body.trends.filter((t: { pillar: string }) => t.pillar !== "governance");
      await route.fulfill({ json: body });
    },
  );
  await open(page);
  await expect(card(page, "governance")).toContainText("No KPIs yet");
  await expect(card(page, "governance")).not.toContainText("0%");
  await expect(card(page, "social")).toContainText("0%");
  await expect(card(page, "social").getByTestId("esg-pillar-approved")).toHaveText("0 of 10 KPIs approved");
  await expect(card(page, "social")).toContainText("10 missing");
  await expect(page.locator('[data-testid="esg-topic-bar"][data-topic="training"]')).toHaveAccessibleName(/Training · 0 of 1 approved · 1 missing/);
  const gov = page.getByTestId("esg-trend-group").filter({ hasText: "Governance" });
  await expect(gov.getByTestId("esg-trend-empty")).toContainText("No governance KPIs tracked yet.");
});
