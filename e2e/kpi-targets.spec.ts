import { type Page, expect, test } from "@playwright/test";
import { MIA, OMAR, RAVI, kpiApp } from "./kpiMockApi";

/**
 * KPI-9 · Targets (`/kpi/targets`): Omar (Admin) sets a target with the
 * baseline prefilled from the approved figure and sees its progress; Mia
 * (Manager) reads them; the progress also shows in My KPIs.
 */

const open = (page: Page) => page.goto("/kpi/targets");
const targets = (page: Page) => page.getByTestId("kpi-target");

test("an Admin sets a target from the approved baseline and sees its progress", async ({ page }) => {
  const calls = await kpiApp(page, { role: "Admin", user: OMAR });
  await open(page);
  await expect(page.getByRole("heading", { name: "KPI targets", level: 1 })).toBeVisible();
  await expect(targets(page)).toHaveCount(2);
  const water = targets(page).filter({ hasText: "Water withdrawn" });
  await expect(water).toContainText("Target: −21 % by 2030 from 2024");
  await expect(water).toContainText("64 % of the way");
  await expect(water).toContainText("On track");

  await page.getByRole("button", { name: "Set a target" }).click();
  const drawer = page.getByRole("dialog", { name: "Set a target" });
  await drawer.getByRole("combobox", { name: "KPI" }).fill("Waste gen");
  await page.getByRole("option", { name: "Waste generated" }).click();
  await drawer.getByLabel("Baseline year").selectOption("2025");
  await expect(drawer.getByLabel("Baseline value")).toHaveValue("103.6");
  await expect(drawer.getByText("Your approved 2025 figure.")).toBeVisible();
  await drawer.getByLabel("Target value").fill("82.9");
  await expect(drawer.getByTestId("kpi-target-preview")).toContainText("−20 % by 2030 from 2025");
  await drawer.getByRole("button", { name: "Set target" }).click();

  await expect(page.getByText("Target set for Waste generated")).toBeVisible();
  const put = calls.find((c) => c.method === "PUT" && c.path.endsWith("/kpi/targets"));
  expect(put?.body).toEqual({ kpi_definition_id: 15, site_id: null, baseline_year: 2025, baseline_value: 103.6, target_year: 2030, target_value: 82.9, direction: "reduce", note: null });
  const waste = targets(page).filter({ hasText: "Waste generated" });
  await expect(waste).toContainText("25.1 % of the way");
  await expect(waste).toContainText("On track");
});

test("a typed baseline needs a note, and the direction must match the values", async ({ page }) => {
  await kpiApp(page, { role: "Admin", user: OMAR });
  await open(page);
  await page.getByRole("button", { name: "Set a target" }).click();
  const drawer = page.getByRole("dialog", { name: "Set a target" });
  await drawer.getByRole("combobox", { name: "KPI" }).fill("Water disch");
  await page.getByRole("option", { name: "Water discharged" }).click();
  await expect(drawer.getByText(/No approved figure for that year/)).toBeVisible();
  await drawer.getByLabel("Baseline value").fill("10000");
  await drawer.getByLabel("Target value").fill("12000");
  await drawer.getByRole("radio", { name: "Reduce" }).click();
  await drawer.getByRole("button", { name: "Set target" }).click();
  await expect(drawer.getByText("To reduce, the target must be lower than the baseline.")).toBeVisible();
  await expect(drawer.getByText(/Say where the baseline came from/)).toBeVisible();
  await drawer.getByLabel("Target value").fill("8000");
  await drawer.getByLabel("Note").fill("From the 2025 water audit");
  await drawer.getByRole("button", { name: "Set target" }).click();
  await expect(targets(page).filter({ hasText: "Water discharged" })).toContainText("No approved value yet");
});

test("a Manager reads targets but can't change them; deleting asks first", async ({ page }) => {
  await kpiApp(page, { role: "Manager", user: MIA, other: () => undefined });
  await open(page);
  await expect(targets(page)).toHaveCount(2);
  await expect(page.getByRole("button", { name: "Set a target" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Edit the target/ })).toHaveCount(0);
});

test("an Admin deletes a target after confirming", async ({ page }) => {
  await kpiApp(page, { role: "Admin", user: OMAR });
  await open(page);
  await page.getByRole("button", { name: "Delete the target for Scope 1 emissions" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete target" }).click();
  await expect(page.getByText("Target deleted")).toBeVisible();
  await expect(targets(page)).toHaveCount(1);
});

test("My KPIs shows the company target on a read-only row", async ({ page }) => {
  await kpiApp(page, { role: "User", user: RAVI });
  await page.goto("/kpi?period=2026-09");
  const scope1 = page.getByTestId("kpi-row").filter({ hasText: "Scope 1 emissions" });
  await expect(scope1.getByTestId("kpi-target-progress")).toContainText("company, −40 % by 2030 from 2024");
});

test("at 390 px the targets list and drawer fit", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await kpiApp(page, { role: "Admin", user: OMAR });
  await open(page);
  await expect(targets(page).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Set a target" }).click();
  expect((await page.getByRole("dialog").boundingBox())?.width).toBeGreaterThanOrEqual(389);
});

test("with the switch off /kpi/targets is not available", async ({ page }) => {
  await kpiApp(page, { role: "Admin", user: OMAR, enabled: false });
  await open(page);
  await expect(page.getByText("KPI tracking isn't turned on for your company.")).toBeVisible();
  await expect(targets(page)).toHaveCount(0);
});
