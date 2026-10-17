import { type Page, expect, test } from "@playwright/test";
import { MIA, RAVI, kpiApp } from "./kpiMockApi";

/**
 * KPI-8 · Approvals → KPIs (05-ux S4), against the stateful KPI mocks: Mia
 * reviews September's values of three plants (Ready / Needs attention),
 * approves all ready with undo, rejects with a reason (Ravi then sees it
 * under Sent back), edits a value in the drawer and closes August.
 */

/** The emissions side of Approvals: nothing waiting. */
const emissions = (url: URL) => {
  if (url.pathname.endsWith("/user/emissions/batches")) return [];
  if (url.pathname.includes("/user/emissions")) return { data: [], total: 0, summary: { total_emission: 0, pending_count: 0, approved_count: 0, rejected_count: 0 } };
  return undefined;
};
const app = (page: Page, opts: { enabled?: boolean } = {}) => kpiApp(page, { role: "Manager", user: MIA, other: emissions, ...opts });

const open = (page: Page, query = "") => page.goto(`/data/approvals?view=kpi${query}`);
const rows = (page: Page) => page.getByRole("tabpanel").getByTestId("kpi-review-row");
const approveCalls = (calls: { method: string; path: string; body: unknown }[]) => calls.filter((c) => c.path.endsWith("/kpi/values/approve"));

test("Ready and Needs attention, then Approve all ready with an undo, then for real", async ({ page }) => {
  const calls = await app(page);
  await open(page);
  await expect(page.getByRole("heading", { name: "Approvals", level: 1 })).toBeVisible();
  await expect(page.getByRole("tab", { name: /KPIs/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: /Ready/ })).toContainText("4");
  await expect(page.getByRole("tab", { name: /Needs attention/ })).toContainText("2");
  await expect(page.getByText("These passed every check: in range, evidence attached, units fine.")).toBeVisible();
  await expect(rows(page)).toHaveCount(4);
  // Waste generated at Dammam: 9.8 t against 10.4 t last September.
  await expect(rows(page).filter({ hasText: "Dammam" })).toContainText("−6 %");

  await page.getByRole("button", { name: "Approve all 4 ready" }).click();
  await expect(page.getByText("Approved 4 values.")).toBeVisible();
  await expect(rows(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(rows(page)).toHaveCount(4);
  expect(approveCalls(calls)).toHaveLength(0);

  await page.getByRole("button", { name: "Approve all 4 ready" }).click();
  await expect.poll(() => approveCalls(calls).length, { timeout: 15_000 }).toBe(1);
  expect(approveCalls(calls)[0].body).toEqual({ ids: [9, 7, 11, 13], only_ready: true });
  await expect(page.getByText("Nothing is ready to approve.", { exact: false })).toBeVisible();
});

test("a held value says why; reject it with a reason chip, and the contributor sees it under Sent back", async ({ page, browser }) => {
  const calls = await app(page);
  await open(page, "&group=attention");
  const held = rows(page).filter({ hasText: "Water withdrawn" });
  await expect(held).toContainText("3× last September");
  await expect(held).toContainText("New cooling tower filled");
  await expect(held).toContainText("+213 %");
  await expect(rows(page).filter({ hasText: "Matola" })).toContainText("No evidence");

  // The drawer: question, value, history, last periods.
  await held.click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("heading", { name: "How much water did Dammam take in during September 2026?" })).toBeVisible();
  await expect(drawer.getByTestId("kpi-review-value")).toHaveText("3,600 m³");
  await expect(drawer.getByText("Held for a look")).toBeVisible();
  await expect(drawer.getByText("Entered by Sara Ali")).toBeVisible();
  await drawer.getByRole("button", { name: "Reject" }).click();

  const modal = page.getByRole("alertdialog", { name: "Reject this value?" });
  await modal.getByRole("button", { name: "Looks too high" }).click();
  await modal.getByRole("button", { name: "Reject" }).click();
  await expect(page.getByText("Value sent back")).toBeVisible();
  const reject = calls.find((c) => c.path.endsWith("/kpi/values/reject"));
  expect(reject?.body).toEqual({ ids: [10], reason: "Looks too high" });
  await expect(rows(page)).toHaveCount(1);

  // Ravi's own pending value at Bahrain plant, sent back from the Ready group.
  await page.getByRole("tab", { name: /Ready/ }).click();
  await rows(page).filter({ hasText: "Waste recovered" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reject" }).click();
  const second = page.getByRole("alertdialog", { name: "Reject this value?" });
  await second.getByRole("textbox", { name: "Reason" }).fill("Please add the recycler's receipt");
  await second.getByRole("button", { name: "Reject" }).click();
  await expect(page.getByText("Ravi Kumar sees your reason under Sent back.")).toBeVisible();

  const ravi = await browser.newPage();
  await kpiApp(ravi, { role: "User", user: RAVI, keepState: true });
  await ravi.goto("/kpi?period=2026-09&tab=sent_back");
  const sentBack = ravi.getByRole("tabpanel").getByTestId("kpi-row").filter({ hasText: "Waste recovered" });
  await expect(sentBack).toContainText("Please add the recycler's receipt");
  await ravi.close();
});

test("edit a pending value in the drawer with a reason; it stays pending", async ({ page }) => {
  const calls = await app(page);
  await open(page, "&group=attention");
  await rows(page).filter({ hasText: "Water withdrawn" }).click();
  const drawer = page.getByRole("dialog");
  await drawer.getByRole("button", { name: "Edit" }).click();
  await drawer.getByLabel("Amount").fill("1200");
  await drawer.getByRole("button", { name: "Save changes" }).click();
  await expect(drawer.getByRole("alert")).toContainText("Say why you changed it");
  await drawer.getByLabel("Why are you changing it?").fill("The 3,600 was the whole quarter");
  await drawer.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Change saved")).toBeVisible();
  const put = calls.filter((c) => c.method === "PUT" && c.path.endsWith("/kpi/values")).at(-1);
  expect(put?.body).toMatchObject({ items: [{ id: 10, value_numeric: 1200, unit: "m³", reason: "The 3,600 was the whole quarter" }] });
  await expect(drawer.getByTestId("kpi-review-value")).toHaveText("1,200 m³");
});

test("keyboard: J moves, A approves with undo", async ({ page }) => {
  await app(page);
  await open(page);
  await expect(rows(page)).toHaveCount(4);
  await page.locator("body").press("j");
  await expect(rows(page).first()).toBeFocused();
  await page.keyboard.press("a");
  await expect(rows(page)).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
});

test("close a period: September has work left; August locks and reopens with a reason", async ({ page }) => {
  const calls = await app(page);
  await open(page, "&step=close&period=2026-09");
  await expect(page.getByRole("heading", { name: "Close September 2026" })).toBeVisible();
  await expect(page.getByText(/values are still missing or waiting/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Lock September 2026 for 3 sites" })).toBeDisabled();
  await expect(page.getByRole("list", { name: "Left before you can lock" })).toContainText("Waiting for approval");

  await open(page, "&step=close&period=2026-08");
  await expect(page.getByRole("heading", { name: "Close August 2026" })).toBeVisible();
  await expect(page.getByText("Everything is in. Locking makes August 2026 final for KPI reports.")).toBeVisible();
  await page.getByRole("button", { name: "Lock August 2026 for 3 sites" }).click();
  await expect(page.getByText("August 2026 is locked")).toBeVisible();
  expect(calls.filter((c) => c.path.endsWith("/kpi/periods/lock")).map((c) => c.body)).toEqual([1, 2, 3].map((site_id) => ({ year: 2026, period: 8, site_id })));
  await expect(page.getByTestId("kpi-close-site").filter({ hasText: "Dammam" })).toContainText("Locked");

  await page.getByTestId("kpi-close-site").filter({ hasText: "Dammam" }).getByRole("button", { name: "Reopen" }).click();
  const dialog = page.getByRole("dialog", { name: "Reopen August 2026 for Dammam?" });
  await dialog.getByLabel("Reason").fill("Meter reading corrected");
  await dialog.getByRole("button", { name: "Reopen" }).click();
  await expect(page.getByText("August 2026 is open again for Dammam")).toBeVisible();
  expect(calls.find((c) => c.path.endsWith("/kpi/periods/unlock"))?.body).toEqual({ year: 2026, period: 8, site_id: 2, reason: "Meter reading corrected" });
});

test("at 390 px the review list and the drawer fit the screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await app(page);
  await open(page);
  await expect(rows(page).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await rows(page).first().click();
  const box = await page.getByRole("dialog").boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(389);
});

test("with the switch off there's no KPIs tab and ?view=kpi shows emissions", async ({ page }) => {
  await app(page, { enabled: false });
  await open(page);
  await expect(page.getByRole("heading", { name: "Emissions", level: 1 })).toBeVisible();
  await expect(page.getByRole("tab", { name: /KPIs/ })).toHaveCount(0);
  await expect(page.getByTestId("kpi-review-row")).toHaveCount(0);
});
