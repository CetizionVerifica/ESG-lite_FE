import { type Page, expect, test } from "@playwright/test";
import { OMAR, RAVI, kpiApp } from "./kpiMockApi";

/**
 * KPI-12 · AI assist, suggest only. Ravi drops his water bill on My KPIs;
 * the matching cards get "AI suggestion" chips (value, source page, the
 * quote on hover) and "Use" fills the input: the value lands in the draft
 * and nothing is submitted. An Admin adding their own KPI gets suggested
 * disclosures with their why. When AI is down the page says so calmly.
 */

const bill = { name: "water-bill.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 water bill") };
const dropBill = async (page: Page) => page.getByTestId("ai-fill").locator('input[type="file"]').setInputFiles(bill);

test("a suggestion from a dropped bill fills the draft when used, and nothing is submitted", async ({ page }) => {
  const calls = await kpiApp(page, { role: "User", user: RAVI });
  await page.goto("/kpi?period=2026-09");
  await expect(page.getByRole("heading", { name: "Fill from a document" })).toBeVisible();
  await dropBill(page);
  await expect(page.getByTestId("ai-fill-status")).toContainText("3 suggestions from water-bill.pdf on 2 KPIs");
  const ai = calls.find((c) => c.path.endsWith("/kpi/ai/suggest-values"));
  expect(ai?.body).toBe("(multipart)");

  const withdrawn = page.getByTestId("kpi-row").filter({ hasText: /^Water withdrawn/ });
  await expect(withdrawn).toContainText("2 AI suggestions");
  await withdrawn.getByRole("button", { name: "Fix: Water withdrawn" }).click();
  const card = page.getByRole("dialog");
  const chips = card.getByTestId("ai-suggestion");
  await expect(chips).toHaveCount(2);
  const total = chips.filter({ hasText: "1,200 m³" });
  await expect(total).toContainText("AI suggestion");
  await expect(total).toContainText("Suggested from water-bill.pdf, page 2");
  await total.getByRole("button", { name: "Suggested from water-bill.pdf, page 2" }).hover();
  await expect(page.getByRole("tooltip")).toHaveText("“Water consumed this period: 1,200 m³”");

  await card.getByLabel("Amount").fill("");
  await total.getByRole("button", { name: "Use 1,200 m³" }).click();
  await expect(card.getByLabel("Amount")).toHaveValue("1200");
  await expect(card.getByText("AI filled, check it")).toHaveCount(1);
  await chips.filter({ hasText: "Groundwater" }).getByRole("button", { name: /^Use / }).click();
  await expect(card.getByLabel(/Groundwater/)).toHaveValue("700");
  await expect(chips).toHaveCount(0);

  // The draft saves as if typed; it's not sent for review.
  await expect(card.getByText("Draft saved")).toBeVisible();
  const put = calls.filter((c) => c.method === "PUT" && c.path.endsWith("/kpi/values")).at(-1);
  expect(put?.body).toMatchObject({ items: [{ kpi_definition_id: 13, value_numeric: 1200, unit: "m³", breakdown: { groundwater: 700 } }] });
  expect(calls.some((c) => c.path.endsWith("/kpi/values/submit"))).toBe(false);
  await card.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByTestId("kpi-row").filter({ hasText: /^Water withdrawn/ })).toContainText("Draft saved");
  await expect(page.getByRole("button", { name: "Submit 2 ready values" })).toBeVisible();
});

test("a low-confidence suggestion reads Check this and can be dismissed", async ({ page }) => {
  await kpiApp(page, { role: "User", user: RAVI });
  await page.goto("/kpi?period=2026-09");
  await dropBill(page);
  const discharged = page.getByTestId("kpi-row").filter({ hasText: /^Water discharged/ });
  await expect(discharged).toContainText("AI suggestion");
  await discharged.getByRole("button", { name: /Water discharged/ }).click();
  const chip = page.getByRole("dialog").getByTestId("ai-suggestion");
  await expect(chip).toContainText("Check this");
  await expect(chip).toContainText("905 m³");
  await expect(chip).toContainText("the bill gives an estimate on page 3");
  await chip.getByRole("button", { name: "Dismiss 905 m³" }).click();
  await expect(page.getByRole("dialog").getByTestId("ai-suggestion")).toHaveCount(0);
  await expect(page.getByRole("dialog").getByLabel("Amount")).toHaveValue("860");
});

test("when AI is down, My KPIs says so calmly and entry still works", async ({ page }) => {
  await kpiApp(page, { role: "User", user: RAVI, aiDown: true });
  await page.goto("/kpi?period=2026-09");
  await dropBill(page);
  await expect(page.getByTestId("ai-fill-status")).toHaveText("AI not available right now. You can still enter everything yourself.");
  await expect(page.getByTestId("ai-fill").getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Enter: Waste generated" }).click();
  await expect(page.getByRole("dialog").getByTestId("ai-suggestion")).toHaveCount(0);
});

test("adding your own KPI suggests disclosures with why, Check this at 0.5 or less, and a calm note when AI is down", async ({ page }) => {
  await kpiApp(page, { role: "Admin", user: OMAR });
  await page.goto("/kpi/setup?step=kpis");
  await page.getByRole("button", { name: "Add your own KPI" }).click();
  const own = page.getByRole("dialog", { name: "Add your own KPI" });
  await own.getByLabel("Name").fill("Rainwater harvested");
  await own.getByLabel("Question your people answer").fill("How much rainwater did {site} collect in {period}?");
  await own.getByRole("button", { name: "Suggest" }).click();
  const list = own.getByRole("list", { name: "Suggested disclosures" });
  const first = list.getByRole("listitem").first();
  await expect(first.getByRole("checkbox")).not.toBeChecked();
  await expect(first).toContainText("It measures the same thing");
  await expect(first).toContainText("AI");
  await expect(list.getByRole("listitem").nth(1)).toContainText("Check this");
});

test("the custom KPI drawer stays calm when AI is down", async ({ page }) => {
  await kpiApp(page, { role: "Admin", user: OMAR, aiDown: true });
  await page.goto("/kpi/setup?step=kpis");
  await page.getByRole("button", { name: "Add your own KPI" }).click();
  const own = page.getByRole("dialog", { name: "Add your own KPI" });
  await own.getByLabel("Name").fill("Rainwater harvested");
  await own.getByRole("button", { name: "Suggest" }).click();
  await expect(own.getByTestId("ai-unavailable")).toHaveText("AI not available right now. You can still enter everything yourself.");
  await expect(own.getByRole("alert")).toHaveCount(0);
});

test("with the switch off there's no Fill from a document", async ({ page }) => {
  await kpiApp(page, { role: "User", user: RAVI, enabled: false });
  await page.goto("/kpi?period=2026-09");
  await expect(page.getByText("KPI tracking isn't turned on for your company.")).toBeVisible();
  await expect(page.getByTestId("ai-fill")).toHaveCount(0);
});
