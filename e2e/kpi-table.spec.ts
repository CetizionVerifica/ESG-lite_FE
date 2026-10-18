import { readFileSync } from "node:fs";
import { type Page, expect, test } from "@playwright/test";
import * as XLSX from "xlsx";
import { RAVI, kpiApp } from "./kpiMockApi";

/**
 * KPI-7 part 3 · The fast lane on My KPIs: a table of what's still to
 * enter, typed by keyboard (Tab / Enter) with the card's checks, and the
 * Excel template (download, fill, upload, review, save as drafts).
 */

const open = (page: Page) => page.goto("/kpi?period=2026-09&view=table");
const valueCell = (page: Page, name: RegExp) => page.getByRole("textbox", { name });
const puts = (calls: { method: string; path: string; body: unknown }[]) => calls.filter((c) => c.method === "PUT" && c.path.endsWith("/kpi/values"));

test("table view by keyboard: Enter saves and moves down, a wrong value is caught, Open shows the card", async ({ page }) => {
  const calls = await kpiApp(page, { role: "User", user: RAVI });
  await page.goto("/kpi?period=2026-09");
  await page.getByRole("radio", { name: "Table" }).click();
  await expect(page).toHaveURL(/view=table/);
  const rows = page.getByTestId("kpi-table-row");
  await expect(rows).toHaveCount(5);
  await expect(rows.first()).toContainText("Water withdrawn");
  await expect(rows.first()).toContainText("Sent back");

  const waste = valueCell(page, /^Waste generated, September 2026$/);
  await waste.focus();
  await page.keyboard.type("11");
  await page.keyboard.press("Enter");
  await expect(valueCell(page, /^NOx emitted, Q3 2026$/)).toBeFocused();
  await expect(rows.filter({ hasText: "Waste generated" })).toContainText("Draft saved");
  expect(puts(calls).at(-1)?.body).toMatchObject({ items: [{ kpi_definition_id: 15, site_id: 1, period_start: "2026-09-01", value_numeric: 11, unit: "t" }] });

  // Same checks as the card: not a number stays here with a plain message, nothing is sent.
  const before = puts(calls).length;
  await page.keyboard.type("1.7 kg");
  await page.keyboard.press("Enter");
  await expect(rows.filter({ hasText: "NOx emitted" }).getByRole("alert")).toHaveText("Type a number, like 1200.");
  expect(puts(calls).length).toBe(before);
  await valueCell(page, /^NOx emitted, Q3 2026$/).fill("1.7");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("combobox", { name: /^Unit for NOx emitted/ })).toBeFocused();
  await page.getByRole("combobox", { name: /^Unit for NOx emitted/ }).selectOption("kg");
  await expect(rows.filter({ hasText: "NOx emitted" })).toContainText("Draft saved");
  expect(puts(calls).at(-1)?.body).toMatchObject({ items: [{ kpi_definition_id: 18, value_numeric: 1.7, unit: "kg" }] });

  // The row's card has the split, evidence and comment.
  await page.getByRole("button", { name: "Open the card for Waste generated, September 2026" }).click();
  const card = page.getByRole("dialog");
  await expect(card.getByRole("heading", { name: "How much waste did Bahrain plant produce in September 2026?" })).toBeVisible();
  await expect(card.getByLabel("Amount")).toHaveValue("11");
});

test("template: download what's due, upload it filled, review the issues, save the rest as drafts", async ({ page }) => {
  const calls = await kpiApp(page, { role: "User", user: RAVI });
  await open(page);

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download template" }).click()]);
  expect(download.suggestedFilename()).toBe("my-kpis-2026-09.xlsx");
  const sheet = XLSX.read(readFileSync(await download.path()), { type: "buffer" });
  const lines = XLSX.utils.sheet_to_json<string[]>(sheet.Sheets[sheet.SheetNames[0]], { header: 1 });
  // Only what Ravi owns and still has to enter (D17).
  expect(lines.slice(1).map((l) => l[1])).toEqual(["Water withdrawn", "Water discharged", "Waste generated", "NOx emitted", "Recordable injuries"]);

  const filled = lines.map((l, i) => (i === 0 ? l : l[0] === "WASTE_GENERATED" ? [...l.slice(0, 5), "11", ""] : l[0] === "AIR_NOX" ? [...l.slice(0, 4), "kg", "1700", "Stack test"] : l[0] === "RECORDABLE_INJURIES" ? [...l.slice(0, 5), "two", ""] : l));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(filled), "My KPIs");
  const buffer = Buffer.from(XLSX.write(book, { type: "buffer", bookType: "xlsx" }) as Buffer);

  await page.getByRole("button", { name: "Upload filled template" }).click();
  const drawer = page.getByRole("dialog", { name: "Upload filled template" });
  await drawer.locator('input[type="file"]').setInputFiles({ name: "my-kpis-filled.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer });
  await drawer.getByRole("button", { name: "Check the file" }).click();
  await expect(drawer.getByText("5 rows. 4 ready, 1 need a look.")).toBeVisible();
  await drawer.getByRole("radio", { name: /Issues/ }).click();
  await expect(drawer.getByRole("table")).toContainText("Recordable injuries");
  await expect(drawer.getByRole("table")).toContainText("The value isn't a number.");
  await drawer.getByRole("button", { name: "Save 4 rows as drafts" }).click();

  await expect(page.getByText("4 drafts saved from the template.")).toBeVisible();
  const commit = calls.find((c) => c.method === "POST" && c.path.endsWith("/kpi/my/template") && typeof c.body === "object" && c.body !== null);
  expect(commit?.body).toEqual({ plan_id: expect.any(String), commit: true });
  await expect(page.getByTestId("kpi-table-row").filter({ hasText: "NOx emitted" })).toContainText("Draft saved");
  await expect(valueCell(page, /^NOx emitted, Q3 2026$/)).toHaveValue("1700");
  // Drafts only: nothing went for review.
  expect(calls.some((c) => c.path.endsWith("/kpi/values/submit"))).toBe(false);
});

test("at 390 px the table scrolls inside its panel, not the page", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await kpiApp(page, { role: "User", user: RAVI });
  await open(page);
  await expect(page.getByTestId("kpi-table-row").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test("with the switch off there's no table view and no template", async ({ page }) => {
  await kpiApp(page, { role: "User", user: RAVI, enabled: false });
  await open(page);
  await expect(page.getByText("KPI tracking isn't turned on for your company.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Download template" })).toHaveCount(0);
  await expect(page.getByTestId("kpi-table-row")).toHaveCount(0);
});
