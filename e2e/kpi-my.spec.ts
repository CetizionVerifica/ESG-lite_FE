import { type Page, expect, test } from "@playwright/test";
import { RAVI, kpiApp } from "./kpiMockApi";

/**
 * KPI-7 · My KPIs and the entry card (05-ux S3), against the stateful KPI
 * mocks: Ravi at Bahrain plant, September 2026 (4 due, 1 sent back, the rest
 * done or filled in from data).
 */

const open = (page: Page) => page.goto("/kpi?period=2026-09");
const drawer = (page: Page) => page.getByRole("dialog");

test("a contributor sees progress, Due / Sent back / Done and read-only auto and calculated rows", async ({ page }) => {
  await kpiApp(page, { role: "User", user: RAVI });
  await open(page);
  await expect(page.getByRole("heading", { name: "My KPIs", level: 1 })).toBeVisible();
  await expect(page.getByTestId("kpi-progress")).toContainText("8 of 13 done");
  await expect(page.getByRole("tab", { name: /Due/ })).toHaveAttribute("aria-selected", "true");

  // Sent back on top with the reviewer's note; plain names, never disclosure codes.
  const rows = page.getByTestId("kpi-row");
  await expect(rows.first()).toContainText("Water withdrawn");
  await expect(rows.first()).toContainText("Please split it by source for BRSR.");
  await expect(page.getByText("303-3")).toHaveCount(0);

  // Auto rows: the value with "From your data", nothing to enter.
  const scope1 = rows.filter({ hasText: "Scope 1 emissions" });
  await expect(scope1).toContainText("From your data");
  await expect(scope1.getByRole("button")).toHaveCount(0);
  // Calculated rows explain themselves.
  await expect(rows.filter({ hasText: "Water consumed" })).toContainText("Water consumed = water withdrawn 1,200 m³ − water discharged 860 m³ = 340 m³");

  await page.getByRole("tab", { name: /Sent back/ }).click();
  await expect(page).toHaveURL(/tab=sent_back/);
  await expect(page.getByRole("tabpanel").getByTestId("kpi-row")).toHaveCount(1);
});

test("the entry card converts as you type, nudges a big jump, saves the draft, and keeps it after a reload", async ({ page }) => {
  const calls = await kpiApp(page, { role: "User", user: RAVI });
  await open(page);
  await page.getByRole("button", { name: "Enter: Waste generated" }).click();
  const card = drawer(page);
  await expect(card.getByRole("heading", { name: "How much waste did Bahrain plant produce in September 2026?" })).toBeVisible();
  await expect(card.getByText("Leave out scrap you sell back into production.")).toBeVisible();

  await card.getByLabel("Amount").fill("30");
  await expect(card.getByTestId("kpi-conversion")).toHaveText("30 t = 30,000 kg");
  await expect(card.getByTestId("kpi-compare")).toContainText("Last September 12.4 t");
  await expect(card.getByText("This is 2.4× last september. Is that right?")).toBeVisible();
  await card.getByLabel("Tell your reviewer why (optional)").fill("Plant shutdown clean-out");

  // Saves on its own after a pause.
  await expect(card.getByText("Draft saved")).toBeVisible();
  const put = calls.filter((c) => c.method === "PUT" && c.path.endsWith("/kpi/values")).at(-1);
  expect(put?.body).toMatchObject({ items: [{ kpi_definition_id: 15, site_id: 1, period_start: "2026-09-01", value_numeric: 30, unit: "t", comment: "Plant shutdown clean-out" }] });

  // Changing the unit converts the preview.
  await card.getByLabel("Unit").selectOption("kg");
  await expect(card.getByTestId("kpi-conversion")).toHaveText("30 kg = 0.03 t");

  // The split checks the total.
  await card.getByLabel("Unit").selectOption("t");
  await card.getByText("Split by type").click();
  await card.getByLabel("Hazardous", { exact: true }).fill("10");
  await card.getByLabel("Non-hazardous").fill("15");
  await expect(card.getByTestId("kpi-split-sum")).toHaveText("The split is 5 t short of the total.");
  await card.getByLabel("Non-hazardous").fill("20");
  await expect(card.getByTestId("kpi-split-sum")).toHaveText("Adds up to 30 t.");
  await card.getByLabel("This is an estimate").check();
  await expect(card.getByText("Draft saved")).toBeVisible();

  await page.reload();
  const again = drawer(page);
  await expect(again.getByLabel("Amount")).toHaveValue("30");
  await expect(again.getByLabel("Hazardous", { exact: true })).toHaveValue("10");
  await expect(again.getByLabel("This is an estimate")).toBeChecked();
  await again.getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("kpi-row").filter({ hasText: "Waste generated" })).toContainText("Draft saved");
});

test("fix a sent-back value, Save and next through the list topic by topic, then Submit all with a refusal explained", async ({ page }) => {
  const calls = await kpiApp(page, { role: "User", user: RAVI });
  await open(page);
  await page.getByRole("button", { name: "Fix: Water withdrawn" }).click();
  let card = drawer(page);
  await expect(card.getByText("Mia Haddad sent this back")).toBeVisible();
  await expect(card.getByText("1 of 5 to enter")).toBeVisible();
  await card.getByText("Split by source").click();
  await card.getByLabel("Groundwater").fill("700");
  await card.getByLabel("Third party").fill("500");
  await expect(card.getByTestId("kpi-split-sum")).toHaveText("Adds up to 1,200 m³.");
  await card.getByRole("button", { name: "Save and next" }).click();

  // The rest of Water, then Waste, Pollution and Health and safety: the order the list shows.
  card = drawer(page);
  await expect(card.getByRole("heading", { name: /How much water did Bahrain plant send out/ })).toBeVisible();
  await expect(card.getByLabel("Amount")).toHaveValue("860");
  await card.getByRole("button", { name: "Save and next" }).click();

  card = drawer(page);
  await expect(card.getByRole("heading", { name: /How much waste did Bahrain plant produce/ })).toBeVisible();
  // Nothing typed: Save and next just moves on.
  await card.getByRole("button", { name: "Save and next" }).click();

  card = drawer(page);
  await expect(card.getByRole("heading", { name: "How much NOx did Bahrain plant release in Q3 2026?" })).toBeVisible();
  await card.getByLabel("Amount").fill("1.7");
  await card.getByRole("button", { name: "Save and next" }).click();

  card = drawer(page);
  await expect(card.getByRole("heading", { name: /recordable work injuries were there at Bahrain plant/ })).toBeVisible();
  await expect(card.getByText("5 of 5 to enter")).toBeVisible();
  await card.getByLabel("Amount").fill("0");
  await card.getByRole("button", { name: "Save and close" }).click();
  await expect(page.getByText("That's everything to enter.")).toBeVisible();
  await expect(drawer(page)).toHaveCount(0);

  const saved = calls.filter((c) => c.method === "PUT" && c.path.endsWith("/kpi/values"));
  expect(saved.some((c) => JSON.stringify(c.body).includes('"breakdown":{"groundwater":700,"third_party":500}'))).toBe(true);

  // Water withdrawn, water discharged, NOx and injuries are ready.
  await page.getByRole("button", { name: "Submit 4 ready values" }).click();
  const confirm = page.getByRole("dialog", { name: "Send 4 values to Mia Haddad for review?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Send 4" }).click();
  await expect(page.getByText("3 values sent for review.")).toBeVisible();
  // Recordable injuries is BRSR Core: it needs evidence first.
  const refused = page.getByRole("status").filter({ hasText: "Some values weren't sent" });
  await expect(refused).toContainText("Recordable injuries: Attach a document before sending this value: BRSR Core needs evidence.");

  await refused.getByRole("button", { name: "Open" }).click();
  card = drawer(page);
  await card.locator('input[type="file"]').setInputFiles({ name: "injury-log-sep.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
  await expect(card.getByRole("link", { name: /injury-log-sep\.pdf/ })).toBeVisible();
  await card.getByRole("button", { name: "Close", exact: true }).click();
  await page.getByRole("button", { name: "Submit 1 ready value" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Send 1" }).click();
  await expect(page.getByText("1 value sent for review.")).toBeVisible();
  expect(calls.filter((c) => c.path.endsWith("/kpi/values/submit")).map((c) => (c.body as { ids: number[] }).ids.length)).toEqual([4, 1]);
  await expect(page.getByTestId("kpi-progress")).toContainText("12 of 13 done");
});

test("rows sit under topic headings with counts and progress; a topic chip filters and stays in the URL (D17)", async ({ page }) => {
  await kpiApp(page, { role: "User", user: RAVI });
  await open(page);
  const groups = page.getByRole("tabpanel").getByTestId("kpi-topic-group");
  await expect(groups.getByRole("heading")).toHaveText(["Water · 2", "Waste · 1", "Pollution · 1", "Health and safety · 1", "Climate · 2", "Energy · 2", "Water · 1"]);
  const water = groups.first();
  await expect(water).toContainText("1 of 3 done");
  await expect(water.getByTestId("kpi-row").first()).toContainText("Water withdrawn");

  const chips = page.getByTestId("kpi-topic-chips");
  await expect(chips.getByRole("button", { name: /All topics/ })).toHaveAttribute("aria-pressed", "true");
  await chips.getByRole("button", { name: /^Waste/ }).click();
  await expect(page).toHaveURL(/topic=waste/);
  await expect(page.getByRole("tab", { name: /Due/ })).toContainText("1");
  await expect(groups.getByRole("heading")).toHaveText(["Waste · 1"]);
  await expect(groups.first()).toContainText("2 of 3 done");

  // A shared link opens on the same topic; the Done tab follows it.
  await page.goto("/kpi?period=2026-09&topic=waste&tab=done");
  await expect(groups.getByRole("heading")).toHaveText(["Waste · 2"]);
  await chips.getByRole("button", { name: /All topics/ }).click();
  await expect(page).not.toHaveURL(/topic=/);
});

test("a value waiting for review opens read-only", async ({ page }) => {
  await kpiApp(page, { role: "User", user: RAVI });
  await open(page);
  await page.getByRole("tab", { name: /Done/ }).click();
  await page.getByRole("button", { name: "View: Waste recovered" }).click();
  const card = drawer(page);
  await expect(card.getByText("Sent for review. It can't be changed while it waits.")).toBeVisible();
  await expect(card.getByLabel("Amount")).toBeDisabled();
  await expect(card.getByRole("button", { name: /Save/ })).toHaveCount(0);
});

test("at 390 px the card is full screen and the page doesn't scroll sideways", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await kpiApp(page, { role: "User", user: RAVI });
  await open(page);
  await expect(page.getByTestId("kpi-progress")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Enter: Waste generated" }).click();
  const box = await drawer(page).boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(389);
  await drawer(page).getByLabel("Amount").fill("11");
  await expect(drawer(page).getByText("Draft saved")).toBeVisible();
});

test("with the switch off, /kpi is not available and there's no My KPIs link", async ({ page }) => {
  await kpiApp(page, { role: "User", user: RAVI, enabled: false });
  await open(page);
  await expect(page.getByText("KPI tracking isn't turned on for your company.")).toBeVisible();
  await expect(page.getByRole("link", { name: "My KPIs" })).toHaveCount(0);
  await expect(page.getByTestId("kpi-row")).toHaveCount(0);
});

const myMonth = (url: URL) =>
  url.pathname.endsWith("/user/my-month")
    ? {
        month: "2026-09",
        due_date: "2026-10-10",
        escalation_date: "2026-10-15",
        summary: { total: 1, due: 1, done: 0, pending: 0, rejected: 0 },
        sites: [
          {
            site_id: 1,
            name: "Bahrain plant",
            categories: [{ category_id: 1, category_name: "Diesel", scope: "Scope 1", status: "todo", filing: null, year_type: null, period: null, entries: { total: 0, pending: 0, approved: 0, rejected: 0 }, total_emission: 0, last_entry_at: null, rejections: [] }],
          },
        ],
      }
    : undefined;

test("My month shows a KPIs due card that opens My KPIs, only while the switch is on", async ({ page }) => {
  await kpiApp(page, { role: "User", user: RAVI, other: myMonth });
  await page.goto("/my-month?period=2026-09");
  const card = page.getByTestId("kpis-due-card");
  await expect(card).toContainText("KPIs due: 4 · Sent back: 1");
  await card.getByRole("link", { name: "Open My KPIs" }).click();
  await expect(page).toHaveURL(/\/kpi\?period=2026-09/);
  await expect(page.getByTestId("kpi-progress")).toBeVisible();
});

test("with the switch off My month has no KPI card", async ({ page }) => {
  await kpiApp(page, { role: "User", user: RAVI, enabled: false, other: myMonth });
  await page.goto("/my-month?period=2026-09");
  await expect(page.getByRole("heading", { level: 1, name: "September 2026" })).toBeVisible();
  await expect(page.getByTestId("kpis-due-card")).toHaveCount(0);
});
