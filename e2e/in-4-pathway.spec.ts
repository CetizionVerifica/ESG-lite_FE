import { expect, test } from "@playwright/test";
import { managerAt, mockInsightsApi, overflowX } from "./insightsMockApi";

/** IN-4 · Pathway with events, and the completeness calendar, on mocks. */

test("add an event from the pathway panel and see it on the pathway", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const calls = await mockInsightsApi(page, "Manager", managerAt(true, true), { insights: true, kpi: true });
  await page.goto("/insights?year=2026");
  const panel = page.getByTestId("panel-pathway");
  await expect(panel.getByTestId("pathway")).toBeVisible();
  await expect(panel.getByRole("img")).toHaveAttribute("aria-label", /above the pathway in 2025 and 2026, with 3 events marked/);

  await panel.getByRole("button", { name: "Events" }).click();
  const drawer = page.getByRole("dialog", { name: "Events" });
  await expect(drawer.getByTestId("event-row")).toHaveCount(3);
  await drawer.getByRole("button", { name: "Add event" }).first().click();
  const form = page.getByTestId("event-form");
  await form.getByLabel(/Name/).fill("Heat pumps at Chennai");
  await expect(page.getByTestId("event-label-counter")).toHaveText("21/60 characters");
  await form.getByLabel(/Kind/).selectOption("initiative");
  await form.getByLabel(/Date/).fill("2026-03-01");
  await form.getByLabel(/Site/).selectOption({ label: "Chennai plant" });
  await form.getByRole("button", { name: "Add event" }).click();
  await expect(page.getByText("Event added")).toBeVisible();
  await expect(page.getByRole("dialog").getByTestId("event-row")).toHaveCount(4);
  expect(calls.find((c) => c.method === "POST" && c.path.includes("/insights/events"))?.body).toMatchObject({ label: "Heat pumps at Chennai", kind: "initiative", date: "2026-03-01", site_id: 11 });
  await page.keyboard.press("Escape");

  // The panel refetched: the new event is marked on the chart and listed in its table.
  await expect(panel.getByRole("img")).toHaveAttribute("aria-label", /with 4 events marked/);
  await panel.getByRole("radio", { name: "Table" }).click();
  await expect(panel.getByRole("row", { name: /^2026/ })).toContainText("Heat pumps at Chennai");

  // Delete asks in the drawer, never a browser dialog.
  page.on("dialog", () => {
    throw new Error("no browser dialogs");
  });
  await panel.getByRole("button", { name: "Events" }).click();
  await page.getByRole("button", { name: "Delete Heat pumps at Chennai" }).click();
  await page.getByTestId("event-delete-confirm").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Event deleted")).toBeVisible();
  await expect(page.getByRole("dialog").getByTestId("event-row")).toHaveCount(3);
});

test("completeness: a site-month opens its drawer with the counts and a link to the entries", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await mockInsightsApi(page, "Manager", managerAt(true, false), { insights: true, kpi: false });
  await page.goto("/insights?year=2026");
  await page.getByRole("tab", { name: "Completeness" }).click();
  const panel = page.getByTestId("panel-completeness");
  await expect(panel.getByRole("img")).toHaveAttribute("aria-label", /11 site-months are not complete yet/);
  await expect(panel.getByRole("list", { name: "Colour scale" })).toContainText("Not due yet");

  await panel.getByRole("radio", { name: "Table" }).click();
  await panel.getByRole("button", { name: "Details for Nagpur plant, Sep 2026" }).click();
  const drawer = page.getByRole("dialog", { name: "Nagpur plant · Sep 2026" });
  await expect(drawer).toContainText("52% of the expected data is approved");
  await expect(drawer.getByTestId("completeness-drawer")).toContainText("13 of 25 approved");
  await drawer.getByTestId("completeness-link").click();
  await expect(page).toHaveURL(/\/data\/ledger\?site=12&period=month:2026-09/);
});

test("390 px: pathway and completeness fit, completeness opens on its table", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockInsightsApi(page, "Manager", managerAt(true, false), { insights: true, kpi: false });
  await page.goto("/insights?year=2026");
  await expect(page.getByTestId("panel-pathway").getByTestId("pathway")).toBeVisible();
  expect(await overflowX(page)).toBeLessThanOrEqual(1);

  await page.getByRole("combobox", { name: "More detail" }).selectOption({ label: "Completeness" });
  const panel = page.getByTestId("panel-completeness");
  await expect(panel.getByRole("table")).toBeVisible();
  expect(await overflowX(page)).toBeLessThanOrEqual(1);
  await panel.getByRole("button", { name: "Details for Chennai plant, Sep 2026" }).click();
  await expect(page.getByRole("dialog", { name: "Chennai plant · Sep 2026" })).toBeVisible();
  expect(await overflowX(page)).toBeLessThanOrEqual(1);
});
