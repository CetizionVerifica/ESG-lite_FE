import { type Page, expect, test } from "@playwright/test";
import { managerAt, mockInsightsApi, overflowX } from "./insightsMockApi";

/**
 * IN-10 · The Insights main path end to end on mocks (IN-10 spec, E2E main
 * path): hero → ring filter → bridge toggle → card Show → present mode → PDF,
 * at 1280 and 390, in a light and a dark pack; then every panel in the four
 * app themes (PlanetPulse, Midal Classic, Midal Light, Midal Night) in light
 * and dark, and the layout at 1280 / 1024 / 768 / 390.
 */

const MIDAL = { companyId: 1, name: "Midal Cables", primary: "#0b2e5c", accent: "#2f6fb0", coverFrom: "#061933", coverTo: "#0b2e5c", logoUrl: null, logoPublicId: null, logoOnDarkUrl: null, scope3Colour: null, updatedAt: "2026-10-01T10:00:00.000Z" };
const PACKS: Record<string, object | null> = {
  PlanetPulse: null,
  "Midal Classic": { ...MIDAL, defaultLook: "classic" },
  "Midal Light": { ...MIDAL, defaultLook: "light" },
  "Midal Night": { ...MIDAL, defaultLook: "night" },
};
const STORY = ["hero", "decoupling", "ring", "pathway", "wall", "cards", "stripes"];

/** Console errors, ignoring the dev server's noise. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Download the React DevTools|favicon/.test(m.text())) errors.push(m.text());
  });
  return errors;
}

async function settledPanels(page: Page, ids: string[]) {
  for (const id of ids) await expect(page.getByTestId(`panel-${id}`), id).toHaveAttribute("data-state", "ok");
}

for (const [width, appearance, pack] of [
  [1280, "light", "PlanetPulse"],
  [390, "dark", "Midal Night"],
] as const) {
  test(`main path at ${width} px, ${pack} ${appearance}: hero → ring filter → What moved → card Show → present → PDF`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const errors = watchErrors(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const calls = await mockInsightsApi(page, "Manager", managerAt(true, true), { insights: true, kpi: true, brand: PACKS[pack], appearance });
    await page.goto("/insights?year=2026");
    await settledPanels(page, STORY);
    await expect(page.getByTestId("hero-net-value")).toHaveText("41,280");

    // Ring → pillar filter (the header chip is the keyboard path to the same filter).
    await page.getByRole("group", { name: "Pillar" }).getByRole("button", { name: "Environment" }).click();
    await expect(page).toHaveURL(/pillar=environment/);
    await expect(page.getByTestId("esg-ring")).toHaveAttribute("data-pillar", "environment");
    await expect.poll(() => calls.some((c) => c.path.includes("/insights/target-wall") && c.path.includes("pillar=environment"))).toBe(true);

    // Pathway → What moved.
    const pathway = page.getByTestId("panel-pathway");
    await pathway.getByRole("radio", { name: "What moved" }).click();
    await expect(pathway.getByTestId("pathway-story")).toHaveAttribute("data-mode", "bridge");

    // A card's Show targets its panel.
    const card = page.locator('[data-testid="insight-card"][data-rule="decoupling"]');
    await card.getByRole("button", { name: "Show" }).click();
    await expect(page).toHaveURL(/panel=decoupling/);
    await expect(page.getByTestId("panel-decoupling")).toHaveClass(/ring-2/);

    // Present mode with the same filters, then back.
    await page.getByRole("button", { name: "Present" }).click();
    await expect(page.getByRole("dialog", { name: "Present insights" })).toBeVisible();
    await expect(page).toHaveURL(/\/insights\/present\?.*pillar=environment/);
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("slide-counter")).toHaveText("2 / 6");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("insights-page")).toBeVisible();

    // PDF snapshot.
    await page.getByTestId("insights-export").click();
    const download = page.waitForEvent("download");
    await page.getByRole("menuitem", { name: "PDF snapshot" }).click();
    expect((await download).suggestedFilename()).toMatch(/^insights-CY-2026-all-sites\.pdf$/);

    expect(await overflowX(page)).toBeLessThanOrEqual(1);
    expect(errors).toEqual([]);
  });
}

for (const [pack, brand] of Object.entries(PACKS)) {
  for (const appearance of ["light", "dark"] as const) {
    test(`every panel renders in ${pack} ${appearance}`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      const errors = watchErrors(page);
      await mockInsightsApi(page, "Manager", managerAt(true, true), { insights: true, kpi: true, brand, appearance });
      await page.goto("/insights?year=2026");
      await settledPanels(page, STORY);
      for (const tab of ["Data flow", "Materiality", "Completeness", "Sites"]) {
        await page.getByRole("tab", { name: tab }).click();
        await expect(page.getByRole("tabpanel").locator("[data-state]").first()).toHaveAttribute("data-state", "ok");
      }
      await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains("dark"))).toBe(appearance === "dark");
      if (brand) await expect.poll(() => page.evaluate(() => document.documentElement.dataset.pack)).not.toBe("planetpulse");
      await page.screenshot({ path: test.info().outputPath(`insights-${pack.replace(/\s/g, "-")}-${appearance}.png`), fullPage: true });
      expect(errors).toEqual([]);
    });
  }
}

test("layout: stories 8/4 at 1280, 2-up at 1024, one column at 768 and 390", async ({ page }) => {
  await mockInsightsApi(page, "Manager", managerAt(true, true), { insights: true, kpi: true });
  const box = async (id: string) => (await page.getByTestId(`panel-${id}`).boundingBox())!;
  for (const width of [1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/insights?year=2026");
    await settledPanels(page, ["decoupling", "ring", "pathway", "wall"]);
    const d = await box("decoupling");
    const r = await box("ring");
    const p = await box("pathway");
    const w = await box("wall");
    if (width >= 1024) {
      expect(Math.abs(d.y - r.y), `${width}: decoupling and ring side by side`).toBeLessThan(2);
      expect(Math.abs(p.y - w.y), `${width}: pathway and wall side by side`).toBeLessThan(2);
      const ratio = d.width / r.width;
      if (width >= 1280) expect(ratio, "8/4").toBeGreaterThan(1.8);
      else expect(Math.abs(ratio - 1), "6/6").toBeLessThan(0.05);
    } else {
      expect(r.y, `${width}: ring under decoupling`).toBeGreaterThan(d.y + d.height - 2);
      expect(w.y, `${width}: wall under pathway`).toBeGreaterThan(p.y + p.height - 2);
    }
    expect(await overflowX(page), `${width}: no horizontal scroll`).toBeLessThanOrEqual(1);
  }
});

test("IN-11 Sites tab: bars by scope per site, a card per site, and a site name opens its Overview", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const errors = watchErrors(page);
  await mockInsightsApi(page, "Manager", managerAt(true, true), { insights: true, kpi: true });
  await page.goto("/insights?year=2026");
  await page.getByRole("tab", { name: "Sites" }).click();
  await expect(page).toHaveURL(/tab=sites|panel=site_compare|insights/);
  const sites = page.getByTestId("site-compare");
  await expect(sites.getByRole("img")).toHaveAttribute("aria-label", "Chennai plant is the largest of 3 sites at 61% of net emissions, down 15% on 2025.");
  await expect(sites.getByTestId("site-compare-row")).toHaveCount(3);
  await expect(sites.getByRole("link", { name: "Add production data" })).toBeVisible();
  await expect(sites.getByTestId("site-compare-pending")).toHaveText(["3 pending", "7 pending"]);

  await sites.getByRole("radio", { name: "Table" }).click();
  await sites.getByRole("table").getByRole("link", { name: "Nagpur plant" }).click();
  await expect(page).toHaveURL(/\/overview\?period=CY2026&siteIds=12/);
  expect(errors).toEqual([]);
});

test("IN-11 Sites tab at 390 px: the tab list offers Sites and the cards stack", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await mockInsightsApi(page, "Manager", managerAt(true, false), { insights: true, kpi: false });
  await page.goto("/insights?year=2026");
  await page.getByRole("combobox", { name: "More detail" }).selectOption({ label: "Sites" });
  const rows = page.getByTestId("site-compare-row");
  await expect(rows).toHaveCount(3);
  const first = (await rows.nth(0).boundingBox())!;
  const second = (await rows.nth(1).boundingBox())!;
  expect(second.y).toBeGreaterThan(first.y + first.height - 2);
  expect(await overflowX(page)).toBeLessThanOrEqual(1);
});

test("without KPI tracking Story 2 is By scope and site, and nothing says KPI tracking is off", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockInsightsApi(page, "Manager", managerAt(true, false), { insights: true, kpi: false });
  await page.goto("/insights?year=2026");
  await expect(page.getByTestId("panel-scopes")).toHaveAttribute("data-state", "ok");
  await expect(page.getByTestId("scope-site").getByRole("img")).toHaveAttribute("aria-label", /^Emissions by site and scope for 3 sites/);
  await expect(page.getByTestId("panel-ring")).toHaveCount(0);
  await expect(page.getByText(/KPI tracking/)).toHaveCount(0);
});
